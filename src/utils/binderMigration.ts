import { deleteBinderImage } from './binderImages'

/**
 * Remove binder records not referenced by any plan (orphans left behind before
 * storage removal cascaded — see plans store). Runs at boot; also deletes each
 * orphan's cover image. Safe because unreferenced binders are unreachable in the UI.
 */
export function purgeOrphanedBinders(): void {
  const bindersRaw = localStorage.getItem('spellbinder-binders')
  if (!bindersRaw) return

  try {
    const binders = JSON.parse(bindersRaw) as Array<{ id: string }>
    const plans = JSON.parse(localStorage.getItem('spellbinder-plans') || '[]') as Array<{ binderIds?: string[] }>

    const referenced = new Set<string>()
    for (const plan of plans) {
      for (const id of plan.binderIds ?? []) referenced.add(id)
    }

    const removed = binders.filter(b => !referenced.has(b.id))
    if (removed.length === 0) return

    const kept = binders.filter(b => referenced.has(b.id))
    localStorage.setItem('spellbinder-binders', JSON.stringify(kept))
    console.log(`Purged ${removed.length} orphaned storage record(s)`)

    // Best-effort cover-image cleanup (async; ignore failures).
    for (const b of removed) {
      void deleteBinderImage(b.id).catch(() => {})
    }
  } catch (error) {
    console.error('Failed to purge orphaned binders:', error)
  }
}

export function migrateBindersToTyped(): void {
  const stored = localStorage.getItem('spellbinder-binders')
  if (!stored) return

  try {
    const binders = JSON.parse(stored)
    let needsMigration = false

    const migrated = binders.map((b: any) => {
      if (!b.type) {
        needsMigration = true
        // Old binder format - add type field
        return {
          ...b,
          type: 'binder' as const
        }
      }
      return b
    })

    if (needsMigration) {
      localStorage.setItem('spellbinder-binders', JSON.stringify(migrated))
      console.log('Migrated binders to typed format')
    }
  } catch (error) {
    console.error('Failed to migrate binders:', error)
  }
}
