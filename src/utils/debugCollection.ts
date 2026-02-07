import { useSegmentsStore, useCollectionStore, usePlansStore } from '@/stores'

export function debugCollectionData() {
  const segmentsStore = useSegmentsStore()
  const collectionStore = useCollectionStore()

  console.group('🔍 Collection Data Debug')

  // Check for invalid ownership keys
  const invalidOwned: string[] = []
  const validOwned: string[] = []

  for (const key of collectionStore.ownedCardIds) {
    if (!key.includes(':')) {
      // Old format or invalid key
      invalidOwned.push(key)
      continue
    }

    const parts = key.split(':')
    const segmentId = parts[0]!
    const indexStr = parts[1]!
    const index = parseInt(indexStr, 10)
    const segment = segmentsStore.getSegment(segmentId)

    if (!segment) {
      invalidOwned.push(`${key} (segment not found)`)
    } else if (index < 0 || index >= segment.cardIds.length) {
      invalidOwned.push(`${key} (index ${index} out of range, segment has ${segment.cardIds.length} cards)`)
    } else {
      validOwned.push(key)
    }
  }

  // Check for invalid skipped keys
  const invalidSkipped: string[] = []
  const validSkipped: string[] = []

  for (const key of collectionStore.skippedCardIds) {
    if (!key.includes(':')) {
      invalidSkipped.push(key)
      continue
    }

    const skippedParts = key.split(':')
    const segmentId = skippedParts[0]!
    const indexStr = skippedParts[1]!
    const index = parseInt(indexStr, 10)
    const segment = segmentsStore.getSegment(segmentId)

    if (!segment) {
      invalidSkipped.push(`${key} (segment not found)`)
    } else if (index < 0 || index >= segment.cardIds.length) {
      invalidSkipped.push(`${key} (index ${index} out of range, segment has ${segment.cardIds.length} cards)`)
    } else {
      validSkipped.push(key)
    }
  }

  console.log('✅ Valid owned keys:', validOwned.length)
  console.log('✅ Valid skipped keys:', validSkipped.length)

  if (invalidOwned.length > 0) {
    console.warn('❌ Invalid owned keys:', invalidOwned.length)
    console.table(invalidOwned.slice(0, 100)) // Show first 100
  }

  if (invalidSkipped.length > 0) {
    console.warn('❌ Invalid skipped keys:', invalidSkipped.length)
    console.table(invalidSkipped.slice(0, 100)) // Show first 100
  }

  console.groupEnd()

  return {
    validOwned,
    validSkipped,
    invalidOwned,
    invalidSkipped
  }
}

export function cleanupInvalidKeys() {
  const result = debugCollectionData()

  if (result.invalidOwned.length === 0 && result.invalidSkipped.length === 0) {
    alert('✨ No invalid keys found. Collection data is clean!')
    console.log('✨ No invalid keys found. Collection data is clean!')
    return
  }

  if (!confirm(`Found ${result.invalidOwned.length} invalid owned keys and ${result.invalidSkipped.length} invalid skipped keys.\n\nThis will keep only the ${result.validOwned.length} valid owned and ${result.validSkipped.length} valid skipped keys.\n\nClean them up?`)) {
    return
  }

  const collectionStore = useCollectionStore()

  // Create new sets with only valid keys
  const newOwnedCardIds = new Set<string>(result.validOwned)
  const newSkippedCardIds = new Set<string>(result.validSkipped)

  // Save to localStorage directly
  localStorage.setItem('spellbinder-collection', JSON.stringify([...newOwnedCardIds]))
  localStorage.setItem('spellbinder-skipped', JSON.stringify([...newSkippedCardIds]))

  // Update the store refs to trigger reactivity
  collectionStore.ownedCardIds = newOwnedCardIds
  collectionStore.skippedCardIds = newSkippedCardIds

  const message = `✅ Cleanup complete!\n\nKept ${result.validOwned.length} valid owned keys\nKept ${result.validSkipped.length} valid skipped keys\nRemoved ${result.invalidOwned.length} invalid owned keys\nRemoved ${result.invalidSkipped.length} invalid skipped keys\n\nPlease refresh the page to see the changes.`
  alert(message)
  console.log(message)
}

export function findDuplicateCardsInSegments() {
  const segmentsStore = useSegmentsStore()

  console.group('🔍 Checking for duplicate cards in segments')

  let totalDuplicates = 0

  for (const segment of segmentsStore.segments) {
    const cardCounts = new Map<string, number[]>()

    // Count occurrences of each card ID and track their indices
    segment.cardIds.forEach((cardId, index) => {
      if (!cardCounts.has(cardId)) {
        cardCounts.set(cardId, [])
      }
      cardCounts.get(cardId)!.push(index)
    })

    // Find cards that appear multiple times
    const duplicates = Array.from(cardCounts.entries())
      .filter(([_, indices]) => indices.length > 1)

    if (duplicates.length > 0) {
      console.group(`❌ Segment: ${segment.name}`)
      for (const [cardId, indices] of duplicates) {
        console.log(`Card ID ${cardId} appears at indices: ${indices.join(', ')}`)
        totalDuplicates += indices.length - 1
      }
      console.groupEnd()
    }
  }

  if (totalDuplicates === 0) {
    console.log('✅ No duplicate cards found in any segment')
  } else {
    console.warn(`Found ${totalDuplicates} duplicate card entries across all segments`)
  }

  console.groupEnd()
}

export function findOwnershipInconsistencies() {
  const segmentsStore = useSegmentsStore()
  const collectionStore = useCollectionStore()

  console.group('🔍 Checking for ownership inconsistencies in duplicate cards')

  const inconsistencies: Array<{
    segment: string
    cardId: string
    indices: number[]
    ownedIndices: number[]
    skippedIndices: number[]
  }> = []

  for (const segment of segmentsStore.segments) {
    const cardCounts = new Map<string, number[]>()

    // Find duplicate cards
    segment.cardIds.forEach((cardId, index) => {
      if (!cardCounts.has(cardId)) {
        cardCounts.set(cardId, [])
      }
      cardCounts.get(cardId)!.push(index)
    })

    // Check for inconsistent ownership in duplicates
    for (const [cardId, indices] of cardCounts.entries()) {
      if (indices.length <= 1) continue // Skip non-duplicates

      const ownedIndices: number[] = []
      const skippedIndices: number[] = []

      for (const index of indices) {
        const key = `${segment.id}:${index}`
        if (collectionStore.isOwned(key)) {
          ownedIndices.push(index)
        }
        if (collectionStore.isSkipped(key)) {
          skippedIndices.push(index)
        }
      }

      // If some copies are owned/skipped but not all, it's inconsistent
      const hasInconsistency =
        (ownedIndices.length > 0 && ownedIndices.length < indices.length) ||
        (skippedIndices.length > 0 && skippedIndices.length < indices.length)

      if (hasInconsistency) {
        inconsistencies.push({
          segment: segment.name,
          cardId,
          indices,
          ownedIndices,
          skippedIndices
        })
      }
    }
  }

  if (inconsistencies.length === 0) {
    console.log('✅ No ownership inconsistencies found')
  } else {
    console.warn(`Found ${inconsistencies.length} cards with inconsistent ownership`)
    for (const inc of inconsistencies) {
      console.group(`Card ${inc.cardId} in ${inc.segment}`)
      console.log(`Total copies: ${inc.indices.length} at indices ${inc.indices.join(', ')}`)
      console.log(`Owned copies: ${inc.ownedIndices.length} at indices ${inc.ownedIndices.join(', ')}`)
      console.log(`Skipped copies: ${inc.skippedIndices.length} at indices ${inc.skippedIndices.join(', ')}`)
      console.groupEnd()
    }
  }

  console.groupEnd()

  return inconsistencies
}

export function fixOwnershipInconsistencies() {
  const inconsistencies = findOwnershipInconsistencies()

  if (inconsistencies.length === 0) {
    alert('✨ No inconsistencies to fix!')
    return
  }

  if (!confirm(`Found ${inconsistencies.length} cards with inconsistent ownership.\n\nFix by marking ALL copies as owned if ANY copy is owned?\n(Skipped status will remain per-copy)`)) {
    return
  }

  const segmentsStore = useSegmentsStore()
  const collectionStore = useCollectionStore()

  for (const inc of inconsistencies) {
    const segment = segmentsStore.segments.find(s => s.name === inc.segment)
    if (!segment) continue

    // If any copy is owned, mark all copies as owned
    if (inc.ownedIndices.length > 0) {
      for (const index of inc.indices) {
        const key = `${segment.id}:${index}`
        if (!collectionStore.isOwned(key)) {
          collectionStore.setOwned(key, true)
        }
      }
    }
  }

  alert(`✅ Fixed ownership for ${inconsistencies.length} cards!\n\nAll copies of each card now have consistent ownership.`)
  console.log(`✅ Fixed ${inconsistencies.length} inconsistencies`)
}

export function cleanupOrphanedSegments() {
  const segmentsStore = useSegmentsStore()
  const plansStore = usePlansStore()
  const collectionStore = useCollectionStore()

  console.group('🔍 Checking for orphaned segments')

  // Get all segment IDs that are referenced by plans
  const usedSegmentIds = new Set<string>()
  for (const plan of plansStore.plans) {
    for (const segmentId of plan.segmentIds) {
      usedSegmentIds.add(segmentId)
    }
  }

  // Find segments that aren't referenced by any plan
  const orphanedSegments = segmentsStore.segments.filter(
    segment => !usedSegmentIds.has(segment.id)
  )

  console.log(`Total segments: ${segmentsStore.segments.length}`)
  console.log(`Used segments: ${usedSegmentIds.size}`)
  console.log(`Orphaned segments: ${orphanedSegments.length}`)

  if (orphanedSegments.length > 0) {
    console.table(orphanedSegments.map(s => ({ id: s.id, name: s.name, cards: s.cardIds.length })))
  }

  console.groupEnd()

  if (orphanedSegments.length === 0) {
    alert('✨ No orphaned segments found!')
    return
  }

  if (!confirm(`Found ${orphanedSegments.length} segments that aren't used in any plan.\n\nDelete these segments and their ownership data?`)) {
    return
  }

  // Count ownership keys that will be removed
  let removedOwnedKeys = 0
  let removedSkippedKeys = 0

  for (const segment of orphanedSegments) {
    // Remove ownership keys for this segment
    for (let i = 0; i < segment.cardIds.length; i++) {
      const key = `${segment.id}:${i}`
      if (collectionStore.ownedCardIds.has(key)) {
        collectionStore.ownedCardIds.delete(key)
        removedOwnedKeys++
      }
      if (collectionStore.skippedCardIds.has(key)) {
        collectionStore.skippedCardIds.delete(key)
        removedSkippedKeys++
      }
    }
  }

  // Save ownership changes
  localStorage.setItem('spellbinder-collection', JSON.stringify([...collectionStore.ownedCardIds]))
  localStorage.setItem('spellbinder-skipped', JSON.stringify([...collectionStore.skippedCardIds]))

  // Remove segments from store
  const orphanedIds = new Set(orphanedSegments.map(s => s.id))
  const newSegments = segmentsStore.segments.filter(s => !orphanedIds.has(s.id))

  // Save to localStorage directly
  localStorage.setItem('spellbinder-segments', JSON.stringify(newSegments))

  // Update store
  segmentsStore.segments = newSegments

  const message = `✅ Cleanup complete!\n\nRemoved ${orphanedSegments.length} orphaned segments\nRemoved ${removedOwnedKeys} owned keys\nRemoved ${removedSkippedKeys} skipped keys\n\nPlease refresh the page.`
  alert(message)
  console.log(message)
}
