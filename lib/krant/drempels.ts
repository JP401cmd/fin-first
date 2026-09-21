// ── Drempels bij naam: de huidige waarde van een regelgevingsgrens ──────────
//
// Het model levert in de duiding NOOIT het bedrag van een bestaande drempel;
// het noemt hoogstens een SLEUTEL uit deze catalogus. De waarde komt uit de
// canonieke bronnen (lib/box3-data.ts, lib/box1-tax.ts, lib/constants.ts) —
// consume, don't recompute. Alleen een NIEUW aangekondigde waarde staat als
// gewone param in de duiding, en die moet door de grondingstoets.
//
// De matcher (1B) leest hier de "oude" kant van een parameterwijziging:
// `DREMPELS['heffingsvrij-vermogen-single'](2026)` naast de gegronde nieuwe
// waarde uit `duiding.mechanisme.params`.
//
// `null` betekent: voor dat jaar is er geen canonieke waarde (het jaar staat
// niet in de parametertabellen). De consument mag dan niet gokken — hij
// degradeert naar 'onbekend'. Geen lokale getallen in dit bestand.

import { BOX3_PARAMS, type TaxYear } from '@/lib/box3-data'
import { BOX1_PARAMS, type Box1TaxYear } from '@/lib/box1-tax'
import { NL_AOW_AGE, NHG_KOSTENGRENS, STARTERSVRIJSTELLING_MAX, OVB_TARIEF_EIGEN_WONING } from '@/lib/constants'

export const DREMPEL_SLEUTELS = [
  'heffingsvrij-vermogen-single',
  'heffingsvrij-vermogen-partner',
  'schuldendrempel-single',
  'schuldendrempel-partner',
  'forfait-spaargeld',
  'forfait-beleggingen',
  'forfait-schulden',
  'box3-tarief',
  'box1-schijf-1-grens',
  'box1-schijf-2-grens',
  'box1-schijf-1-tarief',
  'box1-schijf-2-tarief',
  'box1-schijf-3-tarief',
  'algemene-heffingskorting-max',
  'arbeidskorting-max',
  'nhg-kostengrens',
  'startersvrijstelling-max',
  'overdrachtsbelasting-eigen-woning',
  'aow-leeftijd-standaard',
] as const

export type DrempelSleutel = (typeof DREMPEL_SLEUTELS)[number]

/** Waarde van een drempel voor een jaar, of null als dat jaar niet canoniek bekend is. */
export type DrempelLezer = (jaar: number) => number | null

function box3(jaar: number): (typeof BOX3_PARAMS)[TaxYear] | null {
  return jaar in BOX3_PARAMS ? BOX3_PARAMS[jaar as TaxYear] : null
}

function box1(jaar: number): (typeof BOX1_PARAMS)[Box1TaxYear] | null {
  return jaar in BOX1_PARAMS ? BOX1_PARAMS[jaar as Box1TaxYear] : null
}

/**
 * Jaar-onafhankelijke constanten. Ze dragen in lib/constants.ts geen jaar;
 * het jaar-argument wordt genegeerd zodat elke sleutel dezelfde signatuur heeft.
 */
const vast = (waarde: number): DrempelLezer => () => waarde

export const DREMPELS: Record<DrempelSleutel, DrempelLezer> = {
  'heffingsvrij-vermogen-single': (jaar) => box3(jaar)?.heffingsvrijSingle ?? null,
  'heffingsvrij-vermogen-partner': (jaar) => box3(jaar)?.heffingsvrijPartner ?? null,
  'schuldendrempel-single': (jaar) => box3(jaar)?.schuldendrempelSingle ?? null,
  'schuldendrempel-partner': (jaar) => box3(jaar)?.schuldendrempelPartner ?? null,
  'forfait-spaargeld': (jaar) => box3(jaar)?.forfaitSpaargeld ?? null,
  'forfait-beleggingen': (jaar) => box3(jaar)?.forfaitBeleggingen ?? null,
  'forfait-schulden': (jaar) => box3(jaar)?.forfaitSchulden ?? null,
  'box3-tarief': (jaar) => box3(jaar)?.tarief ?? null,
  'box1-schijf-1-grens': (jaar) => box1(jaar)?.schijven[0]?.tot ?? null,
  'box1-schijf-2-grens': (jaar) => box1(jaar)?.schijven[1]?.tot ?? null,
  'box1-schijf-1-tarief': (jaar) => box1(jaar)?.schijven[0]?.tarief ?? null,
  'box1-schijf-2-tarief': (jaar) => box1(jaar)?.schijven[1]?.tarief ?? null,
  'box1-schijf-3-tarief': (jaar) => box1(jaar)?.schijven[2]?.tarief ?? null,
  'algemene-heffingskorting-max': (jaar) => box1(jaar)?.algemeneHeffingskorting.max ?? null,
  'arbeidskorting-max': (jaar) => box1(jaar)?.arbeidskorting.max ?? null,
  'nhg-kostengrens': vast(NHG_KOSTENGRENS),
  'startersvrijstelling-max': vast(STARTERSVRIJSTELLING_MAX),
  'overdrachtsbelasting-eigen-woning': vast(OVB_TARIEF_EIGEN_WONING),
  'aow-leeftijd-standaard': vast(NL_AOW_AGE),
}

/**
 * De EENHEID waarin een drempel terugkomt — precies zoals de bron 'm draagt.
 * Let op de val voor de matcher (1B): tarieven en forfaits zijn hier een
 * FRACTIE (`BOX3_PARAMS.tarief = 0.36`), terwijl de duidingsparams dezelfde
 * grootheid als PERCENTAGE dragen (`tarief_pct: 36`, zie mechanismen.ts). Wie
 * oud naast nieuw legt, deelt de param door 100 — en bewaakt dat met een test,
 * want compile-technisch zijn beide gewoon `number`.
 */
export const DREMPEL_EENHEID: Record<DrempelSleutel, 'eur' | 'fractie' | 'jaar'> = {
  'heffingsvrij-vermogen-single': 'eur',
  'heffingsvrij-vermogen-partner': 'eur',
  'schuldendrempel-single': 'eur',
  'schuldendrempel-partner': 'eur',
  'forfait-spaargeld': 'fractie',
  'forfait-beleggingen': 'fractie',
  'forfait-schulden': 'fractie',
  'box3-tarief': 'fractie',
  'box1-schijf-1-grens': 'eur',
  'box1-schijf-2-grens': 'eur',
  'box1-schijf-1-tarief': 'fractie',
  'box1-schijf-2-tarief': 'fractie',
  'box1-schijf-3-tarief': 'fractie',
  'algemene-heffingskorting-max': 'eur',
  'arbeidskorting-max': 'eur',
  'nhg-kostengrens': 'eur',
  'startersvrijstelling-max': 'eur',
  'overdrachtsbelasting-eigen-woning': 'fractie',
  'aow-leeftijd-standaard': 'jaar',
}

export function isDrempelSleutel(waarde: string): waarde is DrempelSleutel {
  return (DREMPEL_SLEUTELS as readonly string[]).includes(waarde)
}
