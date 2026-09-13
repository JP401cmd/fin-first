import { describe, expect, it } from 'vitest'
import { WOONSTRATEGIE_MODE_META } from '@/components/future/strategie/housing-strategy-section'
import { SURPLUS_OPTIONS } from '@/components/future/regels/verdeling-toename-body'
import { ORDER_PRESET_COPY } from '@/components/future/regels/order-preset-picker'
import { PROFIEL_INFO } from '@/components/future/regels/onttrekkingsstrategie-body'
import { VOORKEUR_UITLEG } from '@/components/future/voorkeur-bewerken-body'
import { BOX3_METHOD_INTRO, BOX3_METHOD_UITLEG, HEFFINGVRIJ_INKOMEN_UITLEG } from '@/components/future/box3-methode-body'
import { INKOMSTEN_UITLEG } from './inkomsten-editor'
import { REGEL_META } from '@/lib/future/regel-registry'
import { PLAN_REVIEW_LAAG2 } from '@/lib/plan-review/types'

/**
 * A8 uitgebreid naar de editor-bodies (TPR-15, compliance-check 14 sep 2026). `overzicht.test.ts`
 * toetst de overzichtskopij van de vijf stappen; sinds de wizard de BESTAANDE bodies inline
 * toont, staat ook hún kopij in de wizard. Die mag niet oordelen, niet aansporen en niets
 * beloven (Wft: inzicht, geen advies; claimlijst: geen "gegarandeerd").
 *
 * Bewust de optie-kopij als data (Record<Union>-constanten), niet de gerenderde DOM: een nieuwe
 * optie komt hier vanzelf mee. Vrije JSX-zinnen in de bodies vallen buiten deze toets en gaan
 * via de compliance-check.
 */

const VERBODEN = [
  'aanbevol',
  'past bij',
  'advies',
  'je moet',
  'raden we',
  'verstandig',
  'beste keuze',
  'onrealistisch',
  'internationale standaard',
  'conservatief',
  'gegarandeerd',
  'veilig',
  'beschermt',
  'beschermen',
  'robuust',
  'gunstig',
  'vriendelijk',
  'meer rust',
  'geeft rust',
  'voorzichtige aanname',
  'dempt',
  'maximale',
  'sequence-risk',
  'pro-rata',
  'volgt later',
]

/** Alleen de tekstwaarden (geen sleutels of id's zoals `rendement-beschermen`). */
function teksten(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(teksten)
  if (v && typeof v === 'object') return Object.values(v).flatMap(teksten)
  return []
}

const kopij = teksten([
  WOONSTRATEGIE_MODE_META,
  SURPLUS_OPTIONS,
  ORDER_PRESET_COPY,
  PROFIEL_INFO,
  VOORKEUR_UITLEG,
  BOX3_METHOD_INTRO,
  BOX3_METHOD_UITLEG,
  HEFFINGVRIJ_INKOMEN_UITLEG,
  INKOMSTEN_UITLEG,
  REGEL_META,
  PLAN_REVIEW_LAAG2,
])
  .join(' | ')
  .toLowerCase()

describe('A8 — wizardkopij in de editor-bodies oordeelt en belooft niet', () => {
  it.each(VERBODEN)('bevat niet "%s"', (woord) => {
    expect(kopij).not.toContain(woord)
  })
})
