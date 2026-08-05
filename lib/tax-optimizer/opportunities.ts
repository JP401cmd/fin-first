// lib/tax-optimizer/opportunities.ts
//
// DE ENIGE PRODUCENT van fiscale kansen. Eén vlakke lijst die drie oppervlakken
// voedt: de optimizer-vergelijking (/overzicht/belasting/optimizer), de
// kansen-lijst op de belasting-hub en de aandachtspunten. Vóór ADR 0086 bouwde
// `buildTaxOverview` een tweede, armere lijst; die tak is verwijderd omdat een
// savings-only lijst niet kan zien dat een scenario per saldo geld kost.
//
// HARDE REGEL: hier wordt NIETS gerekend. Elk getal komt één-op-één uit de
// geleverde `GoalSection`s (server-side gegenereerd op basis van de canonieke
// Box 3-/Box 1-motoren) — geen forfaits, geen dag-conversie, geen netto-som.
//
// Woont bewust in `lib/` en niet in `components/`: de hub-page en de
// aandachtspunten-loader consumeren deze bouwers, en een lib mag geen
// component-module importeren.

import type {
  GoalSection,
  OptimizerStrategy,
  ShiftCurvePoint,
  TaxTrajectory,
} from './types'
import { JAARRUIMTE_TITLE, JAARRUIMTE_CAVEAT } from './rank'

/** Redactionele driepunts-score (● ● ○) — kwalitatief, geen rekenwaarde. */
export type Dots = 1 | 2 | 3

/**
 * Eén doorgerekende kans in de vergelijking. `savings`, `returnCostEur`,
 * `netEffect` en `netFreedomDays` zijn GELEVERDE velden — nooit hier afgeleid.
 */
export interface Opportunity {
  id: string
  kind: 'box3' | 'jaarruimte'
  /** Fiscale as als kolom-tag. */
  boxLabel: 'Box 3' | 'Box 1'
  title: string
  description: string
  /** Bruto belastingbesparing per jaar (€). */
  savings: number
  /** Verwacht misgelopen rendement per jaar (€, ≥ 0). 0 = geen rendementseffect. */
  returnCostEur: number
  /** savings − returnCostEur (kan negatief zijn). */
  netEffect: number
  /** `netEffect` in vrijheidsdagen (0 wanneer ≤ 0). */
  netFreedomDays: number
  hasReturnCost: boolean
  /** Heffing ná dit scenario (€/jr). null = deze kans verlaagt de Box 3-heffing niet. */
  optimizedTax: number | null
  detail: string[]
  caveat: string | null
  /** "Vermogen blijft vrij" — 3 = volledig vrij beschikbaar. */
  freedomDots: Dots
  freedomNote: string | null
  /** "Moeite" — 1 = een vinkje bij de aangifte, 3 = flink wat werk. */
  effortDots: Dots
  effortNote: string | null
  /**
   * Heffing over de jaren (2025 · 2026 · ≈2028) voor deze kans — GELEVERD door
   * de strategie. null = niet doorgerekend voor deze kans (de partnerverdeling
   * is alleen voor het lopende jaar doorgerekend; de jaarruimte-kans zit in
   * Box 1 en heeft geen Box 3-verloop).
   */
  trajectory: TaxTrajectory | null
  /**
   * De doorgerekende shift-curve — alleen bij de samenstelling-shift. Voedt de
   * verkenner-slider in katern III. Elk punt is GELEVERD; de client
   * interpoleert niet en rekent niets bij.
   */
  shiftCurve: ShiftCurvePoint[] | null
  /** De onderliggende Box 3-strategie (voor de kassabon in katern III). */
  strategy: OptimizerStrategy | null
}

/** Kwalitatieve voorwaarden per scenario-soort — vast, niet uit cijfers afgeleid. */
function box3Conditions(strategy: OptimizerStrategy): Pick<
  Opportunity,
  'freedomDots' | 'freedomNote' | 'effortDots' | 'effortNote'
> {
  if (strategy.kind === 'partnerverdeling') {
    return {
      freedomDots: 3,
      freedomNote: null,
      effortDots: 1,
      effortNote: 'keuze bij de aangifte',
    }
  }
  return {
    freedomDots: 3,
    freedomNote: null,
    effortDots: 2,
    effortNote: 'vermogen daadwerkelijk herschikken',
  }
}

function toOpportunity(
  strategy: OptimizerStrategy,
  shiftCurve: ShiftCurvePoint[] | null,
): Opportunity {
  return {
    id: strategy.id,
    kind: 'box3',
    boxLabel: 'Box 3',
    title: strategy.title,
    description: strategy.description,
    savings: strategy.savings,
    returnCostEur: strategy.returnCostEur,
    netEffect: strategy.netEffect,
    netFreedomDays: strategy.netFreedomDays,
    hasReturnCost: strategy.hasReturnCost,
    optimizedTax: strategy.optimizedTax,
    detail: strategy.detail,
    caveat: strategy.caveat,
    trajectory: strategy.trajectory,
    // De curve hoort bij het shift-scenario; andere scenario's kennen 'm niet.
    shiftCurve: strategy.kind === 'samenstelling-shift' ? shiftCurve : null,
    strategy,
    ...box3Conditions(strategy),
  }
}

function jaarruimteOpportunity(
  section: Extract<GoalSection, { kind: 'jaarruimte' }>,
): Opportunity {
  return {
    // Zelfde id als `pickTopChoice` in zijn `opportunityId` zet (het doel-id) —
    // daarop koppelt `findWinner` de badge aan deze rij.
    id: section.goalId,
    kind: 'jaarruimte',
    boxLabel: 'Box 1',
    title: JAARRUIMTE_TITLE,
    description:
      'Een lijfrente-inleg verlaagt je belastbaar inkomen in Box 1 tegen je marginale tarief.',
    savings: section.besparing,
    returnCostEur: 0,
    // GELEVERD door de sectie (de "geen rendementsverlies"-aanname is bij
    // `GoalSection` gedocumenteerd) — hier geen eigen afleiding.
    netEffect: section.netEffect,
    netFreedomDays: section.netFreedomDays,
    hasReturnCost: false,
    optimizedTax: null,
    detail: [],
    caveat: JAARRUIMTE_CAVEAT,
    // Box 1-kans: geen Box 3-verloop, geen shift-curve.
    trajectory: null,
    shiftCurve: null,
    freedomDots: 1,
    freedomNote: 'vast tot pensioen, uitkering later belast',
    effortDots: 2,
    effortNote: 'rekening openen + storten',
    strategy: null,
  }
}

/**
 * Vlakke kansen-lijst uit de geleverde secties. De twee Box 3-doelen leveren
 * dezelfde scenario's (anders gerankt) — we ontdubbelen op `id`. De
 * jaarruimte-kans doet mee zodra er data én een besparing is.
 */
export function buildOpportunities(sections: GoalSection[]): {
  baseline: OptimizerStrategy | null
  opportunities: Opportunity[]
} {
  const box3Sections = sections.filter(
    (s): s is Extract<GoalSection, { kind: 'box3' }> => s.kind === 'box3',
  )
  const baseline = box3Sections[0]?.baseline ?? null
  // Beide Box 3-doelen dragen dezelfde (server-gegenereerde) curve; we nemen de
  // eerste die er één heeft.
  const shiftCurve =
    box3Sections.find((s) => (s.shiftCurve?.length ?? 0) > 0)?.shiftCurve ?? null

  const seen = new Map<string, OptimizerStrategy>()
  for (const section of box3Sections) {
    for (const strategy of section.ranked) {
      if (!seen.has(strategy.id)) seen.set(strategy.id, strategy)
    }
  }
  const opportunities = [...seen.values()].map((s) => toOpportunity(s, shiftCurve))

  const jaarruimte = sections.find(
    (s): s is Extract<GoalSection, { kind: 'jaarruimte' }> => s.kind === 'jaarruimte',
  )
  if (jaarruimte && jaarruimte.hasData && jaarruimte.besparing > 0) {
    opportunities.push(jaarruimteOpportunity(jaarruimte))
  }

  return { baseline, opportunities }
}

// ── Projectie naar de compacte hub-/aandachtspunten-vorm ─────────

/**
 * Eén fiscale kans in compacte vorm, voor oppervlakken die geen volledige
 * vergelijking tonen (de hub-kansenlijst, de aandachtspunten).
 *
 * GRONDSLAG IN DE VELDNAAM (ADR 0073-geest): `savings` is de BRUTO
 * belastingbesparing; `netEffect` en `netFreedomDays` zijn ná aftrek van
 * verwacht misgelopen rendement. Toon en sorteer op de netto-velden — dat is
 * de grootheid waarop de gebruiker kan beslissen; `savings` blijft beschikbaar
 * als context ("waarvan € X belastingbesparing").
 */
export interface TaxOpportunity {
  /**
   * STABIELE, oppervlak-overstijgende id. De hub en de aandachtspunten
   * namespacen 'm tot `tax:<id>`; die string wordt PERSISTENT opgeslagen in
   * `actions.metadata.aandachtspunt_id` en voedt de suppressie-kruising. Hij
   * mag daarom niet meebewegen met een interne hernoeming — vandaar de
   * expliciete `stableId`-mapping in `OPPORTUNITY_ROUTING` i.p.v. het rauwe
   * `Opportunity.id` (dat voor jaarruimte het doel-id 'jaarruimte-maximaal' is,
   * terwijl de opgeslagen actie-id 'tax:jaarruimte' luidt — zie
   * `JAARRUIMTE_AANDACHTSPUNT_ID` in lib/aandachtspunten.ts).
   */
  id: string
  title: string
  box: 1 | 2 | 3
  /** Bruto belastingbesparing per jaar (€). */
  savings: number
  /** Netto effect: savings − verwacht misgelopen rendement (€/jr). Altijd > 0 hier. */
  netEffect: number
  /** `netEffect` in vrijheidsdagen. */
  netFreedomDays: number
  deadline?: string
  href: string
}

/**
 * Waar een kans-soort naartoe linkt, welke deadline erbij hoort en — waar de
 * externe id afwijkt van het interne `Opportunity.id` — welke STABIELE id naar
 * buiten gaat.
 */
const OPPORTUNITY_ROUTING: Record<
  Opportunity['kind'],
  { box: 1 | 2 | 3; href: string; deadline?: string; stableId?: string }
> = {
  // De jaarruimte-uitleg + simulator staan op de Box 1-subpagina; de inleg moet
  // vóór de jaarwisseling gestort zijn.
  jaarruimte: {
    box: 1,
    href: '/overzicht/belasting/box1#jaarruimte-uitleg',
    deadline: '31 dec',
    // Intern draagt deze kans het DOEL-id ('jaarruimte-maximaal') zodat
    // `findWinner` 'm aan `pickTopChoice().opportunityId` kan koppelen. Naar
    // buiten blijft het 'jaarruimte' — dat is de id die al in opgeslagen acties
    // en in de AI-contexten (JAARRUIMTE_AANDACHTSPUNT_ID = 'tax:jaarruimte')
    // staat. Zonder deze mapping zou elke bestaande actie zijn suppressie
    // verliezen en de kans opnieuw als suggestie opduiken.
    stableId: 'jaarruimte',
  },
  // Box 3-scenario's linken naar de optimizer: dáár staat de volledige
  // doorrekening (netto effect, rendementskosten, verloop, verkenner).
  box3: { box: 3, href: '/overzicht/belasting/optimizer' },
}

/**
 * Interne strategie-id → de id die HISTORISCH naar buiten ging. Nodig omdat
 * `tax:<id>` persistent in `actions.metadata.aandachtspunt_id` staat: wijzigt
 * de externe id, dan onderdrukt `filterActionedAandachtspunten` de bestaande
 * actie niet meer en duikt de kans opnieuw als suggestie op bij gebruikers die
 * hem al hadden afgevinkt.
 *
 * Alleen uitbreiden wanneer een kans een NIEUWE interne naam krijgt — nooit een
 * bestaande regel wijzigen, want elke regel dekt opgeslagen gebruikersdata.
 */
const LEGACY_EXTERNAL_IDS: Record<string, string> = {
  // Heette op de hub 'partner-allocatie' toen `buildTaxOverview` de kans nog
  // synthetiseerde (vóór ADR 0086); intern is het nu 'partnerverdeling'.
  partnerverdeling: 'partner-allocatie',
}

/**
 * Projecteer de volledige kansen naar de compacte vorm voor hub en
 * aandachtspunten.
 *
 * TOELATINGSREGEL — `netEffect > 0`, dezelfde eis als `pickTopChoice`. Een
 * oppervlak dat alleen een besparingsbedrag toont kan niet zien dat een
 * scenario per saldo rendement kost; zonder deze filter zou de hub "tot € 47
 * besparing" melden voor een verschuiving die honderden euro's verwacht
 * rendement kost. Dat is precies de fout die de optimizer zelf al repareerde.
 *
 * Gesorteerd op netto effect (aflopend), `savings` als tiebreak.
 */
export function toTaxOpportunities(opportunities: Opportunity[]): TaxOpportunity[] {
  return opportunities
    .filter((o) => o.netEffect > 0)
    .map((o) => {
      const routing = OPPORTUNITY_ROUTING[o.kind]
      return {
        id: LEGACY_EXTERNAL_IDS[o.id] ?? routing.stableId ?? o.id,
        title: o.title,
        box: routing.box,
        savings: o.savings,
        netEffect: o.netEffect,
        netFreedomDays: o.netFreedomDays,
        ...(routing.deadline ? { deadline: routing.deadline } : {}),
        href: routing.href,
      }
    })
    .sort((a, b) => b.netEffect - a.netEffect || b.savings - a.savings)
}
