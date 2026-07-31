<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSegmentsStore, useCollectionStore, useBindersStore, usePlansStore, usePricesStore } from '@/stores'
import { getCachedCards } from '@/api/scryfall'
import { specialFinishLabel } from '@/utils/finish'
import type { ScryfallCard } from '@/types'
import { useAllPlacements, buildCardLocationMap } from '@/composables/useAllPlacements'
import { useCollectionSearch } from '@/composables/useCollectionSearch'
import MultiSelectDropdown from '@/components/MultiSelectDropdown.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented'
import ManaChip from '@/components/common/ManaChip.vue'
import CardTile from '@/components/common/CardTile.vue'
import CardSizeControl from '@/components/common/CardSizeControl.vue'
import type { Mana } from '@/components/common/types'
import { useCardSize } from '@/composables/useCardSize'
import { useElementSize } from '@vueuse/core'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import { Select } from '@/components/ui/select'
import { Database, TriangleAlert, Sparkles, ArrowRight, Search, ArrowUp, ArrowDown, RotateCcw } from 'lucide-vue-next'

const router = useRouter()

// No emits needed - navigation handled by App.vue header

const segmentsStore = useSegmentsStore()
const collectionStore = useCollectionStore()
const bindersStore = useBindersStore()
const plansStore = usePlansStore()
const pricesStore = usePricesStore()

// Search criteria + the built card index live in a module-scoped composable so they
// survive leaving this view (open a card, hit Back) without being reset or rebuilt.
const {
  searchMode,
  searchQuery,
  debouncedSearchQuery,
  draftNameQuery,
  draftTypeFilter,
  draftColorFilter,
  draftCommanderIdentity,
  draftRarityFilter,
  draftOwnershipFilter,
  draftCmcMin,
  draftCmcMax,
  advancedNameQuery,
  advancedTypeFilter,
  advancedColorFilter,
  advancedCommanderIdentity,
  advancedRarityFilter,
  advancedOwnershipFilter,
  advancedCmcMin,
  advancedCmcMax,
  advancedSearchTriggered,
  sortField,
  sortDir,
  allCards,
  indexSignature,
  savedScroll
} = useCollectionSearch()

// Only show the initial loading state before the index has ever been built.
const isLoading = ref(allCards.value.size === 0)
let isFetching = false // Guard against concurrent fetches

// Check if user has any sets
const hasNoSets = computed(() => plansStore.plans.length === 0)

function navigateToSets() {
  router.push('/sets?create=true')
}

const rarityOptions = [
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'mythic', label: 'Mythic' }
]
const ownershipOptions = [
  { value: 'owned', label: 'Owned' },
  { value: 'missing', label: 'Missing' },
  { value: 'skipped', label: 'Skipped' }
]
const manaColors = ['W', 'U', 'B', 'R', 'G', 'C'] as const

function toggleDraftColor(c: string) {
  draftColorFilter.value = draftColorFilter.value.includes(c)
    ? draftColorFilter.value.filter((x) => x !== c)
    : [...draftColorFilter.value, c]
}

// Apply draft filters to active filters
function applyAdvancedFilters() {
  advancedSearchTriggered.value = true
  advancedNameQuery.value = draftNameQuery.value
  advancedTypeFilter.value = [...draftTypeFilter.value]
  advancedColorFilter.value = [...draftColorFilter.value]
  advancedCommanderIdentity.value = draftCommanderIdentity.value
  advancedRarityFilter.value = [...draftRarityFilter.value]
  advancedOwnershipFilter.value = [...draftOwnershipFilter.value]
  advancedCmcMin.value = draftCmcMin.value
  advancedCmcMax.value = draftCmcMax.value
}

// Reset every advanced filter back to its default and clear the applied results.
function resetAdvancedFilters() {
  draftNameQuery.value = ''
  draftTypeFilter.value = []
  draftColorFilter.value = []
  draftCommanderIdentity.value = false
  draftRarityFilter.value = []
  draftOwnershipFilter.value = ['owned']
  draftCmcMin.value = ''
  draftCmcMax.value = ''
  advancedSearchTriggered.value = false
}

const typeOptions = [
  {
    label: 'Types',
    options: [
      { label: 'Artifact', value: 'Artifact' },
      { label: 'Battle', value: 'Battle' },
      { label: 'Conspiracy', value: 'Conspiracy' },
      { label: 'Creature', value: 'Creature' },
      { label: 'Dungeon', value: 'Dungeon' },
      { label: 'Emblem', value: 'Emblem' },
      { label: 'Enchantment', value: 'Enchantment' },
      { label: 'Hero', value: 'Hero' },
      { label: 'Instant', value: 'Instant' },
      { label: 'Kindred', value: 'Kindred' },
      { label: 'Land', value: 'Land' },
      { label: 'Phenomenon', value: 'Phenomenon' },
      { label: 'Plane', value: 'Plane' },
      { label: 'Planeswalker', value: 'Planeswalker' },
      { label: 'Scheme', value: 'Scheme' },
      { label: 'Sorcery', value: 'Sorcery' },
      { label: 'Vanguard', value: 'Vanguard' }
    ]
  },
  {
    label: 'Supertypes',
    options: [
      { label: 'Basic', value: 'Basic' },
      { label: 'Elite', value: 'Elite' },
      { label: 'Legendary', value: 'Legendary' },
      { label: 'Ongoing', value: 'Ongoing' },
      { label: 'Snow', value: 'Snow' },
      { label: 'Token', value: 'Token' },
      { label: 'World', value: 'World' }
    ]
  },
  {
    label: 'Artifact Types',
    options: [
      { label: 'Attraction', value: 'Attraction' },
      { label: 'Blood', value: 'Blood' },
      { label: 'Clue', value: 'Clue' },
      { label: 'Contraption', value: 'Contraption' },
      { label: 'Equipment', value: 'Equipment' },
      { label: 'Food', value: 'Food' },
      { label: 'Fortification', value: 'Fortification' },
      { label: 'Gold', value: 'Gold' },
      { label: 'Treasure', value: 'Treasure' },
      { label: 'Vehicle', value: 'Vehicle' }
    ]
  },
  {
    label: 'Enchantment Types',
    options: [
      { label: 'Aura', value: 'Aura' },
      { label: 'Background', value: 'Background' },
      { label: 'Cartouche', value: 'Cartouche' },
      { label: 'Case', value: 'Case' },
      { label: 'Class', value: 'Class' },
      { label: 'Curse', value: 'Curse' },
      { label: 'Role', value: 'Role' },
      { label: 'Room', value: 'Room' },
      { label: 'Rune', value: 'Rune' },
      { label: 'Saga', value: 'Saga' },
      { label: 'Shard', value: 'Shard' },
      { label: 'Shrine', value: 'Shrine' }
    ]
  },
  {
    label: 'Land Types',
    options: [
      { label: 'Cave', value: 'Cave' },
      { label: 'Desert', value: 'Desert' },
      { label: 'Forest', value: 'Forest' },
      { label: 'Gate', value: 'Gate' },
      { label: 'Island', value: 'Island' },
      { label: 'Mountain', value: 'Mountain' },
      { label: 'Plains', value: 'Plains' },
      { label: 'Swamp', value: 'Swamp' }
    ]
  },
  {
    label: 'Spell Types',
    options: [
      { label: 'Adventure', value: 'Adventure' },
      { label: 'Arcane', value: 'Arcane' },
      { label: 'Lesson', value: 'Lesson' },
      { label: 'Trap', value: 'Trap' }
    ]
  },
  {
    label: 'Creature Types (Common)',
    options: [
      { label: 'Angel', value: 'Angel' },
      { label: 'Assassin', value: 'Assassin' },
      { label: 'Barbarian', value: 'Barbarian' },
      { label: 'Bat', value: 'Bat' },
      { label: 'Beast', value: 'Beast' },
      { label: 'Bird', value: 'Bird' },
      { label: 'Cat', value: 'Cat' },
      { label: 'Cleric', value: 'Cleric' },
      { label: 'Construct', value: 'Construct' },
      { label: 'Demon', value: 'Demon' },
      { label: 'Devil', value: 'Devil' },
      { label: 'Dinosaur', value: 'Dinosaur' },
      { label: 'Dog', value: 'Dog' },
      { label: 'Dragon', value: 'Dragon' },
      { label: 'Drake', value: 'Drake' },
      { label: 'Druid', value: 'Druid' },
      { label: 'Dwarf', value: 'Dwarf' },
      { label: 'Eldrazi', value: 'Eldrazi' },
      { label: 'Elemental', value: 'Elemental' },
      { label: 'Elephant', value: 'Elephant' },
      { label: 'Elf', value: 'Elf' },
      { label: 'Faerie', value: 'Faerie' },
      { label: 'Fish', value: 'Fish' },
      { label: 'Fox', value: 'Fox' },
      { label: 'Fungus', value: 'Fungus' },
      { label: 'Giant', value: 'Giant' },
      { label: 'Goblin', value: 'Goblin' },
      { label: 'God', value: 'God' },
      { label: 'Golem', value: 'Golem' },
      { label: 'Griffin', value: 'Griffin' },
      { label: 'Horror', value: 'Horror' },
      { label: 'Horse', value: 'Horse' },
      { label: 'Human', value: 'Human' },
      { label: 'Hydra', value: 'Hydra' },
      { label: 'Insect', value: 'Insect' },
      { label: 'Knight', value: 'Knight' },
      { label: 'Kraken', value: 'Kraken' },
      { label: 'Merfolk', value: 'Merfolk' },
      { label: 'Monk', value: 'Monk' },
      { label: 'Ninja', value: 'Ninja' },
      { label: 'Octopus', value: 'Octopus' },
      { label: 'Ooze', value: 'Ooze' },
      { label: 'Orc', value: 'Orc' },
      { label: 'Phoenix', value: 'Phoenix' },
      { label: 'Phyrexian', value: 'Phyrexian' },
      { label: 'Pirate', value: 'Pirate' },
      { label: 'Plant', value: 'Plant' },
      { label: 'Rat', value: 'Rat' },
      { label: 'Rogue', value: 'Rogue' },
      { label: 'Samurai', value: 'Samurai' },
      { label: 'Scout', value: 'Scout' },
      { label: 'Serpent', value: 'Serpent' },
      { label: 'Shaman', value: 'Shaman' },
      { label: 'Shapeshifter', value: 'Shapeshifter' },
      { label: 'Skeleton', value: 'Skeleton' },
      { label: 'Snake', value: 'Snake' },
      { label: 'Soldier', value: 'Soldier' },
      { label: 'Sorcerer', value: 'Sorcerer' },
      { label: 'Spider', value: 'Spider' },
      { label: 'Spirit', value: 'Spirit' },
      { label: 'Vampire', value: 'Vampire' },
      { label: 'Warrior', value: 'Warrior' },
      { label: 'Werewolf', value: 'Werewolf' },
      { label: 'Wizard', value: 'Wizard' },
      { label: 'Wolf', value: 'Wolf' },
      { label: 'Zombie', value: 'Zombie' }
    ]
  }
]

// Normalize string for fuzzy matching (removes special characters)
function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[',\-:;!?.()]/g, '') // Remove common special characters
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim()
}

// Debounce search query (quick search only)
let debounceTimeout: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (newQuery) => {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout)
  }

  // Short debounce - just enough to batch rapid keystrokes
  debounceTimeout = setTimeout(() => {
    debouncedSearchQuery.value = newQuery
  }, 150)
})

// Sort controls (shown in the results bar). Applies to both quick and advanced results.
const sortOptions = [
  { value: 'set', label: 'Set' },
  { value: 'name', label: 'Name' },
  { value: 'cmc', label: 'Mana value' },
  { value: 'power', label: 'Power' },
  { value: 'toughness', label: 'Toughness' }
] as const

function toggleSortDir() {
  sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
}

// Power/toughness are printed as strings ("3", "*", "1+*", "X"). Parse a leading number;
// anything non-numeric (or a non-creature with no P/T) yields null and sorts to the end.
function parseStat(v?: string): number | null {
  if (v == null || v === '') return null
  const n = Number.parseFloat(v)
  return Number.isNaN(n) ? null : n
}

// Numeric compare honoring the active direction, but always pushing null (no value) last.
function compareNumeric(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return sortDir.value === 'asc' ? a - b : b - a
}

function compareText(a: string, b: string): number {
  const c = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  return sortDir.value === 'asc' ? c : -c
}

type SearchResult = {
  card: ScryfallCard
  segmentId: string
  segmentName: string
  cardIndex: number
  isOwned: boolean
  isSkipped: boolean
}

// Stable tiebreaker (and the default order): set name, then collector number.
function bySetThenNumber(a: SearchResult, b: SearchResult): number {
  const setNameA = a.card.set_name || a.card.set || ''
  const setNameB = b.card.set_name || b.card.set || ''
  const setNameComparison = setNameA.localeCompare(setNameB)
  if (setNameComparison !== 0) return setNameComparison
  return a.card.collector_number.localeCompare(b.card.collector_number, undefined, { numeric: true })
}

function applySort(results: SearchResult[]): SearchResult[] {
  return results.sort((a, b) => {
    let primary = 0
    switch (sortField.value) {
      case 'name':
        primary = compareText(a.card.name, b.card.name)
        break
      case 'cmc':
        primary = compareNumeric(a.card.cmc ?? null, b.card.cmc ?? null)
        break
      case 'power':
        primary = compareNumeric(parseStat(a.card.power), parseStat(b.card.power))
        break
      case 'toughness':
        primary = compareNumeric(parseStat(a.card.toughness), parseStat(b.card.toughness))
        break
      case 'set':
        primary = compareText(a.card.set_name || a.card.set || '', b.card.set_name || b.card.set || '')
        break
    }
    if (primary !== 0) return primary
    return bySetThenNumber(a, b)
  })
}

// Art Series cards (layout "art_series", or the bare "Card" type_line on older cached
// printings that predate storing layout) are collectible art, not playable cards — they
// carry no real colour identity or gameplay value.
function isArtCard(card: ScryfallCard): boolean {
  return card.layout === 'art_series' || card.type_line === 'Card'
}

const filteredCards = computed(() => {
  if (searchMode.value === 'quick') {
    // Quick search: just name matching
    if (!debouncedSearchQuery.value.trim()) return []

    const query = normalizeForSearch(debouncedSearchQuery.value)
    const results: Array<{
      card: ScryfallCard
      segmentId: string
      segmentName: string
      cardIndex: number
      isOwned: boolean
      isSkipped: boolean
    }> = []

    for (const [_, data] of allCards.value) {
      if (normalizeForSearch(data.card.name).includes(query)) {
        const ownershipKey = `${data.segmentId}:${data.cardIndex}`
        results.push({
          card: data.card,
          segmentId: data.segmentId,
          segmentName: data.segmentName,
          cardIndex: data.cardIndex,
          isOwned: collectionStore.isOwned(ownershipKey),
          isSkipped: collectionStore.isSkipped(ownershipKey)
        })
      }
    }

    return applySort(results)
  } else {
    // Advanced search: apply all filters
    // Don't return results until Search button is clicked
    if (!advancedSearchTriggered.value) return []

    const results: Array<{
      card: ScryfallCard
      segmentId: string
      segmentName: string
      cardIndex: number
      isOwned: boolean
      isSkipped: boolean
    }> = []

    for (const [_, data] of allCards.value) {
      const ownershipKey = `${data.segmentId}:${data.cardIndex}`
      const isOwned = collectionStore.isOwned(ownershipKey)
      const isSkipped = collectionStore.isSkipped(ownershipKey)

      // Filter by name (fuzzy matching - ignores special characters)
      if (advancedNameQuery.value.trim() && !normalizeForSearch(data.card.name).includes(normalizeForSearch(advancedNameQuery.value))) {
        continue
      }

      // Filter by type
      if (advancedTypeFilter.value.length > 0) {
        if (!data.card.type_line) {
          // Skip cards without type_line data (old cached cards)
          continue
        }
        const cardTypeLower = data.card.type_line.toLowerCase()
        const hasMatchingType = advancedTypeFilter.value.some(type => cardTypeLower.includes(type.toLowerCase()))
        if (!hasMatchingType) {
          continue
        }
      }

      // Filter by colors
      if (advancedColorFilter.value.length > 0) {
        // Art cards have no playable value or colour identity, so exclude them once
        // the user is filtering by colour (otherwise empty-identity art slips through,
        // e.g. it's a subset of every commander identity).
        if (isArtCard(data.card)) {
          continue
        }
        if (!data.card.color_identity) {
          // Skip cards without color_identity data (old cached cards)
          continue
        }
        const cardColors = data.card.color_identity || []

        if (advancedCommanderIdentity.value) {
          // Commander Identity mode: card colors must be a subset of selected colors
          const isValidForCommander = cardColors.every(color => advancedColorFilter.value.includes(color))
          if (!isValidForCommander) {
            continue
          }
        } else {
          // Normal mode: card must have at least one of the selected colors
          const hasMatchingColor = advancedColorFilter.value.some(color => cardColors.includes(color))
          if (!hasMatchingColor && !(advancedColorFilter.value.includes('C') && cardColors.length === 0)) {
            continue
          }
        }
      }

      // Filter by rarity
      if (advancedRarityFilter.value.length > 0 && !advancedRarityFilter.value.includes(data.card.rarity)) {
        continue
      }

      // Filter by ownership status
      const ownershipStatus = isOwned ? 'owned' : isSkipped ? 'skipped' : 'missing'
      if (!advancedOwnershipFilter.value.includes(ownershipStatus)) {
        continue
      }

      // Filter by CMC
      const cmc = data.card.cmc ?? 0
      if (advancedCmcMin.value !== '' && cmc < advancedCmcMin.value) {
        continue
      }
      if (advancedCmcMax.value !== '' && cmc > advancedCmcMax.value) {
        continue
      }

      results.push({
        card: data.card,
        segmentId: data.segmentId,
        segmentName: data.segmentName,
        cardIndex: data.cardIndex,
        isOwned,
        isSkipped
      })
    }

    return applySort(results)
  }
})

// Results: responsive column count from the measured list width, then
// row-virtualize the card grid against the document scroll (window virtualizer,
// since the page scrolls naturally). No pagination — the full set is windowed.
const listRef = ref<HTMLElement | null>(null)
const { width: gridWidth } = useElementSize(listRef)

const GRID_GAP = 16

// User-adjustable card size (tile min-width, px); columns auto-fit the width.
const cardSize = useCardSize('spellbinder-cardsize-search', 180)

// Distance from the top of the document to the start of the list (scrollMargin).
const listOffset = ref(0)
function updateListOffset() {
  listOffset.value = listRef.value
    ? listRef.value.getBoundingClientRect().top + window.scrollY
    : 0
}

// How many columns the result grid uses, derived from the chosen card size.
const columnCount = computed(() => {
  const w = gridWidth.value
  if (!w) return 1
  return Math.max(1, Math.floor((w + GRID_GAP) / (cardSize.value + GRID_GAP)))
})

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Short recap of the active search, shown in the sticky results bar.
const searchSummary = computed(() => {
  if (searchMode.value === 'quick') {
    return debouncedSearchQuery.value ? `"${debouncedSearchQuery.value}"` : ''
  }
  const parts: string[] = []
  if (advancedNameQuery.value) parts.push(`"${advancedNameQuery.value}"`)
  if (advancedTypeFilter.value.length) parts.push(`${advancedTypeFilter.value.length} type${advancedTypeFilter.value.length > 1 ? 's' : ''}`)
  if (advancedColorFilter.value.length) parts.push(advancedColorFilter.value.join(''))
  if (advancedRarityFilter.value.length) parts.push(advancedRarityFilter.value.join(', '))
  if (advancedOwnershipFilter.value.length && advancedOwnershipFilter.value.length < 3) parts.push(advancedOwnershipFilter.value.join(', '))
  return parts.join(' · ')
})

const resultRows = computed(() => {
  const cols = columnCount.value
  const items = filteredCards.value
  const rows: (typeof items)[] = []
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols))
  return rows
})

const estimatedRowHeight = computed(() => {
  const cols = columnCount.value
  const w = gridWidth.value || cardSize.value * cols
  const colWidth = (w - (cols - 1) * GRID_GAP) / cols
  return colWidth * (88 / 63) + 96 + GRID_GAP // image + body + row gap
})

const rowVirtualizer = useWindowVirtualizer(
  computed(() => ({
    count: resultRows.value.length,
    estimateSize: () => estimatedRowHeight.value,
    overscan: 5,
    gap: GRID_GAP,
    scrollMargin: listOffset.value
  }))
)

// Restore the document scroll from the last visit. Two things must be true before a
// scrollTo lands correctly: the grid must have its real width (so the FINAL column
// count — hence row count and total height — is settled, not the 1-column fallback used
// before measurement), and, on a rebuild, the async index load must have finished so the
// list is rendered at all. So: wait for a real gridWidth, then hold the target across a
// short settle window while the virtualizer finishes measuring rows.
const pendingScroll = savedScroll.value
onMounted(() => {
  updateListOffset()
  if (pendingScroll <= 0) return
  const target = pendingScroll

  const holdScroll = () => {
    // Re-apply every frame for a brief window so estimate→measured height adjustments
    // can't leave us short, then release control back to the user.
    const deadline = performance.now() + 500
    const frame = () => {
      window.scrollTo(0, target)
      if (performance.now() < deadline) requestAnimationFrame(frame)
    }
    nextTick(() => requestAnimationFrame(frame))
  }

  if (gridWidth.value > 0) {
    holdScroll()
  } else {
    const stop = watch(gridWidth, (w) => {
      if (w > 0) {
        stop()
        holdScroll()
      }
    })
  }
})

// Remember where the user was so Back returns them to the same spot.
onBeforeUnmount(() => {
  savedScroll.value = window.scrollY
})
watch(
  [gridWidth, () => searchMode.value, () => advancedSearchTriggered.value, () => filteredCards.value.length],
  () => nextTick(updateListOffset)
)

function measureRow(el: unknown) {
  if (el) rowVirtualizer.value.measureElement(el as Element)
}

// Derive a single representative colour for the tile gradient fallback.
function colorOf(card: ScryfallCard): Mana {
  const ci = card.color_identity ?? []
  return ci.length === 1 ? (ci[0] as Mana) : 'C'
}
function rarityLabel(r: string): string {
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : ''
}
function locationLabel(segmentId: string, cardIndex: number): string | undefined {
  const loc = getCardLocation(segmentId, cardIndex)
  return loc ? `${loc.binderName} · P${loc.pageNumber} · S${loc.slotOnPage}` : undefined
}

// Special foil treatment label (Surge, Etched, …), or null for regular/non-foil printings.
function finishLabelOf(card: ScryfallCard): string | null {
  return specialFinishLabel(card.promo_types, card.finishes)
}

// Owned finishes for this position (a card can be owned in both) — drive the frame + muting.
function ownsNonFoilOf(result: SearchResult): boolean {
  return collectionStore.isOwnedNonFoil(`${result.segmentId}:${result.cardIndex}`)
}
function ownsFoilOf(result: SearchResult): boolean {
  return collectionStore.isOwnedFoil(`${result.segmentId}:${result.cardIndex}`)
}

// Whether the tile gets the iridescent foil frame: the user owns the foil finish at this
// position, or it's an inherently-foil printing (foil-only or a special treatment).
function isFoilResult(result: SearchResult): boolean {
  const foilOnly = !!result.card.finishes && !result.card.finishes.includes('nonfoil')
  return ownsFoilOf(result) || foilOnly || finishLabelOf(result.card) !== null
}

// Latest fetched prices for the card (both finishes); undefined until prices are fetched.
function cardPrice(result: SearchResult) {
  return pricesStore.getPrice(result.card.id)
}

// Placements across all plans (shared composable) + an O(1) card-location lookup.
const { allPlacements } = useAllPlacements()

const locationMap = computed(() =>
  buildCardLocationMap(allPlacements.value.values(), (id) => bindersStore.getBinder(id)?.name)
)

function getCardLocation(segmentId: string, cardIndex: number) {
  return locationMap.value.get(`${segmentId}:${cardIndex}`) ?? null
}

async function clearCardCache() {
  if (!confirm('This will clear all cached card data and reload the page. Cards will be re-fetched with complete data. Continue?')) {
    return
  }

  try {
    const dbs = await indexedDB.databases()
    for (const db of dbs) {
      if (db.name === 'spellbinder-cache') {
        indexedDB.deleteDatabase(db.name)
        alert('Cache cleared! The page will reload.')
        window.location.reload()
        return
      }
    }
    alert('No cache found to clear.')
  } catch (error) {
    alert('Error clearing cache. Try manually deleting in DevTools > Application > IndexedDB')
  }
}

// Cheap fingerprint of the collection's shape; a change here means the search index
// must be rebuilt. Captures adds/removes per segment (id + card count).
function collectionSignature(): string {
  return segmentsStore.segments.map((s) => `${s.id}:${s.cardIds.length}`).join('|')
}

onMounted(async () => {
  // Dev-only console helpers — dynamically imported so the debug module is
  // tree-shaken out of the production bundle.
  if (import.meta.env.DEV) {
    const dbg = await import('@/utils/debugCollection')
    ;(window as any).debugCollection = dbg.debugCollectionData
    ;(window as any).cleanupCollection = dbg.cleanupInvalidKeys
    ;(window as any).findDuplicates = dbg.findDuplicateCardsInSegments
    ;(window as any).checkOwnership = dbg.findOwnershipInconsistencies
    ;(window as any).fixOwnership = dbg.fixOwnershipInconsistencies
    ;(window as any).cleanupOrphans = dbg.cleanupOrphanedSegments
    ;(window as any).clearCache = clearCardCache
    ;(window as any).checkPlacements = () => {
      console.log('All placements (by plan):', allPlacements.value)
      console.log('Plans:', plansStore.plans)
    }
  }

  // Reuse the cached index when the collection is unchanged — makes returning to a
  // prior search instant (no rebuild, no loading flash).
  const signature = collectionSignature()
  if (indexSignature.value === signature && allCards.value.size > 0) {
    isLoading.value = false
    return
  }

  // Prevent concurrent fetches
  if (isFetching) {
    return
  }

  isFetching = true
  isLoading.value = true

  try {
    // Get all unique card IDs from all segments
    const cardIdToSegments = new Map<string, Array<{ segmentId: string; segmentName: string; cardIndex: number }>>()

    for (const segment of segmentsStore.segments) {
      segment.cardIds.forEach((cardId, index) => {
        if (!cardIdToSegments.has(cardId)) {
          cardIdToSegments.set(cardId, [])
        }
        cardIdToSegments.get(cardId)!.push({
          segmentId: segment.id,
          segmentName: segment.name,
          cardIndex: index
        })
      })
    }

    // Fetch card data for all unique card IDs
    const uniqueCardIds = Array.from(cardIdToSegments.keys())
    const next = new Map<string, { card: ScryfallCard; segmentId: string; segmentName: string; cardIndex: number }>()

    if (uniqueCardIds.length > 0) {
      const cardMap = await getCachedCards(uniqueCardIds)

      // Build the search index
      for (const [cardId, segments] of cardIdToSegments) {
        const card = cardMap.get(cardId)
        if (card) {
          // Add each instance of the card (in different segments or positions)
          segments.forEach(({ segmentId, segmentName, cardIndex }) => {
            const key = `${segmentId}:${cardIndex}`
            next.set(key, { card, segmentId, segmentName, cardIndex })
          })
        }
      }
    }

    allCards.value = next
    indexSignature.value = signature
  } catch (error) {
    // Error fetching cards
  } finally {
    isLoading.value = false
    isFetching = false
  }
})
</script>

<template>
  <div class="home-page">
    <main class="main-content">
      <!-- First-run / empty state for new users -->
      <div v-if="hasNoSets" class="flex justify-center px-4 py-10 sm:py-16">
        <div class="w-full max-w-2xl rounded-2xl border border-line bg-surface p-8 sm:p-10 shadow-(--shadow-1)">
          <div class="flex items-center gap-2 text-brand text-xs font-semibold uppercase tracking-[0.12em]">
            <Sparkles :size="15" /> Welcome
          </div>
          <h1 class="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-3">Welcome to Spellbinder</h1>
          <p class="text-ink-soft text-lg leading-relaxed mt-3">
            Your personal Magic: The Gathering collection manager. Track your cards across multiple sets,
            organize them in binders, and find any card in seconds.
          </p>
          <p class="text-ink-faint mt-3">Get started by creating your first set.</p>

          <!-- Local-storage notice (reframed from the old emoji warning) -->
          <div class="mt-6 rounded-xl border border-line bg-(--accent-soft) p-4">
            <div class="flex items-center gap-2 font-semibold text-foreground">
              <Database :size="18" class="text-brand" /> Local data storage
            </div>
            <p class="text-sm text-ink-soft leading-relaxed mt-2">
              Everything is stored locally in your browser (<strong>localStorage</strong> + <strong>IndexedDB</strong>).
              Your data stays on this device and is never sent to a server.
            </p>
            <ul class="text-sm text-ink-soft leading-relaxed mt-2 list-disc pl-5 flex flex-col gap-1">
              <li>Your data stays on this device and browser only</li>
              <li>It isn't available on other devices or browsers (yet)</li>
              <li>Completely private — nothing leaves your machine</li>
            </ul>
            <div
              class="mt-3 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--skipped)_35%,transparent)] bg-(--skipped-soft) p-3 text-sm leading-relaxed text-foreground"
            >
              <TriangleAlert :size="18" class="shrink-0 mt-0.5" style="color: var(--skipped)" />
              <span><strong>Heads up:</strong> clearing your browser cache, localStorage, or IndexedDB permanently deletes everything — be careful when clearing browser data.</span>
            </div>
          </div>

          <Button class="mt-7 w-full sm:w-auto" size="lg" @click="navigateToSets">
            Create your first set
            <ArrowRight :size="18" />
          </Button>
        </div>
      </div>

      <!-- Search section (only shown when user has sets) -->
      <div v-else class="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div class="pt-6">
          <h2 class="font-display text-xl font-bold tracking-tight">Search your collection</h2>
          <p v-if="isLoading" class="mt-4 italic text-ink-soft">Loading cards…</p>
          <template v-else>
            <SegmentedControl
              v-model="searchMode"
              :options="[{ value: 'quick', label: 'Quick Search' }, { value: 'advanced', label: 'Advanced Search' }]"
              class="mt-4 mb-4"
            />

          <!-- Quick search (same field structure as advanced to avoid a layout shift) -->
          <div v-if="searchMode === 'quick'" class="rounded-xl border border-line bg-surface p-5 shadow-(--shadow-1)">
            <div class="flex flex-col gap-2">
              <label for="quick-search" class="text-sm font-medium text-ink-soft">Card name</label>
              <div class="relative">
                <Search :size="18" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <Input id="quick-search" v-model="searchQuery" placeholder="Search by card name…" class="pl-10" />
              </div>
            </div>
          </div>

          <!-- Advanced search -->
          <div v-else class="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 shadow-(--shadow-1)">
            <div class="grid gap-5 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <label for="adv-name" class="text-sm font-medium text-ink-soft">Card name</label>
                <Input id="adv-name" v-model="draftNameQuery" placeholder="Enter card name…" @keyup.enter="applyAdvancedFilters" />
              </div>
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium text-ink-soft">Card type</label>
                  <button
                    v-if="draftTypeFilter.length"
                    type="button"
                    class="text-xs font-medium text-ink-faint transition-colors hover:text-foreground"
                    @click="draftTypeFilter = []"
                  >
                    Clear
                  </button>
                </div>
                <MultiSelectDropdown
                  v-model="draftTypeFilter"
                  :groups="typeOptions"
                  placeholder="Select card types…"
                />
              </div>
            </div>

            <div class="grid gap-5 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium text-ink-soft">Colors</label>
                <div class="flex gap-2">
                  <button
                    v-for="c in manaColors"
                    :key="c"
                    type="button"
                    :aria-pressed="draftColorFilter.includes(c)"
                    :aria-label="c"
                    class="rounded-full outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
                    @click="toggleDraftColor(c)"
                  >
                    <ManaChip :color="c" :selected="draftColorFilter.includes(c)" :size="34" />
                  </button>
                </div>
                <label class="mt-1 inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" v-model="draftCommanderIdentity" class="h-4 w-4 accent-brand" />
                  Commander identity (only cards within selected colors)
                </label>
              </div>

              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium text-ink-soft">Rarity</label>
                <div class="flex flex-wrap gap-x-4 gap-y-2">
                  <label v-for="r in rarityOptions" :key="r.value" class="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                    <input type="checkbox" :value="r.value" v-model="draftRarityFilter" class="h-4 w-4 accent-brand" />
                    {{ r.label }}
                  </label>
                </div>
              </div>
            </div>

            <div class="grid gap-5 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium text-ink-soft">Mana value</label>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="draftCmcMin"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    placeholder="Min"
                    aria-label="Minimum mana value"
                    class="h-11 w-24 rounded-md border border-input bg-surface-2 px-3.5 text-base text-foreground placeholder:text-ink-faint outline-none transition-colors focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-(--accent-glow)"
                  />
                  <span class="text-sm text-ink-faint">to</span>
                  <input
                    v-model.number="draftCmcMax"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    placeholder="Max"
                    aria-label="Maximum mana value"
                    class="h-11 w-24 rounded-md border border-input bg-surface-2 px-3.5 text-base text-foreground placeholder:text-ink-faint outline-none transition-colors focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-(--accent-glow)"
                  />
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium text-ink-soft">Ownership</label>
                <div class="flex flex-wrap gap-x-4 gap-y-2">
                  <label v-for="o in ownershipOptions" :key="o.value" class="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                    <input type="checkbox" :value="o.value" v-model="draftOwnershipFilter" class="h-4 w-4 accent-brand" />
                    {{ o.label }}
                  </label>
                </div>
              </div>
            </div>

            <div class="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" @click="resetAdvancedFilters">
                <RotateCcw :size="16" /> Reset
              </Button>
              <Button class="min-w-30" @click="applyAdvancedFilters">
                <Search :size="18" /> Search
              </Button>
            </div>
          </div>

          </template>
        </div>

        <!-- Sticky results bar: keeps the count/recap + column control + back-to-top in view -->
        <div
          v-if="!isLoading && filteredCards.length > 0"
          class="sticky top-16 z-10 -mx-6 mt-4 flex items-center justify-between gap-3 border-b border-line bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-6 py-2.5 backdrop-blur-md sm:-mx-8 sm:px-8"
        >
          <p class="min-w-0 truncate text-sm">
            <span class="font-semibold tabular-nums">{{ filteredCards.length }}</span>
            <span class="text-ink-soft"> {{ filteredCards.length === 1 ? 'card' : 'cards' }}</span>
            <span v-if="searchSummary" class="text-ink-faint"> · {{ searchSummary }}</span>
          </p>
          <div class="flex shrink-0 items-center gap-3">
            <div class="flex items-center gap-1.5">
              <label for="sort-field" class="hidden text-[13px] text-ink-soft sm:inline">Sort</label>
              <div class="w-32">
                <Select id="sort-field" v-model="sortField" class="h-9 pr-9 text-[13px]">
                  <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="px-2.5"
                :title="sortDir === 'asc' ? 'Ascending' : 'Descending'"
                :aria-label="sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'"
                @click="toggleSortDir"
              >
                <ArrowUp v-if="sortDir === 'asc'" :size="15" />
                <ArrowDown v-else :size="15" />
              </Button>
            </div>
            <CardSizeControl v-model="cardSize" :min="140" :max="260" :step="10" class="hidden sm:flex" />
            <Button variant="outline" size="sm" @click="scrollToTop"><ArrowUp :size="15" /> Top</Button>
          </div>
        </div>

        <!-- Results (window-virtualized against the document scroll) -->
        <div v-if="!isLoading" ref="listRef" class="pb-8 pt-4">
          <div v-if="searchMode === 'quick' && debouncedSearchQuery && filteredCards.length === 0" class="py-6 text-center text-ink-soft">
            No cards found matching "{{ debouncedSearchQuery }}"
          </div>

          <div v-else-if="searchMode === 'advanced' && !advancedSearchTriggered" class="py-8 text-center italic text-ink-faint">
            Set your filters and click Search to find cards
          </div>

          <div v-else-if="searchMode === 'advanced' && advancedSearchTriggered && filteredCards.length === 0" class="py-6 text-center text-ink-soft">
            No cards found matching the selected filters
          </div>

          <div
            v-else-if="filteredCards.length > 0"
            :style="{ height: rowVirtualizer.getTotalSize() + 'px', position: 'relative', width: '100%' }"
          >
            <div
              v-for="vRow in rowVirtualizer.getVirtualItems()"
              :key="vRow.index"
              :data-index="vRow.index"
              :ref="measureRow"
              :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start - listOffset}px)` }"
            >
              <div class="grid gap-4" :style="{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }">
                <RouterLink
                  v-for="result in resultRows[vRow.index]"
                  :key="`${result.segmentId}:${result.cardIndex}`"
                  :to="`/card/${result.card.id}`"
                  class="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :title="`View ${result.card.name}`"
                >
                  <CardTile
                    :name="result.card.name"
                    :set="result.card.set.toUpperCase()"
                    :number="result.card.collector_number"
                    :color="colorOf(result.card)"
                    :rarity="rarityLabel(result.card.rarity)"
                    :status="result.isOwned ? 'owned' : result.isSkipped ? 'skipped' : 'missing'"
                    :image="result.card.image_uris?.normal || result.card.card_faces?.[0]?.image_uris?.normal"
                    :location="locationLabel(result.segmentId, result.cardIndex)"
                    :eur="cardPrice(result)?.eur"
                    :eur-foil="cardPrice(result)?.eurFoil"
                    :owns-non-foil="ownsNonFoilOf(result)"
                    :owns-foil="ownsFoilOf(result)"
                    :foil="isFoilResult(result)"
                    :finish-label="finishLabelOf(result.card)"
                  />
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.search-section {
  /* natural document flow; results window-virtualized */
}

</style>
