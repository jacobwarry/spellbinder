<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDecksStore, useSegmentsStore, useCollectionStore } from '@/stores'
import { getCachedCards, searchCards } from '@/api/scryfall'
import { fetchArchidektDeck, extractDeckId, convertArchidektCards } from '@/api/archidekt'
import type { Deck, ScryfallCard } from '@/types'

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

// Handle Escape key to close import modal
function handleImportModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showImportModal.value) {
    showImportModal.value = false
  }
}

// Add/remove keyboard listener when modal opens/closes
watch(showImportModal, (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', handleImportModalKeydown)
  } else {
    window.removeEventListener('keydown', handleImportModalKeydown)
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
    <header class="header">
      <h1>My Decks</h1>
      <button v-if="!selectedDeck" @click="showImportModal = true" class="btn btn-primary">
        Import from Archidekt
      </button>
    </header>

    <!-- Deck List View -->
    <main v-if="!selectedDeck" class="main-content">
      <div v-if="decksStore.decks.length === 0" class="empty-state">
        <p>No decks yet. Import a deck from Archidekt to get started!</p>
      </div>

      <div v-else class="deck-list">
        <div
          v-for="deck in decksStore.decks"
          :key="deck.id"
          class="deck-card"
          @click="selectDeck(deck)"
        >
          <div class="deck-info">
            <h3>{{ deck.name }}</h3>
            <p class="deck-meta">{{ deck.cards.length }} unique cards</p>
          </div>
          <div class="deck-stats">
            <div class="completion-bar">
              <div
                class="completion-fill"
                :style="{ width: getDeckCompletion(deck).percentage + '%' }"
              ></div>
            </div>
            <span class="completion-text">
              {{ getDeckCompletion(deck).owned }}/{{ getDeckCompletion(deck).total }}
              ({{ getDeckCompletion(deck).percentage }}%)
            </span>
          </div>
          <button @click.stop="deleteDeck(deck)" class="btn-delete" title="Delete deck">
            &times;
          </button>
        </div>
      </div>
    </main>

    <!-- Deck Detail View -->
    <main v-else class="main-content deck-detail">
      <div class="deck-detail-header">
        <button @click="backToList" class="btn btn-secondary">&larr; Back</button>
        <h2>{{ selectedDeck.name }}</h2>
        <div class="deck-completion">
          {{ getDeckCompletion(selectedDeck).owned }}/{{ getDeckCompletion(selectedDeck).total }}
          ({{ getDeckCompletion(selectedDeck).percentage }}% complete)
        </div>
      </div>

      <div v-if="isLoadingCards" class="loading">Loading cards...</div>

      <div v-else class="deck-cards">
        <div v-for="[category, cards] in groupedCards" :key="category" class="card-category">
          <h3 class="category-title">{{ category }} ({{ cards.length }})</h3>
          <div class="card-grid">
            <div
              v-for="card in cards"
              :key="card.id"
              class="deck-card-item"
              :class="{ 'card-missing': !isDeckCardOwned(card) }"
              @click="openCardSearch(card)"
              :title="`${card.name} - Click to search in collection`"
            >
              <img
                v-if="getCardImage(card)"
                :src="getCardImage(card)"
                :alt="card.name"
                class="card-image"
              />
              <div class="card-overlay">
                <span class="card-quantity" v-if="card.quantity > 1">x{{ card.quantity }}</span>
                <span class="card-status">
                  {{ isDeckCardOwned(card) ? 'Owned' : 'Missing' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Import Modal -->
    <div v-if="showImportModal" class="modal-overlay">
      <div class="modal">
        <h2>Import Deck from Archidekt</h2>
        <p class="modal-description">
          Paste an Archidekt deck URL or deck ID
        </p>
        <input
          v-model="importUrl"
          type="text"
          placeholder="https://archidekt.com/decks/123456/my-deck"
          class="import-input"
          @keyup.enter="importDeck"
        />
        <p v-if="importError" class="error-message">{{ importError }}</p>
        <div class="modal-actions">
          <button @click="showImportModal = false" class="btn btn-secondary">Cancel</button>
          <button @click="importDeck" class="btn btn-primary" :disabled="isImporting">
            {{ isImporting ? 'Importing...' : 'Import' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Card Search Modal -->
    <div v-if="showSearchModal" class="modal-overlay" @click.self="showSearchModal = false">
      <div class="modal modal-wide">
        <h2>{{ searchMode === 'scryfall' ? `All Printings of "${searchingCard?.name}"` : (searchMode === 'same' ? `Find "${searchingCard?.name}"` : 'Replace with Any Card') }}</h2>
        <p class="modal-description">
          {{ searchMode === 'scryfall'
            ? 'Select any printing from Scryfall to use for this deck slot'
            : (searchMode === 'same'
              ? 'Select a card from your collection to link to this deck slot'
              : 'Search for any card in your collection to use as a replacement') }}
        </p>

        <!-- Mode Toggle -->
        <div class="search-mode-toggle">
          <button
            class="mode-btn"
            :class="{ active: searchMode === 'same' }"
            @click="searchMode = 'same'"
          >
            In Collection
          </button>
          <button
            class="mode-btn"
            :class="{ active: searchMode === 'any' }"
            @click="searchMode = 'any'"
          >
            Any in Collection
          </button>
          <button
            class="mode-btn"
            :class="{ active: searchMode === 'scryfall' }"
            @click="searchMode = 'scryfall'"
          >
            All Printings
          </button>
        </div>

        <!-- Search Input for "any" mode -->
        <div v-if="searchMode === 'any'" class="replace-search">
          <input
            v-model="replaceSearchQuery"
            type="text"
            placeholder="Search cards by name..."
            class="search-input"
            @input="searchCollectionCards"
          />
          <p v-if="replaceSearchQuery.length > 0 && replaceSearchQuery.length < 2" class="search-hint">
            Type at least 2 characters to search
          </p>
        </div>

        <div v-if="isSearchingCollection" class="loading">Searching collection...</div>

        <!-- Same card mode results -->
        <template v-else-if="searchMode === 'same'">
          <div v-if="collectionMatches.length === 0" class="no-matches">
            No copies of this card found in your collection.
          </div>

          <div v-else class="search-results">
            <div
              v-for="match in collectionMatches"
              :key="match.cardKey"
              class="search-result-item"
              :class="{ 'is-owned': match.isOwned }"
              @click="linkCardToCollection(searchingCard!.id, match.cardKey)"
            >
              <img
                v-if="match.card.image_uris?.small || match.card.card_faces?.[0]?.image_uris?.small"
                :src="match.card.image_uris?.small || match.card.card_faces?.[0]?.image_uris?.small"
                :alt="match.card.name"
                class="search-result-image"
              />
              <div class="search-result-info">
                <div class="search-result-name">{{ match.card.name }}</div>
                <div class="search-result-set-name">{{ match.card.set_name }}</div>
                <div class="search-result-set-code">{{ match.card.set.toUpperCase() }} {{ match.card.collector_number.padStart(4, '0') }}</div>
                <div class="search-result-status" :class="match.isOwned ? 'owned' : 'missing'">
                  {{ match.isOwned ? 'Owned' : 'Not Owned' }}
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Replace with any card mode results -->
        <template v-else-if="searchMode === 'any'">
          <div v-if="replaceSearchQuery.length < 2" class="no-matches">
            Enter a card name to search your collection.
          </div>
          <div v-else-if="replaceSearchResults.length === 0" class="no-matches">
            No cards found matching "{{ replaceSearchQuery }}".
          </div>

          <div v-else class="search-results">
            <div
              v-for="match in replaceSearchResults"
              :key="match.cardKey"
              class="search-result-item"
              :class="{ 'is-owned': match.isOwned }"
              @click="linkCardToCollection(searchingCard!.id, match.cardKey)"
            >
              <img
                v-if="match.card.image_uris?.small || match.card.card_faces?.[0]?.image_uris?.small"
                :src="match.card.image_uris?.small || match.card.card_faces?.[0]?.image_uris?.small"
                :alt="match.card.name"
                class="search-result-image"
              />
              <div class="search-result-info">
                <div class="search-result-name">{{ match.card.name }}</div>
                <div class="search-result-set-name">{{ match.card.set_name }}</div>
                <div class="search-result-set-code">{{ match.card.set.toUpperCase() }} {{ match.card.collector_number.padStart(4, '0') }}</div>
                <div class="search-result-status" :class="match.isOwned ? 'owned' : 'missing'">
                  {{ match.isOwned ? 'Owned' : 'Not Owned' }}
                </div>
              </div>
            </div>
            <div v-if="replaceSearchResults.length >= 50" class="results-truncated">
              Showing first 50 results. Refine your search for more specific results.
            </div>
          </div>
        </template>

        <!-- Scryfall all printings mode results -->
        <template v-else-if="searchMode === 'scryfall'">
          <div v-if="isSearchingScryfall" class="loading">Searching Scryfall...</div>
          <div v-else-if="scryfallSearchResults.length === 0" class="no-matches">
            No printings found on Scryfall.
          </div>

          <div v-else class="search-results">
            <div
              v-for="card in scryfallSearchResults"
              :key="card.id"
              class="search-result-item"
              :class="{ 'is-owned': findExactMatch(card.id) !== null }"
              @click="linkToScryfallCard(searchingCard!.id, card.id)"
            >
              <img
                v-if="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
                :src="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
                :alt="card.name"
                class="search-result-image"
              />
              <div class="search-result-info">
                <div class="search-result-name">{{ card.name }}</div>
                <div class="search-result-set-name">{{ card.set_name }}</div>
                <div class="search-result-set-code">{{ card.set.toUpperCase() }} {{ card.collector_number.padStart(4, '0') }}</div>
                <div class="search-result-status" :class="findExactMatch(card.id) !== null ? 'owned' : 'missing'">
                  {{ findExactMatch(card.id) !== null ? 'In Collection' : 'Not in Collection' }}
                </div>
              </div>
            </div>
          </div>
        </template>

        <div class="modal-actions">
          <button
            v-if="searchingCard?.linkedCardKey || searchingCard?.linkedScryfallId"
            @click="unlinkCard(searchingCard!.id); showSearchModal = false"
            class="btn btn-danger"
          >
            Unlink Card
          </button>
          <button @click="showSearchModal = false" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.decks-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f5f5;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: #fff;
  border-bottom: 1px solid #ddd;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #666;
}

.deck-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.deck-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.deck-card:hover {
  border-color: #4a90d9;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.deck-info {
  flex: 1;
}

.deck-info h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.125rem;
  color: #333;
}

.deck-meta {
  margin: 0;
  font-size: 0.875rem;
  color: #666;
}

.deck-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.completion-bar {
  width: 120px;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.completion-fill {
  height: 100%;
  background: #4a90d9;
  transition: width 0.3s ease;
}

.completion-text {
  font-size: 0.75rem;
  color: #666;
}

.btn-delete {
  padding: 0.5rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #999;
  cursor: pointer;
  line-height: 1;
}

.btn-delete:hover {
  color: #dc3545;
}

/* Deck Detail */
.deck-detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.deck-detail-header h2 {
  flex: 1;
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}

.deck-completion {
  font-size: 1rem;
  color: #4a90d9;
  font-weight: 500;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.card-category {
  margin-bottom: 2rem;
}

.category-title {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  color: #333;
  border-bottom: 2px solid #ddd;
  padding-bottom: 0.5rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
}

.deck-card-item {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.2s;
  cursor: pointer;
}

.deck-card-item:hover {
  transform: translateY(-2px);
}

.deck-card-item .card-image {
  width: 100%;
  display: block;
}

.deck-card-item.card-missing .card-image {
  filter: grayscale(100%);
  opacity: 0.5;
}

.card-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.5rem;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-quantity {
  font-size: 0.875rem;
  font-weight: bold;
  color: #fff;
}

.card-status {
  font-size: 0.75rem;
  color: #fff;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.deck-card-item:not(.card-missing) .card-status {
  background: #28a745;
}

.deck-card-item.card-missing .card-status {
  background: #dc3545;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  padding: 2rem;
  border-radius: 8px;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.modal h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: #333;
}

.modal-description {
  margin: 0 0 1rem 0;
  color: #666;
  font-size: 0.875rem;
}

.import-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  margin-bottom: 1rem;
}

.import-input:focus {
  outline: none;
  border-color: #4a90d9;
}

.error-message {
  color: #dc3545;
  font-size: 0.875rem;
  margin: 0 0 1rem 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

/* Buttons */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
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

.btn-secondary:hover {
  background: #5a6268;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover {
  background: #c82333;
}

/* Search modal */
.modal-wide {
  max-width: 600px;
}

.no-matches {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 1rem;
}

.search-result-item {
  display: flex;
  gap: 1rem;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.search-result-item:hover {
  border-color: #4a90d9;
  background: #f5f9ff;
}

.search-result-item.is-owned {
  border-color: #28a745;
  background: #f0fff4;
}

.search-result-image {
  width: 60px;
  height: auto;
  border-radius: 4px;
}

.search-result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.15rem;
}

.search-result-set-name {
  font-size: 0.7rem;
  color: #555;
  text-transform: uppercase;
}

.search-result-set-code {
  font-size: 0.75rem;
  color: #888;
}

.search-result-status {
  font-size: 0.75rem;
  font-weight: 500;
}

.search-result-status.owned {
  color: #28a745;
}

.search-result-status.missing {
  color: #dc3545;
}

.search-result-name {
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
}

/* Search mode toggle */
.search-mode-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.mode-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  background: #e5e5e5;
}

.mode-btn.active {
  background: #4a90d9;
  color: white;
  border-color: #4a90d9;
}

/* Replace search input */
.replace-search {
  margin-bottom: 1rem;
}

.search-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.search-input:focus {
  outline: none;
  border-color: #4a90d9;
}

.search-hint {
  margin: 0.5rem 0 0 0;
  font-size: 0.75rem;
  color: #888;
}

.results-truncated {
  padding: 0.75rem;
  text-align: center;
  font-size: 0.75rem;
  color: #888;
  background: #f5f5f5;
  border-radius: 4px;
}
</style>
