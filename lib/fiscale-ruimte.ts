// lib/fiscale-ruimte.ts
//
// DE GRONDSLAG VAN DE HEFBOOM BELASTING (ADR 0177).
//
// Deze module beantwoordt één vraag: hoeveel fiscale ruimte laat je onbenut,
// uitgedrukt als aandeel van je EIGEN heffing over Box 1 en Box 3?
//
//   onbenutRatio = som van de netto besparing van openstaande posten
//                  ---------------------------------------------------
//                               box1Tax + box3Tax
//
// ── Waarom niet de hoogte van de heffing ────────────────────────────────
// Tot ADR 0177 oordeelde de hefboom via `box3TaxStatus` op het box 3-vermogen
// bóven de heffingsvrije voet, in vaste euro-banden (€ 100k / € 500k,
// partner-afhankelijk). Dat is een vermogensmeter: monotoon dalend in vermogen,
// zonder plafond, en zonder handeling die hem groen kan maken behalve minder
// vermogen bezitten. Een alleenstaande stond rood vanaf ongeveer € 159.000.
//
// De effectieve druk (`estimateBox3TaxDrag`) is géén uitweg: die loopt óók
// monotoon op — van 0,19% bij € 100k naar 0,46% bij € 20M voor spaargeld — omdat
// de vaste heffingsvrije voet verwatert. Alleen het plafond is nieuw, het
// signaal niet.
//
// Wat wél beoordeelbaar is, is of er ruimte onbenut blijft. Teller en noemer
// schalen hier allebei mee met vermogen en inkomen, dus de uitkomst doet dat
// niet. Wie niets laat liggen staat groen bij elk vermogensniveau; wie een
// gratis partnerverdeling laat liggen staat oranje bij een bescheiden vermogen.
//
// ── Eén rekenweg, twee invoerkanalen (ADR 0177 D5) ──────────────────────
// Deze module is PUUR en rekent zelf geen fiscale bedragen uit: de scalars
// komen uit de canonieke motoren (`optimizePartnerAllocation`,
// `jaarruimteBesparing`, `buildOpportunities`). Twee paden voeden haar:
//
//   · het hefboompad (`loadLeverScores`, draait in de shell op élke route) met
//     wat het al in handen heeft — géén extra query;
//   · de belasting-hub met de volledige kansenlijst uit `loadFiscaleKansen`.
//
// De verdeling, de banden en de volgorde wonen hier, zodat die niet tussen de
// twee paden kunnen wegdrijven (de drift die ADR 0086 heeft opgeruimd).

import type { LeverageStatus } from '@/lib/leverage-status'

/**
 * De posten die als onbenutte ruimte meetellen. Bewust een gesloten union: de
 * copy-laag (`PAGE_STATUS_COPY[...].byCause`) dwingt via het type af dat elke
 * nieuwe post een eigen "waarom"-tekst krijgt (ADR 0177 D4).
 *
 * `tegenbewijs` staat er bewust NIET in — zie ADR 0177 D7: die post vraagt een
 * opgeslagen werkelijk rendement en dus een migratie, een mutatie-route en een
 * juridische toets. Tot die er zijn telt hij niet mee.
 */
export type FiscaleRuimteCause = 'partnerverdeling' | 'jaarruimte' | 'samenstelling'

/** Vaste volgorde als twee posten exact evenveel opleveren — houdt de melding stabiel. */
const CAUSE_TIEBREAK: readonly FiscaleRuimteCause[] = [
  'partnerverdeling',
  'jaarruimte',
  'samenstelling',
]

/**
 * De korte, BESCHRIJVENDE naam van een post — één home voor élk oppervlak dat
 * de grootste post bij naam noemt: de kompas-detailregel
 * (`computeLeverScores().tax.detail`, die via `{figure}` óók de status-banner
 * invult) en de oorzaak-specifieke melding (`byCause`, ADR 0177 D4).
 *
 * Constaterend, nooit imperatief (Wft): "Onbenutte jaarruimte", niet "benut je
 * jaarruimte".
 */
export const FISCALE_RUIMTE_POST_LABEL: Record<FiscaleRuimteCause, string> = {
  partnerverdeling: 'Fiscale partnerverdeling',
  jaarruimte: 'Onbenutte jaarruimte',
  samenstelling: 'Samenstelling vermogen',
}

export interface FiscaleRuimtePost {
  cause: FiscaleRuimteCause
  /** Netto besparing per jaar (€), altijd > 0 — posten zonder winst vallen weg. */
  besparing: number
}

/**
 * De scalars die de twee paden aanleveren. `null` = deze bron heeft geen
 * uitspraak (niet van toepassing, of niet beschikbaar) — bewust onderscheiden
 * van `0` ("berekend, levert niets op").
 */
export interface FiscaleRuimteInput {
  /** Winst van de optimale fiscale partnerverdeling t.o.v. gelijk verdelen (€/jr). */
  partnerverdelingBesparing: number | null
  /** Belastingbesparing bij het benutten van de onbenutte jaarruimte (€/jr). */
  jaarruimteBesparing: number | null
  /** Netto effect van de samenstelling-shift: besparing ná gemist rendement (€/jr). */
  samenstellingNetEffect: number | null
  /** Box 1-heffing per jaar (€). `null` = onbekend. */
  box1Tax: number | null
  /** Box 3-heffing per jaar (€). `null` = onbekend. */
  box3Tax: number | null
}

export interface FiscaleRuimteResult {
  status: LeverageStatus
  /** Onbenutte ruimte als fractie van de eigen heffing. `null` = geen oordeel. */
  ratio: number | null
  /** Openstaande posten, aflopend op besparing. Leeg = niets onbenut. */
  posten: FiscaleRuimtePost[]
  /** 0–100 voor de ring/tooltip. `null` = geen oordeel. */
  score: number | null
}

/** Onder deze fractie is de ruimte verwaarloosbaar → groen. */
export const FISCALE_RUIMTE_GROEN_MAX = 0.05
/** Vanaf deze fractie is de ruimte zo groot dat hij rood is. */
export const FISCALE_RUIMTE_ORANJE_MAX = 0.15

/**
 * Hoe snel de score daalt met de ratio. Gekozen zodat de score de banden volgt:
 * 0% → 100, 5% → 80 (bovenkant groen), 15% → 40 (bovenkant oranje).
 */
const SCORE_PER_RATIO = 400

function bandFor(ratio: number): LeverageStatus {
  if (ratio < FISCALE_RUIMTE_GROEN_MAX) return 'good'
  if (ratio < FISCALE_RUIMTE_ORANJE_MAX) return 'warn'
  return 'bad'
}

/**
 * Bepaal status, ratio en de openstaande posten uit de aangeleverde scalars.
 *
 * Twee takken die NOOIT verward mogen worden (ADR 0177 D3):
 *  · geen enkele heffing bekend → `neutral` ("we weten het niet");
 *  · heffing bekend maar nul, of niets onbenut → `good` ("er valt niets te halen").
 *
 * Een gefaalde bron levert `null` en landt dus op `neutral`, niet op groen. Dat
 * onderscheid is het verschil tussen "je bent in orde" en "we konden het niet
 * bepalen", en een stille groene tegel op een kapotte loader is precies het
 * soort vals-geruststellend signaal dat deze hefboom moet vermijden.
 */
export function computeFiscaleRuimte(input: FiscaleRuimteInput): FiscaleRuimteResult {
  const heffingBekend = input.box1Tax !== null || input.box3Tax !== null
  if (!heffingBekend) {
    return { status: 'neutral', ratio: null, posten: [], score: null }
  }

  const referentieheffing = (input.box1Tax ?? 0) + (input.box3Tax ?? 0)

  const posten: FiscaleRuimtePost[] = (
    [
      { cause: 'partnerverdeling' as const, besparing: input.partnerverdelingBesparing },
      { cause: 'jaarruimte' as const, besparing: input.jaarruimteBesparing },
      { cause: 'samenstelling' as const, besparing: input.samenstellingNetEffect },
    ] satisfies Array<{ cause: FiscaleRuimteCause; besparing: number | null }>
  )
    .filter((p): p is FiscaleRuimtePost => p.besparing !== null && p.besparing > 0)
    .sort(
      (a, b) =>
        b.besparing - a.besparing ||
        CAUSE_TIEBREAK.indexOf(a.cause) - CAUSE_TIEBREAK.indexOf(b.cause),
    )

  const onbenut = posten.reduce((sum, p) => sum + p.besparing, 0)

  // Geen heffing → niets te besparen. De ratio is dan 0, niet oneindig: delen
  // door (bijna) nul zou een willekeurig groot getal geven op een situatie waar
  // per definitie niets te halen valt.
  const ratio = referentieheffing > 0 ? onbenut / referentieheffing : 0

  return {
    status: bandFor(ratio),
    ratio,
    posten,
    score: Math.max(0, Math.round(100 - Math.min(100, ratio * SCORE_PER_RATIO))),
  }
}
