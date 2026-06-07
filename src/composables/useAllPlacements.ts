import { ref, onMounted, watch } from 'vue'
import { usePlansStore, useSegmentsStore, useBindersStore } from '@/stores'
import { calculatePlacements, type PlacementResult } from './usePlacement'
import { getPlacementOwnershipKey } from '@/types/placement'

export interface CardLocation { binderName: string; pageNumber: number; slotOnPage: number }
export interface BinderStat { planned: number; owned: number }

/**
 * Placements for every plan, recomputed when plans/binders/segments change.
 * Shared by HomePage (card-location lookup) and PlanEditor (overview stats),
 * which each derive their own aggregation from the result map.
 */
export function useAllPlacements() {
  const plansStore = usePlansStore()
  const segmentsStore = useSegmentsStore()
  const bindersStore = useBindersStore()

  const allPlacements = ref<Map<string, PlacementResult>>(new Map())

  async function recalculate() {
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

  watch(
    () => [plansStore.plans, bindersStore.binders, segmentsStore.segments],
    recalculate,
    { deep: true }
  )
  onMounted(recalculate)

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
