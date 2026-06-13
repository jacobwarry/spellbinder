<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSegmentsStore, useCollectionStore, useBindersStore, usePlansStore } from '@/stores'
import { getCachedCards } from '@/api/scryfall'
import type { ScryfallCard } from '@/types'
import { useAllPlacements, buildCardLocationMap } from '@/composables/useAllPlacements'
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
import { Database, TriangleAlert, Sparkles, ArrowRight, Search, ArrowUp } from 'lucide-vue-next'

const router = useRouter()

// No emits needed - navigation handled by App.vue header

const segmentsStore = useSegmentsStore()
const collectionStore = useCollectionStore()
const bindersStore = useBindersStore()
const plansStore = usePlansStore()

const searchMode = ref<'quick' | 'advanced'>('quick')
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
const allCards = ref<Map<string, { card: ScryfallCard; segmentId: string; segmentName: string; cardIndex: number }>>(new Map())
const isLoading = ref(false)
let isFetching = false // Guard against concurrent fetches

// Advanced search filters - draft values (what user is typing/selecting)
const draftNameQuery = ref('')
const draftTypeFilter = ref<string[]>([])
const draftColorFilter = ref<string[]>([])
const draftCommanderIdentity = ref(false)
const draftRarityFilter = ref<string[]>([])
const draftOwnershipFilter = ref<string[]>(['owned'])
const draftCmcMin = ref<number | ''>('')
const draftCmcMax = ref<number | ''>('')

// Advanced search filters - active values (used for actual filtering)
const advancedNameQuery = ref('')
const advancedTypeFilter = ref<string[]>([])
const advancedColorFilter = ref<string[]>([])
const advancedCommanderIdentity = ref(false)
const advancedRarityFilter = ref<string[]>([])
const advancedOwnershipFilter = ref<string[]>(['owned'])
const advancedCmcMin = ref<number | ''>('')
const advancedCmcMax = ref<number | ''>('')
const advancedSearchTriggered = ref(false)

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

    // Sort by set name (alphabetically), then by collector number
    return results.sort((a, b) => {
      // First, sort by set name (fallback to set code if set_name is missing)
      const setNameA = a.card.set_name || a.card.set || ''
      const setNameB = b.card.set_name || b.card.set || ''
      const setNameComparison = setNameA.localeCompare(setNameB)
      if (setNameComparison !== 0) return setNameComparison

      // Then, sort by collector number (using natural sort)
      return a.card.collector_number.localeCompare(b.card.collector_number, undefined, { numeric: true })
    })
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

    // Sort by set name (alphabetically), then by collector number
    return results.sort((a, b) => {
      // First, sort by set name (fallback to set code if set_name is missing)
      const setNameA = a.card.set_name || a.card.set || ''
      const setNameB = b.card.set_name || b.card.set || ''
      const setNameComparison = setNameA.localeCompare(setNameB)
      if (setNameComparison !== 0) return setNameComparison

      // Then, sort by collector number (using natural sort)
      return a.card.collector_number.localeCompare(b.card.collector_number, undefined, { numeric: true })
    })
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

// Keep scrollMargin accurate as the controls above the list change height.
onMounted(updateListOffset)
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

    if (uniqueCardIds.length > 0) {
      const cardMap = await getCachedCards(uniqueCardIds)

      // Build the search index
      for (const [cardId, segments] of cardIdToSegments) {
        const card = cardMap.get(cardId)
        if (card) {
          // Add each instance of the card (in different segments or positions)
          segments.forEach(({ segmentId, segmentName, cardIndex }) => {
            const key = `${segmentId}:${cardIndex}`
            allCards.value.set(key, { card, segmentId, segmentName, cardIndex })
          })
        }
      }
    }
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
      <div v-else class="mx-auto w-full max-w-300 px-6 sm:px-8">
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
                <label class="text-sm font-medium text-ink-soft">Card type</label>
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

            <div class="flex justify-end border-t border-line pt-4">
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
                <CardTile
                  v-for="result in resultRows[vRow.index]"
                  :key="`${result.segmentId}:${result.cardIndex}`"
                  :name="result.card.name"
                  :set="result.card.set.toUpperCase()"
                  :number="result.card.collector_number"
                  :color="colorOf(result.card)"
                  :rarity="rarityLabel(result.card.rarity)"
                  :status="result.isOwned ? 'owned' : result.isSkipped ? 'skipped' : 'missing'"
                  :image="result.card.image_uris?.normal || result.card.card_faces?.[0]?.image_uris?.normal"
                  :location="locationLabel(result.segmentId, result.cardIndex)"
                />
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
