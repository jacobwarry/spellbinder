import { ref } from 'vue'
import type { ScryfallCard } from '@/types'

export type SearchMode = 'quick' | 'advanced'

/** Field the result grid is ordered by. `set` is the default (set name, then collector №). */
export type SortField = 'set' | 'name' | 'cmc' | 'power' | 'toughness'
export type SortDir = 'asc' | 'desc'

/** One card occurrence in the collection: a printing at a specific segment position. */
export interface IndexedCard {
  card: ScryfallCard
  segmentId: string
  segmentName: string
  cardIndex: number
}

// Module-scoped singletons. The collection search view (HomePage) reads these instead
// of local refs so a round trip out of the view and back — e.g. clicking into a card
// detail page and hitting the browser Back button — restores the exact search criteria,
// results, and scroll position without rebuilding anything. State lives for the app's
// session (in memory); a full page reload starts fresh, which is fine.
const searchMode = ref<SearchMode>('quick')
const searchQuery = ref('')
const debouncedSearchQuery = ref('')

// Advanced search — draft values (what the user is editing) vs active values (applied on Search).
const draftNameQuery = ref('')
const draftTypeFilter = ref<string[]>([])
const draftColorFilter = ref<string[]>([])
const draftCommanderIdentity = ref(false)
const draftRarityFilter = ref<string[]>([])
const draftOwnershipFilter = ref<string[]>(['owned'])
const draftCmcMin = ref<number | ''>('')
const draftCmcMax = ref<number | ''>('')

const advancedNameQuery = ref('')
const advancedTypeFilter = ref<string[]>([])
const advancedColorFilter = ref<string[]>([])
const advancedCommanderIdentity = ref(false)
const advancedRarityFilter = ref<string[]>([])
const advancedOwnershipFilter = ref<string[]>(['owned'])
const advancedCmcMin = ref<number | ''>('')
const advancedCmcMax = ref<number | ''>('')
const advancedSearchTriggered = ref(false)

// Result ordering (applies to both quick and advanced results).
const sortField = ref<SortField>('set')
const sortDir = ref<SortDir>('asc')

// The built search index, plus a signature of the collection it was built from so the
// view can skip a rebuild (and its loading flash) when the collection hasn't changed.
const allCards = ref<Map<string, IndexedCard>>(new Map())
const indexSignature = ref('')

// Document scroll offset, remembered on leave and restored on return.
const savedScroll = ref(0)

export function useCollectionSearch() {
  return {
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
  }
}
