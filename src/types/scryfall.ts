export interface ScryfallSet {
  code: string
  name: string
  released_at: string
  set_type: string
  card_count: number
  icon_svg_uri: string
}

export interface ScryfallCard {
  id: string
  /** Groups every printing of the same card. Absent on cards cached before it was tracked. */
  oracle_id?: string
  name: string
  collector_number: string
  set: string
  set_name: string
  rarity: string
  type_line: string
  /** Scryfall layout, e.g. "normal", "transform", "art_series". Art Series = non-playable art cards. */
  layout?: string
  /** This printing's Cardmarket product id (their `idProduct`). Absent for cards with no
   *  Cardmarket product, or cached before it was tracked. Drives Cardmarket export mapping. */
  cardmarket_id?: number
  /** Border colour, e.g. "black", "borderless". "borderless" is a strong Cardmarket-Extras signal. */
  border_color?: string
  /** Frame treatments, e.g. ["showcase"], ["extendedart"], ["inverted"] — used to detect Extras. */
  frame_effects?: string[]
  /** Finishes this printing exists in, e.g. ["nonfoil","foil"], ["foil"]. May include "etched". */
  finishes?: string[]
  /** Promo/treatment tags, e.g. ["surgefoil"], ["galaxyfoil"] — used to label special foils. */
  promo_types?: string[]
  /** Scryfall-provided store links for this exact printing. */
  purchase_uris?: {
    tcgplayer?: string
    cardmarket?: string
    cardhoarder?: string
  }
  oracle_text?: string
  mana_cost?: string
  cmc?: number
  colors?: string[]
  color_identity?: string[]
  power?: string
  toughness?: string
  loyalty?: string
  image_uris?: {
    small: string
    normal: string
    large: string
  }
  card_faces?: Array<{
    name: string
    type_line: string
    oracle_text?: string
    mana_cost?: string
    colors?: string[]
    power?: string
    toughness?: string
    loyalty?: string
    image_uris?: {
      small: string
      normal: string
      large: string
    }
  }>
}
