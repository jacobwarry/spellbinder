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
