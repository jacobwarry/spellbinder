/**
 * Short display label for a special (non-regular) foil treatment, from Scryfall's
 * `promo_types` (plus the `etched` finish). Returns null for regular foil/non-foil.
 */
const TREATMENTS: Record<string, string> = {
  surgefoil: 'Surge',
  galaxyfoil: 'Galaxy',
  rainbowfoil: 'Rainbow',
  doublerainbow: 'Rainbow',
  manafoil: 'Mana',
  neonink: 'Neon Ink',
  gilded: 'Gilded',
  textured: 'Textured',
  oilslick: 'Oil Slick',
  halofoil: 'Halo',
  confettifoil: 'Confetti',
  stepandcompleat: 'Compleat',
  raisedfoil: 'Raised',
  ripplefoil: 'Ripple',
  silverfoil: 'Silver',
  goldfoil: 'Gold',
  chocobotrackfoil: 'Chocobo Track',
  dragonscalefoil: 'Dragon Scale',
  fracturefoil: 'Fracture',
  invisibleink: 'Invisible Ink',
  shatteredglass: 'Shattered Glass'
}

export function specialFinishLabel(promoTypes?: string[], finishes?: string[]): string | null {
  if (finishes?.includes('etched')) return 'Etched'
  if (promoTypes) {
    for (const t of promoTypes) {
      const label = TREATMENTS[t]
      if (label) return label
    }
  }
  return null
}
