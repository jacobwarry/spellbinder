import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BinderPlan } from '@/types'
import { useSegmentsStore } from './segments'

const STORAGE_KEY = 'spellbinder-plans'

function generateId(): string {
  return crypto.randomUUID()
}

function loadFromStorage(): BinderPlan[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

function saveToStorage(plans: BinderPlan[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans))
}

export const usePlansStore = defineStore('plans', () => {
  const plans = ref<BinderPlan[]>(loadFromStorage())

  const planMap = computed(() => {
    const map = new Map<string, BinderPlan>()
    for (const plan of plans.value) {
      map.set(plan.id, plan)
    }
    return map
  })

  function getPlan(id: string): BinderPlan | undefined {
    return planMap.value.get(id)
  }

  function createPlan(name: string): BinderPlan {
    const plan: BinderPlan = {
      id: generateId(),
      name,
      binderIds: [],
      segmentIds: []
    }
    plans.value.push(plan)
    saveToStorage(plans.value)
    return plan
  }

  function updatePlan(id: string, updates: Partial<Omit<BinderPlan, 'id'>>): void {
    const index = plans.value.findIndex(p => p.id === id)
    if (index !== -1) {
      const existing = plans.value[index]
      if (existing) {
        plans.value[index] = { ...existing, ...updates }
        saveToStorage(plans.value)
      }
    }
  }

  // Segments aren't shared between plans, but guard anyway: only delete a segment
  // once no remaining plan references it, so we never orphan it (the bug) or yank
  // a still-used one. removeSegment cascades to clear its ownership data.
  function deleteSegmentIfUnreferenced(segmentId: string): void {
    const stillReferenced = plans.value.some(p => p.segmentIds.includes(segmentId))
    if (!stillReferenced) {
      useSegmentsStore().removeSegment(segmentId)
    }
  }

  function removePlan(id: string): void {
    const index = plans.value.findIndex(p => p.id === id)
    if (index !== -1) {
      const [removed] = plans.value.splice(index, 1)
      saveToStorage(plans.value)
      // Clean up segments that no remaining plan references.
      if (removed) {
        for (const segmentId of removed.segmentIds) {
          deleteSegmentIfUnreferenced(segmentId)
        }
      }
    }
  }

  function addBinderToPlan(planId: string, binderId: string): void {
    const plan = getPlan(planId)
    if (plan && !plan.binderIds.includes(binderId)) {
      plan.binderIds.push(binderId)
      saveToStorage(plans.value)
    }
  }

  function removeBinderFromPlan(planId: string, binderId: string): void {
    const plan = getPlan(planId)
    if (plan) {
      const index = plan.binderIds.indexOf(binderId)
      if (index !== -1) {
        plan.binderIds.splice(index, 1)
        saveToStorage(plans.value)
      }
    }
  }

  function reorderBinders(planId: string, binderIds: string[]): void {
    const plan = getPlan(planId)
    if (plan) {
      plan.binderIds = binderIds
      saveToStorage(plans.value)
    }
  }

  function addSegmentToPlan(planId: string, segmentId: string): void {
    const plan = getPlan(planId)
    if (plan && !plan.segmentIds.includes(segmentId)) {
      plan.segmentIds.push(segmentId)
      saveToStorage(plans.value)
    }
  }

  function insertSegmentInPlan(planId: string, segmentId: string, index: number): void {
    const plan = getPlan(planId)
    if (plan && !plan.segmentIds.includes(segmentId)) {
      plan.segmentIds.splice(index, 0, segmentId)
      saveToStorage(plans.value)
    }
  }

  function removeSegmentFromPlan(planId: string, segmentId: string): void {
    const plan = getPlan(planId)
    if (plan) {
      const index = plan.segmentIds.indexOf(segmentId)
      if (index !== -1) {
        plan.segmentIds.splice(index, 1)
        saveToStorage(plans.value)
        // Unlinking from the plan is the user's "remove this set" action, so the
        // segment itself should go too (along with its ownership keys).
        deleteSegmentIfUnreferenced(segmentId)
      }
    }
  }

  function reorderSegments(planId: string, segmentIds: string[]): void {
    const plan = getPlan(planId)
    if (plan) {
      plan.segmentIds = segmentIds
      saveToStorage(plans.value)
    }
  }

  return {
    plans,
    planMap,
    getPlan,
    createPlan,
    updatePlan,
    removePlan,
    addBinderToPlan,
    removeBinderFromPlan,
    reorderBinders,
    addSegmentToPlan,
    insertSegmentInPlan,
    removeSegmentFromPlan,
    reorderSegments
  }
})
