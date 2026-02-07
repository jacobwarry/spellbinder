<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSegmentsStore, useCollectionStore, useBindersStore, usePlansStore } from '@/stores'
import { getCachedCards } from '@/api/scryfall'
import type { ScryfallCard } from '@/types'
import { debugCollectionData, cleanupInvalidKeys, findDuplicateCardsInSegments, findOwnershipInconsistencies, fixOwnershipInconsistencies, cleanupOrphanedSegments } from '@/utils/debugCollection'
import { calculatePlacements, type PlacementResult } from '@/composables/usePlacement'
import MultiSelectDropdown from '@/components/MultiSelectDropdown.vue'

const router = useRouter()

// No emits needed - navigation handled by App.vue header

const segmentsStore = useSegmentsStore()
const collectionStore = useCollectionStore()
const bindersStore = useBindersStore()
const plansStore = usePlansStore()

const searchMode = ref<'quick' | 'advanced'>('quick')
const placementResult = ref<PlacementResult | null>(null)
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
const draftOwnershipFilter = ref<string[]>(['owned', 'missing', 'skipped'])
const draftCmcMin = ref<number | ''>('')
const draftCmcMax = ref<number | ''>('')

// Advanced search filters - active values (used for actual filtering)
const advancedNameQuery = ref('')
const advancedTypeFilter = ref<string[]>([])
const advancedColorFilter = ref<string[]>([])
const advancedCommanderIdentity = ref(false)
const advancedRarityFilter = ref<string[]>([])
const advancedOwnershipFilter = ref<string[]>(['owned', 'missing', 'skipped'])
const advancedCmcMin = ref<number | ''>('')
const advancedCmcMax = ref<number | ''>('')
const advancedSearchTriggered = ref(false)

// Check if user has any sets
const hasNoSets = computed(() => plansStore.plans.length === 0)

function navigateToSets() {
  router.push('/sets?create=true')
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

// Pagination
const currentPage = ref(1)
const itemsPerPage = ref(100)

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

const totalPages = computed(() => Math.ceil(filteredCards.value.length / itemsPerPage.value))

const paginatedResults = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return filteredCards.value.slice(start, end)
})

const visiblePages = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  const pages: (number | null)[] = []

  // Always show first page
  pages.push(1)

  // Calculate range around current page
  const rangeStart = Math.max(2, current - 2)
  const rangeEnd = Math.min(total - 1, current + 2)

  // Add ellipsis after first page if needed
  if (rangeStart > 2) {
    pages.push(null) // null represents ellipsis
  }

  // Add pages in range
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i)
  }

  // Add ellipsis before last page if needed
  if (rangeEnd < total - 1) {
    pages.push(null)
  }

  // Always show last page if there's more than one page
  if (total > 1) {
    pages.push(total)
  }

  return pages
})

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    // Scroll to top of results
    document.querySelector('.results')?.scrollIntoView({ behavior: 'smooth' })
  }
}

// Reset to page 1 when search changes
watch([debouncedSearchQuery, advancedNameQuery, advancedTypeFilter, advancedColorFilter, advancedCommanderIdentity, advancedRarityFilter, advancedOwnershipFilter, advancedCmcMin, advancedCmcMax], () => {
  currentPage.value = 1
})

// Calculate placements for ALL plans
const allPlacements = ref<Map<string, PlacementResult>>(new Map())

async function recalculateAllPlacements() {
  const newPlacements = new Map<string, PlacementResult>()

  for (const plan of plansStore.plans) {
    const segments = segmentsStore.getSegmentsInOrder(plan.segmentIds)
    const binders = bindersStore.getBindersInOrder(plan.binderIds)

    if (segments.length > 0 && binders.length > 0) {
      const result = await calculatePlacements(segments, binders)
      newPlacements.set(plan.id, result)
    }
  }

  allPlacements.value = newPlacements

  // Keep placementResult for the first plan for backwards compatibility
  const firstPlan = plansStore.plans[0]
  if (firstPlan) {
    placementResult.value = newPlacements.get(firstPlan.id) ?? null
  } else {
    placementResult.value = null
  }
}

// Watch for changes in plans, binders, or segments and recalculate
watch(() => [plansStore.plans, bindersStore.binders, segmentsStore.segments], () => {
  recalculateAllPlacements()
}, { deep: true })

onMounted(() => {
  recalculateAllPlacements()
})

// Precomputed location lookup map for O(1) access
const locationMap = computed(() => {
  const map = new Map<string, { binderName: string; pageNumber: number; slotOnPage: number }>()

  for (const [, result] of allPlacements.value) {
    for (const placement of result.placements) {
      const key = `${placement.segmentId}:${placement.cardIndexInSegment}`
      if (!map.has(key)) {
        const binder = bindersStore.getBinder(placement.binderId)
        if (binder) {
          map.set(key, {
            binderName: binder.name,
            pageNumber: placement.pageNumber,
            slotOnPage: placement.slotOnPage
          })
        }
      }
    }
  }

  return map
})

// Helper function to get card location info - O(1) lookup
function getCardLocation(segmentId: string, cardIndex: number): { binderName: string; pageNumber: number; slotOnPage: number } | null {
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
  // Expose debug functions to console
  ;(window as any).debugCollection = debugCollectionData
  ;(window as any).cleanupCollection = cleanupInvalidKeys
  ;(window as any).findDuplicates = findDuplicateCardsInSegments
  ;(window as any).checkOwnership = findOwnershipInconsistencies
  ;(window as any).fixOwnership = fixOwnershipInconsistencies
  ;(window as any).cleanupOrphans = cleanupOrphanedSegments
  ;(window as any).clearCache = clearCardCache
  ;(window as any).checkPlacements = () => {
    console.log('Placement Result:', placementResult.value)
    console.log('Total placements:', placementResult.value?.placements.length ?? 0)
    console.log('Plans:', plansStore.plans)
    console.log('First plan:', plansStore.plans[0])
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
      <!-- Hero section for new users -->
      <div v-if="hasNoSets" class="hero-section">
        <div class="hero-content">
          <h1 class="hero-title">Welcome to Spellbinder</h1>
          <p class="hero-description">
            Your personal Magic: The Gathering collection manager. Track your cards across multiple sets,
            organize them in binders, and quickly search through your entire collection.
          </p>
          <p class="hero-subtitle">
            Get started by creating your first set to begin building your collection.
          </p>

          <div class="storage-notice">
            <div class="storage-notice-header">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span>Local Data Storage</span>
            </div>
            <p class="storage-notice-text">
              This application stores all your decks and sets data locally in your browser using
              <strong>localStorage</strong> and <strong>IndexedDB</strong>. Your data remains entirely
              on this device and is never sent to any server, ensuring complete privacy. However, this
              also means there are a few important things to keep in mind:
            </p>
            <ul class="storage-notice-list">
              <li>Your decks and sets data stays on this device and browser only</li>
              <li>You cannot access your data on other devices or browsers (yet)</li>
              <li>Data is completely private - nothing is sent to any server</li>
            </ul>
            <p class="storage-notice-warning">
              <strong>⚠️ Warning:</strong> Clearing your browser's cache, localStorage, or IndexedDB
              will permanently delete all your decks and sets data. Please be careful when clearing browser data!
            </p>
          </div>

          <button @click="navigateToSets" class="btn btn-hero">
            Create Your First Set
          </button>
        </div>
      </div>

      <!-- Search section (only shown when user has sets) -->
      <div v-else class="search-section">
        <h2>Search Your Collection</h2>
        <p v-if="isLoading" class="loading-message">Loading cards...</p>
        <div v-else>
          <!-- Mode toggle tabs -->
          <div class="mode-tabs">
            <button
              @click="searchMode = 'quick'"
              class="mode-tab"
              :class="{ active: searchMode === 'quick' }"
            >
              Quick Search
            </button>
            <button
              @click="searchMode = 'advanced'"
              class="mode-tab"
              :class="{ active: searchMode === 'advanced' }"
            >
              Advanced Search
            </button>
          </div>

          <!-- Quick search -->
          <div v-if="searchMode === 'quick'" class="search-bar">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by card name..."
              class="search-input"
              autofocus
            />
          </div>

          <!-- Advanced search -->
          <div v-else class="advanced-search-form">
            <div class="form-row">
              <div class="form-group">
                <label>Card Name</label>
                <input
                  v-model="draftNameQuery"
                  type="text"
                  placeholder="Enter card name..."
                  class="form-input"
                />
              </div>
              <div class="form-group">
                <label>Card Type</label>
                <MultiSelectDropdown
                  v-model="draftTypeFilter"
                  :groups="typeOptions"
                  placeholder="Select card types..."
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Colors</label>
                <div class="checkbox-group">
                  <label class="checkbox-label">
                    <input type="checkbox" value="W" v-model="draftColorFilter" />
                    <span class="color-symbol white">W</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="U" v-model="draftColorFilter" />
                    <span class="color-symbol blue">U</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="B" v-model="draftColorFilter" />
                    <span class="color-symbol black">B</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="R" v-model="draftColorFilter" />
                    <span class="color-symbol red">R</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="G" v-model="draftColorFilter" />
                    <span class="color-symbol green">G</span>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="C" v-model="draftColorFilter" />
                    <span class="color-symbol colorless">C</span>
                  </label>
                </div>
                <div class="commander-identity-toggle">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="draftCommanderIdentity" />
                    Commander Identity (only show cards within selected colors)
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label>Rarity</label>
                <div class="checkbox-group">
                  <label class="checkbox-label">
                    <input type="checkbox" value="common" v-model="draftRarityFilter" />
                    Common
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="uncommon" v-model="draftRarityFilter" />
                    Uncommon
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="rare" v-model="draftRarityFilter" />
                    Rare
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="mythic" v-model="draftRarityFilter" />
                    Mythic
                  </label>
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Mana Value</label>
                <div class="range-inputs">
                  <input
                    v-model.number="draftCmcMin"
                    type="number"
                    placeholder="Min"
                    class="form-input small"
                    min="0"
                  />
                  <span class="range-separator">to</span>
                  <input
                    v-model.number="draftCmcMax"
                    type="number"
                    placeholder="Max"
                    class="form-input small"
                    min="0"
                  />
                </div>
              </div>

              <div class="form-group">
                <label>Ownership Status</label>
                <div class="checkbox-group">
                  <label class="checkbox-label">
                    <input type="checkbox" value="owned" v-model="draftOwnershipFilter" />
                    Owned
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="missing" v-model="draftOwnershipFilter" />
                    Missing
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" value="skipped" v-model="draftOwnershipFilter" />
                    Skipped
                  </label>
                </div>
              </div>
            </div>

            <!-- Search button for advanced mode -->
            <div class="search-actions">
              <button @click="applyAdvancedFilters" class="btn btn-primary btn-search">
                Search
              </button>
            </div>
          </div>

          <div v-if="searchMode === 'quick' && debouncedSearchQuery && filteredCards.length === 0" class="no-results">
            No cards found matching "{{ debouncedSearchQuery }}"
          </div>

          <div v-else-if="searchMode === 'advanced' && !advancedSearchTriggered" class="search-prompt">
            Set your filters and click Search to find cards
          </div>

          <div v-else-if="searchMode === 'advanced' && advancedSearchTriggered && filteredCards.length === 0" class="no-results">
            No cards found matching the selected filters
          </div>

          <div v-else-if="filteredCards.length > 0" class="results">
            <h3>
              Results ({{ filteredCards.length }})
              <span v-if="totalPages > 1" class="pagination-info">
                - Page {{ currentPage }} of {{ totalPages }}
              </span>
            </h3>
            <div class="card-grid">
              <div v-for="result in paginatedResults" :key="`${result.segmentId}:${result.cardIndex}`" class="card-item">
                <img
                  v-if="result.card.image_uris?.normal || result.card.card_faces?.[0]?.image_uris?.normal"
                  :src="result.card.image_uris?.normal || result.card.card_faces?.[0]?.image_uris?.normal"
                  :alt="result.card.name"
                  class="card-image"
                  :class="{ 'card-image-missing': !result.isOwned }"
                />
                <div class="card-info">
                  <div class="card-name">{{ result.card.name }}</div>
                  <div class="card-details">
                    {{ result.card.set.toUpperCase() }} {{ result.card.collector_number.padStart(4, '0') }}
                  </div>
                  <div class="card-segment">{{ result.segmentName }}</div>
                  <div v-if="getCardLocation(result.segmentId, result.cardIndex)" class="card-location">
                    <div>{{ getCardLocation(result.segmentId, result.cardIndex)!.binderName }}</div>
                    <div>Page {{ getCardLocation(result.segmentId, result.cardIndex)!.pageNumber }}, Slot {{ getCardLocation(result.segmentId, result.cardIndex)!.slotOnPage }}</div>
                  </div>
                  <div v-else-if="!placementResult" class="card-location-missing">
                    No binder configured
                  </div>
                  <div class="card-status">
                    <span v-if="result.isOwned" class="status-owned">✓ Owned</span>
                    <span v-else-if="result.isSkipped" class="status-skipped">⊘ Skipped</span>
                    <span v-else class="status-missing">Missing</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Pagination controls -->
            <div v-if="totalPages > 1" class="pagination">
              <button
                @click="goToPage(currentPage - 1)"
                :disabled="currentPage === 1"
                class="pagination-btn"
              >
                Previous
              </button>

              <div class="pagination-pages">
                <template v-for="(page, index) in visiblePages" :key="index">
                  <span v-if="page === null" class="pagination-ellipsis">...</span>
                  <button
                    v-else
                    @click="goToPage(page)"
                    class="pagination-page"
                    :class="{ active: page === currentPage }"
                  >
                    {{ page }}
                  </button>
                </template>
              </div>

              <button
                @click="goToPage(currentPage + 1)"
                :disabled="currentPage === totalPages"
                class="pagination-btn"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f5f5;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}

.hero-section {
  max-width: 800px;
  margin: 4rem auto;
  text-align: center;
}

.hero-content {
  background: white;
  border-radius: 12px;
  padding: 3rem 2rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.hero-title {
  font-size: 2.5rem;
  color: #333;
  margin: 0 0 1rem 0;
  font-weight: 600;
}

.hero-description {
  font-size: 1.125rem;
  color: #666;
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
}

.hero-subtitle {
  font-size: 1rem;
  color: #888;
  margin: 0 0 1.5rem 0;
}

.storage-notice {
  background: #f0f7ff;
  border: 1px solid #4a90d9;
  border-radius: 8px;
  padding: 1.25rem;
  margin: 0 0 2rem 0;
  text-align: left;
}

.storage-notice-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #2a5a8a;
  margin-bottom: 0.75rem;
}

.storage-notice-header svg {
  stroke: #4a90d9;
  flex-shrink: 0;
}

.storage-notice-text {
  font-size: 0.875rem;
  color: #333;
  line-height: 1.5;
  margin: 0 0 0.75rem 0;
}

.storage-notice-list {
  font-size: 0.875rem;
  color: #555;
  line-height: 1.6;
  margin: 0 0 0.75rem 1.5rem;
  padding: 0;
}

.storage-notice-list li {
  margin-bottom: 0.375rem;
}

.storage-notice-warning {
  font-size: 0.8rem;
  color: #856404;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
  padding: 0.75rem;
  margin: 0;
  line-height: 1.5;
}

.btn-hero {
  padding: 1rem 2.5rem;
  font-size: 1.125rem;
  color: white;
  background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
  box-shadow: 0 4px 12px rgba(74, 144, 217, 0.3);
}

.btn-hero:hover {
  background: linear-gradient(135deg, #3a7bc8 0%, #2a6ba8 100%);
  box-shadow: 0 6px 16px rgba(74, 144, 217, 0.4);
  transform: translateY(-1px);
}

.search-section {
  max-width: 1200px;
  margin: 0 auto;
}

.search-section h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
  color: #333;
}

.mode-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1rem;
  border-bottom: 2px solid #ddd;
}

.mode-tab {
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  font-size: 1rem;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-tab:hover {
  color: #333;
  background: #f9f9f9;
}

.mode-tab.active {
  color: #4a90d9;
  border-bottom-color: #4a90d9;
  font-weight: 500;
}

.search-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.advanced-search-form {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.search-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ddd;
}

.btn-search {
  min-width: 120px;
  padding: 0.5rem 1.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #333;
}

.form-input {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
}

.form-input:focus {
  outline: none;
  border-color: #4a90d9;
}

.form-input.small {
  width: 80px;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  color: #666;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}

.commander-identity-toggle {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #eee;
}

.commander-identity-toggle .checkbox-label {
  font-size: 0.875rem;
  color: #333;
}

.color-symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-weight: bold;
  font-size: 0.75rem;
  border: 2px solid #333;
}

.color-symbol.white {
  background: #f9fafb;
  color: #333;
}

.color-symbol.blue {
  background: #0e68ab;
  color: white;
}

.color-symbol.black {
  background: #150b00;
  color: white;
}

.color-symbol.red {
  background: #d3202a;
  color: white;
}

.color-symbol.green {
  background: #00733e;
  color: white;
}

.color-symbol.colorless {
  background: #ccc;
  color: #333;
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.range-separator {
  font-size: 0.875rem;
  color: #666;
}

.search-input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.search-input:focus {
  outline: none;
  border-color: #4a90d9;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary {
  background: #4a90d9;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #3a7bc8;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #5a6268;
}

.loading-message {
  color: #666;
  font-style: italic;
}

.no-results {
  padding: 1rem;
  color: #666;
  text-align: center;
}

.search-prompt {
  padding: 2rem 1rem;
  color: #888;
  text-align: center;
  font-style: italic;
}

.max-results-hint {
  font-size: 0.875rem;
  color: #999;
  font-weight: normal;
}

.results {
  margin-top: 2rem;
}

.results h3 {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  color: #666;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.card-item {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.card-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.card-image {
  width: 100%;
  display: block;
}

.card-image-missing {
  filter: grayscale(50%);
  opacity: 0.6;
}

.card-info {
  padding: 0.75rem;
}

.card-name {
  font-weight: 500;
  color: #333;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.275rem;
}

.card-details {
  font-size: 0.75rem;
  color: #666;
}

.card-segment {
  font-size: 0.75rem;
  color: #888;
  margin-top: 0.25rem;
  font-style: italic;
}

.card-location {
  font-size: 0.7rem;
  color: #4a90d9;
  margin-top: 0.25rem;
  font-weight: 500;
  font-family: monospace;
}

.card-location-missing {
  font-size: 0.7rem;
  color: #999;
  margin-top: 0.25rem;
  font-style: italic;
}

.card-status {
  margin-top: 0.5rem;
  font-size: 0.75rem;
}

.status-owned {
  color: #28a745;
  font-weight: 500;
}

.status-skipped {
  color: #dc3545;
  font-weight: 500;
}

.status-missing {
  color: #999;
}

.pagination-info {
  font-size: 0.875rem;
  color: #666;
  font-weight: normal;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
  padding: 1rem 0;
}

.pagination-btn {
  padding: 0.5rem 1rem;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s;
}

.pagination-btn:hover:not(:disabled) {
  background: #3a7bc8;
}

.pagination-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.pagination-pages {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.pagination-ellipsis {
  padding: 0.5rem 0.25rem;
  color: #666;
  font-size: 0.875rem;
}

.pagination-page {
  padding: 0.5rem 0.75rem;
  background: #fff;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 40px;
}

.pagination-page:hover {
  background: #f5f5f5;
  border-color: #4a90d9;
}

.pagination-page.active {
  background: #4a90d9;
  color: white;
  border-color: #4a90d9;
}
</style>
