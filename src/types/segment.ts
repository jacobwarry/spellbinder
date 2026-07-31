export interface Segment {
  id: string
  name: string
  scryfallSetCode: string  // '' for custom sections (cards come from any set)
  cardIds: string[]
  // Blank slots before the segment starts. May be negative to pull the segment
  // back, down to `-(slotsPerPage)` of the binder type (one full page); the
  // placement engine floors the resulting slot at 0.
  offset: number
  // Whole-page offset applied before `offset`. Resolved to blank slots as
  // `pageOffset * slotsPerPage` of the binder that receives the segment (0 for boxes).
  pageOffset?: number
  targetBinderId?: string
  spacersBefore: Record<number, number>  // cardIndex -> number of blank slots before that card
  // Which face to render for a slot: cardIndex -> face index (1 = back). Absent means the
  // front face. Used for double-faced cards, where the back is added as its own adjacent slot
  // (a second physical copy) so both sides can be displayed. Position-keyed, so it must shift
  // in lockstep with cardIds/spacersBefore/ownership on any insert or remove.
  backFaces?: Record<number, number>
  // Custom sections hold hand-picked cards from any set (e.g. promos, trailing extras)
  // rather than one Scryfall set. Undefined/false = a normal set-backed segment.
  isCustom?: boolean
}
