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
  /** True for multicolor cards (shown gold rather than the single-color art/thumbnail). */
  multicolor?: boolean
  /** Latest Scryfall EUR prices (raw strings, e.g. "7.24") when fetched; absent otherwise. */
  eur?: string | null
  eurFoil?: string | null
  /** When the prices above were retrieved (ms epoch), surfaced as a hover tooltip. */
  priceFetchedAt?: number
  /** Which finish(es) are owned; drives which price is the reference vs muted. */
  ownsNonFoil?: boolean
  ownsFoil?: boolean
  /** Which finishes this printing exists in; restricts what can be marked owned. */
  canNonFoil?: boolean
  canFoil?: boolean
}
