import { ref, watch } from 'vue'
import { usePlansStore, useSegmentsStore, useBindersStore } from '@/stores'
import { calculatePlacements, type PlacementResult } from './usePlacement'
import { getPlacementOwnershipKey, type CardPlacement } from '@/types/placement'
import { emptyValue, addCardValue, type ValueSummary } from '@/utils/value'

interface PriceLike { eur: string | null; eurFoil: string | null }
type PriceLookup = (cardId: string) => PriceLike | undefined
type OwnedLookup = (ownershipKey: string) => boolean

export interface CardLocation { binderName: string; pageNumber: number; slotOnPage: number }
export interface BinderStat { planned: number; owned: number }

/**
 * Placements for every plan, recomputed when plans/binders/segments change.
 * Shared by HomePage (card-location lookup) and PlanEditor (overview stats),
 * which each derive their own aggregation from the result map.
 */
// Shared, module-level placement state so it persists across route changes: navigating
// Dashboard <-> card detail no longer re-resolves and flashes. Computed once on first use,
// then kept fresh by a single app-lifetime deep watch on the layout stores. Call
// `recalculate()` to force a re-resolve — e.g. after a bulk import refreshes cached card
// data, which the watch can't see (the plans/segments/binders themselves didn't change).
const allPlacements = ref<Map<string, PlacementResult>>(new Map())
let started = false

async function recalculate(): Promise<void> {
  const plansStore = usePlansStore()
  const segmentsStore = useSegmentsStore()
  const bindersStore = useBindersStore()
  const next = new Map<string, PlacementResult>()
  for (const plan of plansStore.plans) {
    const segments = segmentsStore.getSegmentsInOrder(plan.segmentIds)
    const binders = bindersStore.getBindersInOrder(plan.binderIds)
    if (segments.length > 0 && binders.length > 0) {
      next.set(plan.id, await calculatePlacements(segments, binders))
    }
  }
  allPlacements.value = next
}

export function useAllPlacements() {
  if (!started) {
    started = true
    const plansStore = usePlansStore()
    const segmentsStore = useSegmentsStore()
    const bindersStore = useBindersStore()
    watch(
      () => [plansStore.plans, bindersStore.binders, segmentsStore.segments],
      () => { void recalculate() },
      { deep: true }
    )
    void recalculate()
  }
  return { allPlacements, recalculate }
}

/** Pure: "segmentId:cardIndex" -> human-readable binder location (first placement wins). */
export function buildCardLocationMap(
  results: Iterable<PlacementResult>,
  getBinderName: (binderId: string) => string | undefined
): Map<string, CardLocation> {
  const map = new Map<string, CardLocation>()
  for (const result of results) {
    for (const p of result.placements) {
      const key = `${p.segmentId}:${p.cardIndexInSegment}`
      if (map.has(key)) continue
      const binderName = getBinderName(p.binderId)
      if (binderName) {
        map.set(key, { binderName, pageNumber: p.pageNumber, slotOnPage: p.slotOnPage })
      }
    }
  }
  return map
}

/** Pure: per-binder planned/owned counts across all placement results. */
export function buildBinderStats(
  results: Iterable<PlacementResult>,
  isOwned: (ownershipKey: string) => boolean
): Map<string, BinderStat> {
  const stats = new Map<string, BinderStat>()
  for (const result of results) {
    for (const p of result.placements) {
      const current = stats.get(p.binderId) ?? { planned: 0, owned: 0 }
      current.planned++
      if (isOwned(getPlacementOwnershipKey(p))) current.owned++
      stats.set(p.binderId, current)
    }
  }
  return stats
}

/** Pure: owned + missing EUR value of a flat placement list. */
export function sumPlacementsValue(
  placements: CardPlacement[],
  getPrice: PriceLookup,
  isOwnedNonFoil: OwnedLookup,
  isOwnedFoil: OwnedLookup,
  isSkipped: OwnedLookup
): ValueSummary {
  const summary = emptyValue()
  for (const p of placements) {
    const key = getPlacementOwnershipKey(p)
    addCardValue(summary, getPrice(p.card.id), isOwnedNonFoil(key), isOwnedFoil(key), isSkipped(key))
  }
  return summary
}

/** Pure: per-binder owned + missing EUR value across all placement results. */
export function buildBinderValues(
  results: Iterable<PlacementResult>,
  getPrice: PriceLookup,
  isOwnedNonFoil: OwnedLookup,
  isOwnedFoil: OwnedLookup,
  isSkipped: OwnedLookup
): Map<string, ValueSummary> {
  const values = new Map<string, ValueSummary>()
  for (const result of results) {
    for (const p of result.placements) {
      let summary = values.get(p.binderId)
      if (!summary) {
        summary = emptyValue()
        values.set(p.binderId, summary)
      }
      const key = getPlacementOwnershipKey(p)
      addCardValue(summary, getPrice(p.card.id), isOwnedNonFoil(key), isOwnedFoil(key), isSkipped(key))
    }
  }
  return values
}
