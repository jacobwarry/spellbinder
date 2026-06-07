<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDecksStore, useSegmentsStore, useCollectionStore } from '@/stores'
import { getCachedCards, searchCards } from '@/api/scryfall'
import { fetchArchidektDeck, extractDeckId, convertArchidektCards } from '@/api/archidekt'
import type { Deck, ScryfallCard } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/ui/segmented'
import { Layers, Download, Trash2, ArrowLeft } from 'lucide-vue-next'

interface CollectionMatch {
  card: ScryfallCard
  segmentId: string
  segmentName: string
  cardIndex: number
  isOwned: boolean
  cardKey: string
}

interface CollectionCardEntry {
  card: ScryfallCard
  segmentId: string
  segmentName: string
  cardIndex: number
}

const route = useRoute()
const router = useRouter()

const decksStore = useDecksStore()
const segmentsStore = useSegmentsStore()
const collectionStore = useCollectionStore()

// Get selected deck from route params
const selectedDeck = computed(() => {
  const deckId = route.params.id as string | undefined
  if (!deckId) return null
  return decksStore.getDeck(deckId) ?? null
})
const showImportModal = ref(false)
const importUrl = ref('')
const isImporting = ref(false)
const importError = ref('')

// Card data for selected deck
const deckCardData = ref<Map<string, ScryfallCard>>(new Map())
const isLoadingCards = ref(false)

// Card search/linking modal state
const showSearchModal = ref(false)
const searchingCard = ref<Deck['cards'][0] | null>(null)
const collectionMatches = ref<CollectionMatch[]>([])
const isSearchingCollection = ref(false)

// Search mode: 'same' = find same card, 'any' = replace with any card, 'scryfall' = search all printings
const searchMode = ref<'same' | 'any' | 'scryfall'>('same')
const replaceSearchQuery = ref('')
const replaceSearchResults = ref<CollectionMatch[]>([])

// Scryfall search results (all printings of a card)
const scryfallSearchResults = ref<ScryfallCard[]>([])
const isSearchingScryfall = ref(false)

// All cards in collection (for searching)
const allCollectionCards = ref<Map<string, CollectionCardEntry>>(new Map())

// Calculate completion for a deck
function getDeckCompletion(deck: Deck): { owned: number; total: number; percentage: number } {
  let owned = 0
  let total = 0

  for (const card of deck.cards) {
    total += card.quantity

    // Check if manually linked to collection card
    if (card.linkedCardKey) {
      if (collectionStore.isOwned(card.linkedCardKey)) {
        owned += card.quantity
      }
      continue
    }

    // Check if linked to a specific Scryfall printing
    if (card.linkedScryfallId) {
      const match = findExactMatch(card.linkedScryfallId)
      if (match) {
        owned += card.quantity
      }
      continue
    }

    // Check for exact Scryfall ID match in collection
    const match = findExactMatch(card.scryfallId)
    if (match) {
      owned += card.quantity
    }
  }

  return {
    owned,
    total,
    percentage: total > 0 ? Math.round((owned / total) * 100) : 0
  }
}

// Find exact match by Scryfall ID in owned cards
function findExactMatch(scryfallId: string): { segmentId: string; cardIndex: number } | null {
  for (const segment of segmentsStore.segments) {
    const cardIndex = segment.cardIds.indexOf(scryfallId)
    if (cardIndex !== -1) {
      const key = `${segment.id}:${cardIndex}`
      if (collectionStore.isOwned(key)) {
        return { segmentId: segment.id, cardIndex }
      }
    }
  }
  return null
}

// Check if a deck card is owned
function isDeckCardOwned(card: { scryfallId: string; linkedCardKey?: string; linkedScryfallId?: string }): boolean {
  if (card.linkedCardKey) {
    return collectionStore.isOwned(card.linkedCardKey)
  }
  if (card.linkedScryfallId) {
    // Check if this specific Scryfall ID is owned in any segment
    return findExactMatch(card.linkedScryfallId) !== null
  }
  return findExactMatch(card.scryfallId) !== null
}

// Normalize string for fuzzy matching
function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[',\-:;!?.()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Load all collection cards for searching
async function loadCollectionCards() {
  if (allCollectionCards.value.size > 0) return // Already loaded

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

  const uniqueCardIds = Array.from(cardIdToSegments.keys())
  if (uniqueCardIds.length > 0) {
    const cardMap = await getCachedCards(uniqueCardIds)

    for (const [cardId, segments] of cardIdToSegments) {
      const card = cardMap.get(cardId)
      if (card) {
        segments.forEach(({ segmentId, segmentName, cardIndex }) => {
          const key = `${segmentId}:${cardIndex}`
          allCollectionCards.value.set(key, { card, segmentId, segmentName, cardIndex })
        })
      }
    }
  }
}

// Check if a card is an art card (should be excluded from searches)
function isArtCard(card: ScryfallCard): boolean {
  // Art cards have type_line of just "Card", contain "Art Series", or set_name contains "Art Series"
  const typeLine = card.type_line?.toLowerCase() || ''
  const setName = card.set_name?.toLowerCase() || ''
  return typeLine === 'card' || typeLine.includes('art series') || setName.includes('art series')
}

// Check if two card names match (handles double-faced cards like "Name // Name")
function cardNamesMatch(deckCardName: string, collectionCardName: string): boolean {
  const normalizedDeckName = normalizeForSearch(deckCardName)
  const normalizedCollectionName = normalizeForSearch(collectionCardName)

  // Exact match
  if (normalizedDeckName === normalizedCollectionName) return true

  // Check if collection card is a DFC containing the deck card name
  // e.g., "Overgrown Tomb // Overgrown Tomb" contains "Overgrown Tomb"
  const collectionFaces = collectionCardName.split(' // ').map(normalizeForSearch)
  if (collectionFaces.some(face => face === normalizedDeckName)) return true

  // Check if deck card is a DFC and any face matches
  const deckFaces = deckCardName.split(' // ').map(normalizeForSearch)
  if (deckFaces.some(face => face === normalizedCollectionName)) return true
  if (deckFaces.some(deckFace => collectionFaces.some(collFace => deckFace === collFace))) return true

  return false
}

// Open search modal for a card
async function openCardSearch(card: Deck['cards'][0]) {
  searchingCard.value = card
  showSearchModal.value = true
  isSearchingCollection.value = true
  collectionMatches.value = []
  searchMode.value = 'same'
  replaceSearchQuery.value = ''
  replaceSearchResults.value = []
  scryfallSearchResults.value = []

  // Start Scryfall search in the background
  searchScryfallPrintings(card.name)

  await loadCollectionCards()

  // Find all cards with matching name (handles double-faced cards)
  const matches: typeof collectionMatches.value = []

  for (const [key, data] of allCollectionCards.value) {
    // Skip art cards
    if (isArtCard(data.card)) continue

    if (cardNamesMatch(card.name, data.card.name)) {
      matches.push({
        card: data.card,
        segmentId: data.segmentId,
        segmentName: data.segmentName,
        cardIndex: data.cardIndex,
        isOwned: collectionStore.isOwned(key),
        cardKey: key
      })
    }
  }

  // Sort: owned first, then by set name
  matches.sort((a, b) => {
    if (a.isOwned !== b.isOwned) return a.isOwned ? -1 : 1
    return (a.card.set_name || '').localeCompare(b.card.set_name || '')
  })

  collectionMatches.value = matches
  isSearchingCollection.value = false
}

// Search for any card in collection by name
function searchCollectionCards() {
  const query = replaceSearchQuery.value.trim().toLowerCase()
  if (query.length < 2) {
    replaceSearchResults.value = []
    return
  }

  const matches: CollectionMatch[] = []

  for (const [key, data] of allCollectionCards.value) {
    // Skip art cards
    if (isArtCard(data.card)) continue

    const cardName = data.card.name.toLowerCase()
    if (cardName.includes(query)) {
      matches.push({
        card: data.card,
        segmentId: data.segmentId,
        segmentName: data.segmentName,
        cardIndex: data.cardIndex,
        isOwned: collectionStore.isOwned(key),
        cardKey: key
      })
    }
  }

  // Sort: owned first, then by card name, then by set name
  matches.sort((a, b) => {
    if (a.isOwned !== b.isOwned) return a.isOwned ? -1 : 1
    const nameCompare = a.card.name.localeCompare(b.card.name)
    if (nameCompare !== 0) return nameCompare
    return (a.card.set_name || '').localeCompare(b.card.set_name || '')
  })

  // Limit results to prevent performance issues
  replaceSearchResults.value = matches.slice(0, 50)
}

// Search Scryfall for all printings of a card
async function searchScryfallPrintings(cardName: string) {
  isSearchingScryfall.value = true
  scryfallSearchResults.value = []

  try {
    // Search for exact card name (use quotes for exact match)
    const results = await searchCards(`!"${cardName}"`)
    // Filter out art cards
    scryfallSearchResults.value = results.filter(card => !isArtCard(card))
  } catch (error) {
    console.error('Failed to search Scryfall:', error)
  } finally {
    isSearchingScryfall.value = false
  }
}

// Link a deck card to a collection card
function linkCardToCollection(deckCardId: string, cardKey: string) {
  if (!selectedDeck.value) return
  decksStore.linkCard(selectedDeck.value.id, deckCardId, cardKey)
  showSearchModal.value = false
  searchingCard.value = null
}

// Link a deck card to a specific Scryfall printing
function linkToScryfallCard(deckCardId: string, scryfallId: string) {
  if (!selectedDeck.value) return
  decksStore.linkCardToScryfall(selectedDeck.value.id, deckCardId, scryfallId)
  showSearchModal.value = false
  searchingCard.value = null
}

// Unlink a deck card
function unlinkCard(deckCardId: string) {
  if (!selectedDeck.value) return
  decksStore.unlinkCard(selectedDeck.value.id, deckCardId)
}

// Import deck from Archidekt
async function importDeck() {
  const deckId = extractDeckId(importUrl.value)
  if (!deckId) {
    importError.value = 'Invalid Archidekt URL or deck ID'
    return
  }

  isImporting.value = true
  importError.value = ''

  try {
    const archidektDeck = await fetchArchidektDeck(deckId)
    const cards = convertArchidektCards(archidektDeck.cards)

    decksStore.createDeck(
      archidektDeck.name,
      cards,
      deckId,
      importUrl.value.includes('archidekt.com') ? importUrl.value : undefined
    )

    showImportModal.value = false
    importUrl.value = ''
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Failed to import deck'
  } finally {
    isImporting.value = false
  }
}

// Navigate to a deck
function selectDeck(deck: Deck) {
  router.push(`/decks/${deck.id}`)
}

function backToList() {
  router.push('/decks')
}

function deleteDeck(deck: Deck) {
  if (confirm(`Delete "${deck.name}"? This cannot be undone.`)) {
    decksStore.removeDeck(deck.id)
    // Navigate back to list if viewing the deleted deck
    if (selectedDeck.value?.id === deck.id) {
      router.push('/decks')
    }
  }
}

// Load card data when selected deck changes
async function loadDeckCardData(deck: Deck) {
  isLoadingCards.value = true
  deckCardData.value = new Map()

  try {
    // Collect all card IDs we need to fetch (deck cards + linked Scryfall IDs)
    const cardIds = deck.cards.map(c => c.scryfallId)
    const linkedScryfallIds = deck.cards
      .filter(c => c.linkedScryfallId)
      .map(c => c.linkedScryfallId!)

    const allCardIds = [...new Set([...cardIds, ...linkedScryfallIds])]
    const cardMap = await getCachedCards(allCardIds)
    deckCardData.value = cardMap

    // Also load collection cards (needed for linked card images)
    await loadCollectionCards()
  } catch (error) {
    console.error('Failed to load card data:', error)
  } finally {
    isLoadingCards.value = false
  }
}

// Watch for deck selection changes (route changes)
watch(selectedDeck, (deck) => {
  if (deck) {
    loadDeckCardData(deck)
  } else {
    deckCardData.value = new Map()
  }
}, { immediate: true })

// Handle Escape key to close modals
function handleModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    // Close search modal first (if open), then import modal
    if (showSearchModal.value) {
      showSearchModal.value = false
      searchingCard.value = null
      event.preventDefault()
    } else if (showImportModal.value) {
      showImportModal.value = false
      event.preventDefault()
    }
  }
}

// Add/remove keyboard listener when any modal opens/closes
watch([showImportModal, showSearchModal], ([importOpen, searchOpen]) => {
  if (importOpen || searchOpen) {
    window.addEventListener('keydown', handleModalKeydown)
  } else {
    window.removeEventListener('keydown', handleModalKeydown)
  }
})

// Group cards by category, sorted like Archidekt (Commander first, then alphabetical)
const groupedCards = computed(() => {
  if (!selectedDeck.value) return new Map<string, Deck['cards']>()

  const groups = new Map<string, Deck['cards']>()
  for (const card of selectedDeck.value.cards) {
    const category = card.category || 'Other'
    if (!groups.has(category)) {
      groups.set(category, [])
    }
    groups.get(category)!.push(card)
  }

  // Sort categories: Commander first, then alphabetical
  const sortedGroups = new Map<string, Deck['cards']>()
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    // Commander always first
    if (a === 'Commander') return -1
    if (b === 'Commander') return 1
    // Rest alphabetical
    return a.localeCompare(b)
  })

  // Sort cards within each category alphabetically by name
  for (const key of sortedKeys) {
    const cards = groups.get(key)!
    cards.sort((a, b) => a.name.localeCompare(b.name))
    sortedGroups.set(key, cards)
  }

  return sortedGroups
})

// Get card image URL - uses linked card's image if available
function getCardImage(deckCard: Deck['cards'][0]): string | undefined {
  // If card is linked to a collection card, use that card's image
  if (deckCard.linkedCardKey) {
    const linkedCard = allCollectionCards.value.get(deckCard.linkedCardKey)
    if (linkedCard) {
      return linkedCard.card.image_uris?.normal || linkedCard.card.card_faces?.[0]?.image_uris?.normal
    }
  }

  // If card is linked to a specific Scryfall printing, use that card's image
  if (deckCard.linkedScryfallId) {
    const linkedCard = deckCardData.value.get(deckCard.linkedScryfallId)
    if (linkedCard) {
      return linkedCard.image_uris?.normal || linkedCard.card_faces?.[0]?.image_uris?.normal
    }
  }

  // Otherwise use the original deck card image
  const card = deckCardData.value.get(deckCard.scryfallId)
  return card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal
}
</script>

<template>
  <div class="decks-view">
    <header class="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6 py-4">
      <h1 class="font-display text-xl font-bold tracking-tight">My Decks</h1>
      <Button v-if="!selectedDeck" @click="showImportModal = true">
        <Download :size="18" /> Import from Archidekt
      </Button>
    </header>

    <!-- Deck List View -->
    <main v-if="!selectedDeck" class="main-content">
      <div v-if="decksStore.decks.length === 0" class="mx-auto max-w-md py-20 text-center">
        <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-(--accent-soft) text-brand">
          <Layers :size="26" />
        </div>
        <h2 class="font-display text-2xl font-bold tracking-tight">No decks yet</h2>
        <p class="mt-2 text-ink-soft">Import a deck from Archidekt and link it against your collection.</p>
        <Button class="mt-6" size="lg" @click="showImportModal = true">
          <Download :size="18" /> Import a deck
        </Button>
      </div>

      <div v-else class="mx-auto flex max-w-3xl flex-col gap-3">
        <div
          v-for="deck in decksStore.decks"
          :key="deck.id"
          class="group flex cursor-pointer items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-(--shadow-1) transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-(--shadow-2)"
          role="button"
          tabindex="0"
          @click="selectDeck(deck)"
          @keydown.enter="selectDeck(deck)"
        >
          <div class="min-w-0 flex-1">
            <h3 class="truncate font-semibold">{{ deck.name }}</h3>
            <p class="text-sm text-ink-faint tabular-nums">{{ deck.cards.length }} unique cards</p>
          </div>
          <div class="flex w-40 shrink-0 flex-col gap-1">
            <div class="h-2 overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full bg-(--accent-grad)" :style="{ width: getDeckCompletion(deck).percentage + '%' }"></div>
            </div>
            <span class="text-xs text-ink-soft tabular-nums">
              {{ getDeckCompletion(deck).owned }}/{{ getDeckCompletion(deck).total }} ({{ getDeckCompletion(deck).percentage }}%)
            </span>
          </div>
          <button
            class="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-faint outline-none transition-colors hover:bg-(--skipped-soft) hover:text-skipped focus-visible:ring-2 focus-visible:ring-ring"
            title="Delete deck"
            aria-label="Delete deck"
            @click.stop="deleteDeck(deck)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
    </main>

    <!-- Deck Detail View -->
    <main v-else class="main-content">
      <div class="mx-auto max-w-6xl">
        <div class="mb-6 flex flex-wrap items-center gap-4">
          <Button variant="ghost" @click="backToList">
            <ArrowLeft :size="18" /> Back
          </Button>
          <h2 class="font-display text-2xl font-bold tracking-tight">{{ selectedDeck.name }}</h2>
          <span class="ml-auto text-sm text-ink-soft tabular-nums">
            {{ getDeckCompletion(selectedDeck).owned }}/{{ getDeckCompletion(selectedDeck).total }}
            ({{ getDeckCompletion(selectedDeck).percentage }}% complete)
          </span>
        </div>

        <div v-if="isLoadingCards" class="py-10 text-center text-ink-soft">Loading cards…</div>

        <div v-else class="flex flex-col gap-8">
          <div v-for="[category, cards] in groupedCards" :key="category">
            <h3 class="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-ink-soft">
              {{ category }} <span class="text-ink-faint">({{ cards.length }})</span>
            </h3>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
              <button
                v-for="card in cards"
                :key="card.id"
                class="group relative overflow-hidden rounded-lg border border-line outline-none transition hover:-translate-y-1 hover:shadow-(--shadow-2) focus-visible:ring-2 focus-visible:ring-ring"
                :title="`${card.name} — click to link from your collection`"
                @click="openCardSearch(card)"
              >
                <div class="relative aspect-63/88 bg-surface-2" :class="!isDeckCardOwned(card) && 'grayscale brightness-90'">
                  <img v-if="getCardImage(card)" :src="getCardImage(card)" :alt="card.name" loading="lazy" class="absolute inset-0 h-full w-full object-cover" />
                  <span v-else class="absolute inset-0 grid place-items-center p-2 text-center text-xs text-ink-faint">{{ card.name }}</span>
                  <span v-if="card.quantity > 1" class="absolute right-1.5 top-1.5 rounded-md bg-[rgba(0,0,0,.7)] px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums">×{{ card.quantity }}</span>
                </div>
                <span
                  class="absolute inset-x-0 bottom-0 px-2 py-1 text-[11px] font-semibold"
                  :style="isDeckCardOwned(card)
                    ? 'color:var(--owned);background:var(--owned-soft)'
                    : 'color:var(--missing);background:var(--surface-2)'"
                >{{ isDeckCardOwned(card) ? 'Owned' : 'Missing' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Import Modal -->
    <Dialog
      v-model:open="showImportModal"
      title="Import deck from Archidekt"
      description="Paste an Archidekt deck URL or deck ID."
    >
      <label for="import-url" class="sr-only">Archidekt deck URL or ID</label>
      <Input
        id="import-url"
        v-model="importUrl"
        placeholder="https://archidekt.com/decks/123456/my-deck"
        @keyup.enter="importDeck"
      />
      <p v-if="importError" role="alert" class="mt-2 text-sm text-skipped">{{ importError }}</p>
      <template #footer>
        <Button variant="ghost" @click="showImportModal = false">Cancel</Button>
        <Button :disabled="isImporting" @click="importDeck">
          {{ isImporting ? 'Importing…' : 'Import' }}
        </Button>
      </template>
    </Dialog>

    <!-- Card link modal -->
    <Dialog
      v-if="searchingCard"
      v-model:open="showSearchModal"
      size="xl"
      :title="searchMode === 'scryfall' ? `All printings of “${searchingCard.name}”` : (searchMode === 'same' ? `Find “${searchingCard.name}”` : 'Replace with any card')"
      :description="searchMode === 'scryfall' ? 'Pick any printing from Scryfall for this deck slot.' : (searchMode === 'same' ? 'Pick a copy from your collection to link to this slot.' : 'Search your collection for a replacement card.')"
    >
      <SegmentedControl
        v-model="searchMode"
        :options="[{ value: 'same', label: 'In Collection' }, { value: 'any', label: 'Any in Collection' }, { value: 'scryfall', label: 'All Printings' }]"
        class="mb-4"
      />

      <div v-if="searchMode === 'any'" class="mb-3">
        <label for="link-search" class="sr-only">Search cards by name</label>
        <Input id="link-search" v-model="replaceSearchQuery" placeholder="Search cards by name…" @input="searchCollectionCards" />
        <p v-if="replaceSearchQuery.length > 0 && replaceSearchQuery.length < 2" class="mt-1 text-xs text-ink-faint">Type at least 2 characters to search.</p>
      </div>

      <div class="max-h-[60vh] overflow-y-auto">
        <div v-if="isSearchingCollection" class="py-8 text-center text-ink-soft">Searching collection…</div>

        <!-- In-collection (same card) -->
        <template v-else-if="searchMode === 'same'">
          <p v-if="collectionMatches.length === 0" class="py-8 text-center text-ink-soft">No copies of this card found in your collection.</p>
          <div v-else class="flex flex-col gap-2">
            <button
              v-for="match in collectionMatches"
              :key="match.cardKey"
              class="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-2.5 text-left outline-none transition-colors hover:border-brand hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
              @click="linkCardToCollection(searchingCard!.id, match.cardKey)"
            >
              <img v-if="match.card.image_uris?.small || match.card.card_faces?.[0]?.image_uris?.small" :src="match.card.image_uris?.small || match.card.card_faces?.[0]?.image_uris?.small" :alt="match.card.name" class="h-14 w-10 shrink-0 rounded object-cover" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold">{{ match.card.name }}</div>
                <div class="truncate text-xs text-ink-faint">{{ match.card.set_name }}</div>
                <div class="text-[11px] text-ink-faint tabular-nums">{{ match.card.set.toUpperCase() }} {{ match.card.collector_number.padStart(4, '0') }}</div>
              </div>
              <span class="shrink-0 text-xs font-semibold" :style="match.isOwned ? 'color:var(--owned)' : 'color:var(--missing)'">{{ match.isOwned ? 'Owned' : 'Not owned' }}</span>
            </button>
          </div>
        </template>

        <!-- Any owned card -->
        <template v-else-if="searchMode === 'any'">
          <p v-if="replaceSearchQuery.length < 2" class="py-8 text-center text-ink-soft">Enter a card name to search your collection.</p>
          <p v-else-if="replaceSearchResults.length === 0" class="py-8 text-center text-ink-soft">No cards found matching “{{ replaceSearchQuery }}”.</p>
          <div v-else class="flex flex-col gap-2">
            <button
              v-for="match in replaceSearchResults"
              :key="match.cardKey"
              class="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-2.5 text-left outline-none transition-colors hover:border-brand hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
              @click="linkCardToCollection(searchingCard!.id, match.cardKey)"
            >
              <img v-if="match.card.image_uris?.small || match.card.card_faces?.[0]?.image_uris?.small" :src="match.card.image_uris?.small || match.card.card_faces?.[0]?.image_uris?.small" :alt="match.card.name" class="h-14 w-10 shrink-0 rounded object-cover" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold">{{ match.card.name }}</div>
                <div class="truncate text-xs text-ink-faint">{{ match.card.set_name }}</div>
                <div class="text-[11px] text-ink-faint tabular-nums">{{ match.card.set.toUpperCase() }} {{ match.card.collector_number.padStart(4, '0') }}</div>
              </div>
              <span class="shrink-0 text-xs font-semibold" :style="match.isOwned ? 'color:var(--owned)' : 'color:var(--missing)'">{{ match.isOwned ? 'Owned' : 'Not owned' }}</span>
            </button>
            <p v-if="replaceSearchResults.length >= 50" class="py-2 text-center text-xs text-ink-faint">Showing first 50 results — refine your search for more.</p>
          </div>
        </template>

        <!-- All printings (Scryfall) -->
        <template v-else>
          <div v-if="isSearchingScryfall" class="py-8 text-center text-ink-soft">Searching Scryfall…</div>
          <p v-else-if="scryfallSearchResults.length === 0" class="py-8 text-center text-ink-soft">No printings found on Scryfall.</p>
          <div v-else class="flex flex-col gap-2">
            <button
              v-for="card in scryfallSearchResults"
              :key="card.id"
              class="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-2.5 text-left outline-none transition-colors hover:border-brand hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
              @click="linkToScryfallCard(searchingCard!.id, card.id)"
            >
              <img v-if="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small" :src="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small" :alt="card.name" class="h-14 w-10 shrink-0 rounded object-cover" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold">{{ card.name }}</div>
                <div class="truncate text-xs text-ink-faint">{{ card.set_name }}</div>
                <div class="text-[11px] text-ink-faint tabular-nums">{{ card.set.toUpperCase() }} {{ card.collector_number.padStart(4, '0') }}</div>
              </div>
              <span class="shrink-0 text-xs font-semibold" :style="findExactMatch(card.id) !== null ? 'color:var(--owned)' : 'color:var(--missing)'">{{ findExactMatch(card.id) !== null ? 'In collection' : 'Not in collection' }}</span>
            </button>
          </div>
        </template>
      </div>

      <template #footer>
        <Button
          v-if="searchingCard.linkedCardKey || searchingCard.linkedScryfallId"
          variant="ghost"
          class="mr-auto text-skipped"
          @click="unlinkCard(searchingCard!.id); showSearchModal = false"
        >
          Unlink card
        </Button>
        <Button variant="ghost" @click="showSearchModal = false">Close</Button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.decks-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}

</style>
