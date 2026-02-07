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
  name: string
  collector_number: string
  set: string
  set_name: string
  rarity: string
  type_line: string
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
