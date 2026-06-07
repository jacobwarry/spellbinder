/** Shared presentational types for the common component atoms. */
export type Mana = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
export type Ownership = 'owned' | 'missing' | 'skipped'
export interface ColorCounts { w: number; u: number; b: number; r: number; g: number; c: number }

/** A card occupying a binder/box slot (presentational shape shared by the slot + viewer). */
export interface BinderSlotCard {
  name: string
  set: string
  number: string
  color: Mana
  status: Ownership
  rarity?: string
  image?: string
}
