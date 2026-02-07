export interface Segment {
  id: string
  name: string
  scryfallSetCode: string
  cardIds: string[]
  offset: number
  targetBinderId?: string
  spacersBefore: Record<number, number>  // cardIndex -> number of blank slots before that card
}
