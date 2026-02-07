import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Deck, DeckCard } from '@/types'

const STORAGE_KEY = 'spellbinder-decks'

function generateId(): string {
  return crypto.randomUUID()
}

function loadFromStorage(): Deck[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

function saveToStorage(decks: Deck[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
}

export const useDecksStore = defineStore('decks', () => {
  const decks = ref<Deck[]>(loadFromStorage())

  const deckMap = computed(() => {
    const map = new Map<string, Deck>()
    for (const deck of decks.value) {
      map.set(deck.id, deck)
    }
    return map
  })

  function getDeck(id: string): Deck | undefined {
    return deckMap.value.get(id)
  }

  function createDeck(
    name: string,
    cards: Omit<DeckCard, 'id'>[],
    archidektId?: string,
    archidektUrl?: string
  ): Deck {
    const now = Date.now()
    const deck: Deck = {
      id: generateId(),
      name,
      archidektId,
      archidektUrl,
      cards: cards.map(card => ({
        ...card,
        id: generateId()
      })),
      createdAt: now,
      updatedAt: now
    }
    decks.value.push(deck)
    saveToStorage(decks.value)
    return deck
  }

  function updateDeck(id: string, updates: Partial<Omit<Deck, 'id' | 'createdAt'>>): void {
    const index = decks.value.findIndex(d => d.id === id)
    if (index !== -1) {
      const existing = decks.value[index]
      if (existing) {
        decks.value[index] = {
          ...existing,
          ...updates,
          updatedAt: Date.now()
        }
        saveToStorage(decks.value)
      }
    }
  }

  function removeDeck(id: string): void {
    const index = decks.value.findIndex(d => d.id === id)
    if (index !== -1) {
      decks.value.splice(index, 1)
      saveToStorage(decks.value)
    }
  }

  function linkCard(deckId: string, cardId: string, linkedCardKey: string): void {
    const deck = getDeck(deckId)
    if (deck) {
      const card = deck.cards.find(c => c.id === cardId)
      if (card) {
        card.linkedCardKey = linkedCardKey
        deck.updatedAt = Date.now()
        saveToStorage(decks.value)
      }
    }
  }

  function unlinkCard(deckId: string, cardId: string): void {
    const deck = getDeck(deckId)
    if (deck) {
      const card = deck.cards.find(c => c.id === cardId)
      if (card) {
        delete card.linkedCardKey
        delete card.linkedScryfallId
        deck.updatedAt = Date.now()
        saveToStorage(decks.value)
      }
    }
  }

  function linkCardToScryfall(deckId: string, cardId: string, scryfallId: string): void {
    const deck = getDeck(deckId)
    if (deck) {
      const card = deck.cards.find(c => c.id === cardId)
      if (card) {
        card.linkedScryfallId = scryfallId
        delete card.linkedCardKey  // Clear collection link when linking to Scryfall
        deck.updatedAt = Date.now()
        saveToStorage(decks.value)
      }
    }
  }

  return {
    decks,
    deckMap,
    getDeck,
    createDeck,
    updateDeck,
    removeDeck,
    linkCard,
    unlinkCard,
    linkCardToScryfall
  }
})
