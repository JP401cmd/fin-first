// ── Nieuwsprofiel v1: het schema van de dertien velden en hun banden ─────────
//
// Het VOCABULAIRE staat in `profiel-velden.ts` (1A, gedeeld met de duiding);
// dit bestand is de VORM waarin een profiel bestaat en de GRENZEN van elke
// band. De matcher (1B) leest hier; het profielscherm (2x) schrijft hier; de
// afleiding uit eigen data (fase 2 van 1B) vult hier.
//
// Drie regels die het model bepalen (K0/K1, 21 sep 2026):
//   B1  banden, geen bedragen; geboortejaar i.p.v. leeftijdsband
//   B2  alleen euro's — geen uitgavenband, dus dertien velden (ADR 0172)
//   "weet ik niet" is overal geldig: `null`. De matcher gokt nooit; een
//   ontbrekend veld maakt een som `ontbreekt` en het bericht `relevant`.
//
// Banden zijn HALFOPEN: `lo` hoort erbij, `hi` niet (lo ≤ x < hi). De
// bovenste band heeft `hi: null` — daar kent de Krant alleen een ondergrens en
// zegt het sjabloon "minstens". `beleggingen: geen` is de lege band {0, 0}.
//
// euro-only (B2, ADR 0172): geen dagtarief, geen vrijheidstijd — bewaakt door
// lib/krant/euro-only.test.ts.
//
// PUUR: zod + constanten — client-veilig.

import { z } from 'zod'
import { DOELGROEP_SLEUTELS, GEBOORTEJAAR_MAX, GEBOORTEJAAR_MIN, type DoelgroepSleutel } from './profiel-velden'

export const PROFIEL_VERSIE = 1

// ── Banden ───────────────────────────────────────────────────────────────────

export interface Band {
  /** Ondergrens, inclusief. */
  lo: number
  /** Bovengrens, exclusief; null = open (alleen een ondergrens bekend). */
  hi: number | null
}

type BandSleutels<K extends DoelgroepSleutel> = (typeof DOELGROEP_SLEUTELS)[K]['waarden'][number]

/** Netto inkomen per maand (B1: eigen inkomen, geen partnerinkomen). */
export const INKOMEN_BANDEN: Record<BandSleutels<'inkomen'>, Band> = {
  'tot-1750': { lo: 0, hi: 1_750 },
  '1750-2500': { lo: 1_750, hi: 2_500 },
  '2500-3250': { lo: 2_500, hi: 3_250 },
  '3250-4250': { lo: 3_250, hi: 4_250 },
  '4250-5500': { lo: 4_250, hi: 5_500 },
  'boven-5500': { lo: 5_500, hi: null },
}

export const HYPOTHEEK_RESTSCHULD_BANDEN: Record<BandSleutels<'hypotheek_restschuld'>, Band> = {
  'tot-150k': { lo: 0, hi: 150_000 },
  '150k-300k': { lo: 150_000, hi: 300_000 },
  '300k-450k': { lo: 300_000, hi: 450_000 },
  'boven-450k': { lo: 450_000, hi: null },
}

/** Met fiscaal partner: het gezamenlijke spaargeld. */
export const SPAARGELD_BANDEN: Record<BandSleutels<'spaargeld'>, Band> = {
  'tot-5k': { lo: 0, hi: 5_000 },
  '5k-25k': { lo: 5_000, hi: 25_000 },
  '25k-50k': { lo: 25_000, hi: 50_000 },
  '50k-100k': { lo: 50_000, hi: 100_000 },
  '100k-250k': { lo: 100_000, hi: 250_000 },
  'boven-250k': { lo: 250_000, hi: null },
}

export const BELEGGINGEN_BANDEN: Record<BandSleutels<'beleggingen'>, Band> = {
  geen: { lo: 0, hi: 0 },
  'tot-25k': { lo: 0, hi: 25_000 },
  '25k-100k': { lo: 25_000, hi: 100_000 },
  '100k-250k': { lo: 100_000, hi: 250_000 },
  'boven-250k': { lo: 250_000, hi: null },
}

/** Alleen de studieschuld-waarden van `schulden` dragen een band; de rest is een vlag. */
export const STUDIESCHULD_BANDEN = {
  'studieschuld-tot-15k': { lo: 0, hi: 15_000 },
  'studieschuld-15k-40k': { lo: 15_000, hi: 40_000 },
  'studieschuld-boven-40k': { lo: 40_000, hi: null },
} as const satisfies Partial<Record<BandSleutels<'schulden'>, Band>>

export type StudieschuldBand = keyof typeof STUDIESCHULD_BANDEN

export function isStudieschuldBand(waarde: string): waarde is StudieschuldBand {
  return waarde in STUDIESCHULD_BANDEN
}

/** De band-sleutels van een geordend veld, in oplopende volgorde (voor minstens/hoogstens). */
export function bandVolgorde(sleutel: DoelgroepSleutel): readonly string[] {
  return DOELGROEP_SLEUTELS[sleutel].waarden
}

// ── Schema ───────────────────────────────────────────────────────────────────

function keuze<K extends DoelgroepSleutel>(sleutel: K) {
  return z.enum(DOELGROEP_SLEUTELS[sleutel].waarden as unknown as [string, ...string[]]) as unknown as z.ZodEnum<
    { [V in BandSleutels<K>]: V }
  >
}

const nullable = <T extends z.ZodTypeAny>(s: T) => s.nullable()

/**
 * Het profiel zoals de matcher het leest en het scherm het schrijft. Elk veld
 * is `null` voor "weet ik niet". Samengestelde velden (hypotheek, beleggingen,
 * pensioenopbouw) dragen hun dimensies apart, in lijn met DOELGROEP_SLEUTELS.
 * `rubrieken` = de rubrieken (news_articles.category) die de lezer vaker wil
 * zien; leeg of null = geen voorkeur. "Minder" komt niet uit het profiel maar
 * uit de feedback (demotedCategories) en gaat als context de matcher in.
 */
export const nieuwsprofielV1Schema = z.strictObject({
  versie: z.literal(PROFIEL_VERSIE),
  geboortejaar: nullable(z.number().int().min(GEBOORTEJAAR_MIN).max(GEBOORTEJAAR_MAX)),
  huishouden: nullable(keuze('huishouden')),
  kinderen: nullable(keuze('kinderen')),
  werk: nullable(z.array(keuze('werk')).min(1)),
  inkomen: nullable(keuze('inkomen')),
  wonen: nullable(keuze('wonen')),
  hypotheek: z.strictObject({
    restschuld: nullable(keuze('hypotheek_restschuld')),
    rentevast: nullable(keuze('hypotheek_rentevast')),
  }),
  woonplan: nullable(keuze('woonplan')),
  spaargeld: nullable(keuze('spaargeld')),
  beleggingen: z.strictObject({
    band: nullable(keuze('beleggingen')),
    vorm: nullable(z.array(keuze('beleggingen_vorm'))),
  }),
  schulden: nullable(z.array(keuze('schulden')).min(1)),
  pensioenopbouw: z.strictObject({
    werkgever: nullable(keuze('pensioen_werkgever')),
    lijfrente: nullable(keuze('pensioen_lijfrente')),
  }),
  rubrieken: nullable(z.array(z.string().min(1).max(40))),
})

export type NieuwsprofielV1 = z.infer<typeof nieuwsprofielV1Schema>

/** Alles onbekend — het profiel van iemand die nog niets heeft ingevuld. */
export const LEEG_PROFIEL: NieuwsprofielV1 = {
  versie: PROFIEL_VERSIE,
  geboortejaar: null,
  huishouden: null,
  kinderen: null,
  werk: null,
  inkomen: null,
  wonen: null,
  hypotheek: { restschuld: null, rentevast: null },
  woonplan: null,
  spaargeld: null,
  beleggingen: { band: null, vorm: null },
  schulden: null,
  pensioenopbouw: { werkgever: null, lijfrente: null },
  rubrieken: null,
}

/** De waarde van een profiel op een doelgroepsleutel; null = onbekend. */
export type ProfielWaarde = number | string | readonly string[] | null

/**
 * Eén accessor van doelgroepsleutel naar profielwaarde, zodat de matcher de
 * doelgroepregels van de duiding zonder per-veld-kennis kan toetsen.
 */
export function profielWaarde(profiel: NieuwsprofielV1, sleutel: DoelgroepSleutel): ProfielWaarde {
  switch (sleutel) {
    case 'geboortejaar':
      return profiel.geboortejaar
    case 'huishouden':
      return profiel.huishouden
    case 'kinderen':
      return profiel.kinderen
    case 'werk':
      return profiel.werk
    case 'inkomen':
      return profiel.inkomen
    case 'wonen':
      return profiel.wonen
    case 'hypotheek_restschuld':
      return profiel.hypotheek.restschuld
    case 'hypotheek_rentevast':
      return profiel.hypotheek.rentevast
    case 'woonplan':
      return profiel.woonplan
    case 'spaargeld':
      return profiel.spaargeld
    case 'beleggingen':
      return profiel.beleggingen.band
    case 'beleggingen_vorm':
      return profiel.beleggingen.vorm
    case 'schulden':
      return profiel.schulden
    case 'pensioen_werkgever':
      return profiel.pensioenopbouw.werkgever
    case 'pensioen_lijfrente':
      return profiel.pensioenopbouw.lijfrente
  }
}

// ── Profieltype (voor de meting, U3) ─────────────────────────────────────────

/**
 * Een grove typering — leeftijdsklasse × wonen × partner — zonder id, zodat
 * de K1-meting "lege edities per profieltype" kan tellen (k-anonimiteit: geen
 * bedragen, geen unieke combinaties). `peiljaar` komt uit de context, nooit
 * uit de klok, zodat dezelfde invoer altijd hetzelfde type geeft.
 */
export function profielType(profiel: NieuwsprofielV1, peiljaar: number): string {
  const leeftijd = profiel.geboortejaar == null ? null : peiljaar - profiel.geboortejaar
  const klasse =
    leeftijd == null ? 'leeftijd-onbekend' : leeftijd < 35 ? 'onder-35' : leeftijd < 50 ? '35-49' : leeftijd < 67 ? '50-66' : '67-plus'
  const wonen =
    profiel.wonen == null ? 'wonen-onbekend' : profiel.wonen.startsWith('koop') ? 'koop' : profiel.wonen.startsWith('huur') ? 'huur' : 'inwonend'
  const partner =
    profiel.huishouden == null ? 'partner-onbekend' : profiel.huishouden === 'alleen' ? 'alleen' : 'partner'
  return `${klasse}·${wonen}·${partner}`
}
