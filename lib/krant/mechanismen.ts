// ── Mechanismecatalogus v1 van de Krant ──────────────────────────────────────
//
// Een mechanisme is de weg waarlangs een nieuwsbericht iemands geld raakt. De
// duiding (1A) kiest er precies één uit deze gesloten lijst (of geen) en levert
// de PARAMS; de matcher (1B) voegt per mechanisme de rekenfunctie toe die op
// de bandranden van het profiel een bereik `{ lo, hi, eenheid }` geeft. De
// rekenfuncties horen dus NIET hier — dit bestand is het contract.
//
// Drie vormen:
//   direct        een regel die door wet of besluit op jou van toepassing is
//                 (box 3-parameter, AOW-leeftijd, studieschuld-rente …)
//   gevoeligheid  een marktbeweging waar je blootstelling aan hebt; de matcher
//                 rekent "elke 0,25 procentpunt is op jouw band € x tot € y",
//                 nooit een voorspelling (B5)
//   relevant      raakt jou, maar er valt geen bedrag te rekenen
//
// "Direct" is voorbehouden aan regels. Een marktbeweging is nooit direct: de
// bank hoeft een ECB-besluit niet te volgen.
//
// B2 (alleen euro's): `inflatie-cijfer` heeft géén params en géén bedrag — de
// uitgavenband is uit het profiel geschrapt. `beursbeweging` rekent nooit.
//
// Per param staat de EENHEID (voor de grondingstoets: een `_pct`-param moet als
// percentage in de bron staan, een bedrag als euro) en de PLAUSIBILITEIT
// (harde grenzen in code — een rente van 40% of een AOW-verschuiving van 30
// maanden wijst op een leesfout van het model en wordt afgekeurd).
//
// Params dragen uitsluitend NIEUW aangekondigde waarden. De huidige waarde van
// een drempel komt bij naam uit `lib/krant/drempels.ts`.

import { z } from 'zod'
import type { DoelgroepSleutel } from './profiel-velden'
import type { NumericUnit } from '@/lib/nummer-grond'

export const MECHANISME_IDS = [
  'box3-parameter',
  'box1-parameter',
  'studieschuld-rente',
  'aow-leeftijd',
  'eigen-risico',
  'toeslag-regel',
  'huurverhoging-max',
  'pensioenregeling',
  'spaarrente-markt',
  'hypotheekrente-markt',
  'inflatie-cijfer',
  'beursbeweging',
] as const

export type MechanismeId = (typeof MECHANISME_IDS)[number]

export type MechanismeVorm = 'direct' | 'gevoeligheid' | 'relevant'

export interface ParamRegel {
  /** Eenheid waarin de bron dit getal moet noemen (grondingstoets). */
  eenheid: NumericUnit
  /** Harde plausibiliteitsgrenzen, inclusief. */
  min: number
  max: number
}

export interface MechanismeDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  id: MechanismeId
  label: string
  vorm: MechanismeVorm
  /** Levert de matcher een bedrag op? (direct en gevoeligheid: ja) */
  rekent: boolean
  /** Profielsleutels waarop de rekenfunctie van 1B leest. */
  leest: readonly DoelgroepSleutel[]
  /** Gesloten params-schema; alles buiten dit schema wordt geweigerd. */
  params: S
  /** Per numerieke param: eenheid + plausibiliteit. Alleen deze namen mogen een getal dragen. */
  numeriek: Readonly<Record<string, ParamRegel>>
  /** Minstens één van deze params moet gevuld zijn, anders is het mechanisme leeg. */
  minstensEen?: readonly string[]
}

// ── Gedeelde plausibiliteit ──────────────────────────────────────────────────

/**
 * Een aangekondigd ingangsjaar: van vorig jaar (naijlende berichten) tot enkele
 * jaren vooruit. Vaste grenzen, bewust: de duiding moet reproduceerbaar zijn
 * (golden tests) en niet met de kalender verschuiven. Schuif ze op bij de
 * jaarlijkse fiscale-wijzigingslog, samen met BOX3_PARAMS/BOX1_PARAMS.
 */
export const JAAR_MIN = 2025
export const JAAR_MAX = 2030

/**
 * Het jaar is nullable: artikelen schrijven vaak "volgend jaar" of "per 1
 * januari" zonder jaartal. Een verplicht getal zou het model tot verzinnen
 * dwingen en daarna het hele mechanisme laten vervallen op `ongegrond:jaar`.
 * De matcher (1B) valt bij null terug op het jaar van `ingangsdatum`.
 */
const jaar: ParamRegel = { eenheid: 'bare', min: JAAR_MIN, max: JAAR_MAX }
const rentePct: ParamRegel = { eenheid: 'pct', min: 0, max: 15 }
const forfaitPct: ParamRegel = { eenheid: 'pct', min: 0, max: 15 }
const tariefPct: ParamRegel = { eenheid: 'pct', min: 0, max: 60 }
const verschuivingPp: ParamRegel = { eenheid: 'pct', min: -3, max: 3 }
const vermogensgrens: ParamRegel = { eenheid: 'eur', min: 0, max: 1_000_000 }
const inkomensgrens: ParamRegel = { eenheid: 'eur', min: 0, max: 500_000 }
const kortingMax: ParamRegel = { eenheid: 'eur', min: 0, max: 20_000 }

const nnum = z.number().nullable()

// ── De catalogus ─────────────────────────────────────────────────────────────

function def<S extends z.ZodTypeAny>(d: MechanismeDef<S>): MechanismeDef<S> {
  return d
}

export const MECHANISMEN = {
  'box3-parameter': def({
    id: 'box3-parameter',
    label: 'Box 3-parameter wijzigt',
    vorm: 'direct',
    rekent: true,
    leest: ['spaargeld', 'beleggingen', 'schulden', 'huishouden'],
    params: z.strictObject({
      jaar: nnum,
      heffingsvrij_single: nnum,
      heffingsvrij_partner: nnum,
      forfait_spaargeld_pct: nnum,
      forfait_beleggingen_pct: nnum,
      forfait_schulden_pct: nnum,
      tarief_pct: nnum,
    }),
    numeriek: {
      jaar,
      heffingsvrij_single: vermogensgrens,
      heffingsvrij_partner: vermogensgrens,
      forfait_spaargeld_pct: forfaitPct,
      forfait_beleggingen_pct: forfaitPct,
      forfait_schulden_pct: forfaitPct,
      tarief_pct: tariefPct,
    },
    minstensEen: [
      'heffingsvrij_single',
      'heffingsvrij_partner',
      'forfait_spaargeld_pct',
      'forfait_beleggingen_pct',
      'forfait_schulden_pct',
      'tarief_pct',
    ],
  }),
  'box1-parameter': def({
    id: 'box1-parameter',
    label: 'Box 1-parameter wijzigt',
    vorm: 'direct',
    rekent: true,
    leest: ['inkomen', 'geboortejaar', 'werk'],
    params: z.strictObject({
      jaar: nnum,
      schijf_1_grens: nnum,
      schijf_2_grens: nnum,
      schijf_1_tarief_pct: nnum,
      schijf_2_tarief_pct: nnum,
      schijf_3_tarief_pct: nnum,
      algemene_heffingskorting_max: nnum,
      arbeidskorting_max: nnum,
    }),
    numeriek: {
      jaar,
      schijf_1_grens: inkomensgrens,
      schijf_2_grens: inkomensgrens,
      schijf_1_tarief_pct: tariefPct,
      schijf_2_tarief_pct: tariefPct,
      schijf_3_tarief_pct: tariefPct,
      algemene_heffingskorting_max: kortingMax,
      arbeidskorting_max: kortingMax,
    },
    minstensEen: [
      'schijf_1_grens',
      'schijf_2_grens',
      'schijf_1_tarief_pct',
      'schijf_2_tarief_pct',
      'schijf_3_tarief_pct',
      'algemene_heffingskorting_max',
      'arbeidskorting_max',
    ],
  }),
  'studieschuld-rente': def({
    id: 'studieschuld-rente',
    label: 'Rente op studieschuld',
    vorm: 'direct',
    rekent: true,
    leest: ['schulden'],
    params: z.strictObject({
      jaar: nnum,
      rente_pct: z.number(),
    }),
    numeriek: { jaar, rente_pct: rentePct },
  }),
  'aow-leeftijd': def({
    id: 'aow-leeftijd',
    label: 'AOW-leeftijd verschuift',
    vorm: 'direct',
    rekent: true,
    leest: ['geboortejaar'],
    params: z.strictObject({
      vanaf_jaar: nnum,
      verschuiving_maanden: z.number(),
    }),
    numeriek: {
      vanaf_jaar: jaar,
      verschuiving_maanden: { eenheid: 'bare', min: 0, max: 12 },
    },
  }),
  'eigen-risico': def({
    id: 'eigen-risico',
    label: 'Eigen risico zorgverzekering',
    vorm: 'direct',
    rekent: true,
    leest: ['geboortejaar'],
    params: z.strictObject({
      jaar: nnum,
      bedrag: z.number(),
    }),
    numeriek: { jaar, bedrag: { eenheid: 'eur', min: 0, max: 2_000 } },
  }),
  'toeslag-regel': def({
    id: 'toeslag-regel',
    label: 'Toeslagregel wijzigt',
    vorm: 'relevant',
    rekent: false,
    leest: ['inkomen', 'huishouden', 'kinderen', 'spaargeld'],
    params: z.strictObject({
      jaar: nnum,
      toeslag: z.enum(['huurtoeslag', 'zorgtoeslag', 'kinderopvangtoeslag', 'kindgebonden-budget']),
      inkomensgrens: nnum,
      vermogensgrens: nnum,
    }),
    numeriek: { jaar, inkomensgrens, vermogensgrens },
  }),
  'huurverhoging-max': def({
    id: 'huurverhoging-max',
    label: 'Maximale huurverhoging',
    vorm: 'relevant',
    rekent: false,
    leest: ['wonen'],
    params: z.strictObject({
      jaar: nnum,
      max_pct: z.number(),
      sector: z.enum(['sociaal', 'vrije-sector', 'beide']),
    }),
    numeriek: { jaar, max_pct: { eenheid: 'pct', min: 0, max: 15 } },
  }),
  'pensioenregeling': def({
    id: 'pensioenregeling',
    label: 'Pensioenregeling (Wtp, indexatie)',
    vorm: 'relevant',
    rekent: false,
    leest: ['werk', 'pensioen_werkgever', 'pensioen_lijfrente'],
    params: z.strictObject({
      onderwerp: z.enum(['wtp-overgang', 'indexatie', 'premie', 'uitkering', 'anders']),
    }),
    numeriek: {},
  }),
  'spaarrente-markt': def({
    id: 'spaarrente-markt',
    label: 'Spaarrente beweegt',
    vorm: 'gevoeligheid',
    rekent: true,
    leest: ['spaargeld'],
    params: z.strictObject({
      verschuiving_pp: nnum,
      nieuwe_rente_pct: nnum,
    }),
    numeriek: { verschuiving_pp: verschuivingPp, nieuwe_rente_pct: rentePct },
  }),
  'hypotheekrente-markt': def({
    id: 'hypotheekrente-markt',
    label: 'Hypotheekrente beweegt',
    vorm: 'gevoeligheid',
    rekent: true,
    leest: ['hypotheek_restschuld', 'hypotheek_rentevast'],
    params: z.strictObject({
      verschuiving_pp: nnum,
      nieuwe_rente_pct: nnum,
    }),
    numeriek: { verschuiving_pp: verschuivingPp, nieuwe_rente_pct: rentePct },
  }),
  'inflatie-cijfer': def({
    id: 'inflatie-cijfer',
    label: 'Inflatiecijfer',
    vorm: 'relevant',
    rekent: false,
    // B2: geen uitgavenband, dus geen bedrag en geen params.
    leest: [],
    params: z.strictObject({}),
    numeriek: {},
  }),
  'beursbeweging': def({
    id: 'beursbeweging',
    label: 'Beursbeweging',
    vorm: 'relevant',
    rekent: false,
    leest: ['beleggingen'],
    params: z.strictObject({}),
    numeriek: {},
  }),
} as const satisfies Record<MechanismeId, MechanismeDef>

export function mechanisme(id: MechanismeId): MechanismeDef {
  return MECHANISMEN[id]
}

export function isMechanismeId(waarde: string): waarde is MechanismeId {
  return (MECHANISME_IDS as readonly string[]).includes(waarde)
}

/** Params-type per mechanisme, afgeleid uit het zod-schema. */
export type MechanismeParams<M extends MechanismeId> = z.infer<(typeof MECHANISMEN)[M]['params']>
