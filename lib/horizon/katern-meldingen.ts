// lib/horizon/katern-meldingen.ts
//
// Meldingen per katern op /toekomst (ADR 0179 D6, spec §4.8). Sinds fase 2 (W2)
// ingeplugd via `components/toekomst/meldingen/toekomst-katern-meldingen.tsx`: die
// provider vult de invoer uit de state-provider en de server-lading, en voedt zowel het
// slot bovenaan het actieve katern als de punten op de katern-koppen.
//
// Eén functie, `wijsMeldingenToe`, neemt de signalen die de pagina nu al heeft (de
// hoofdrun, de adapter-notices, de detectoren, de doelvoortgang) en legt elke melding in
// precies één katern: Plan, Doelen of Instellingen. Per katern levert hij een lijst op
// ernst gesorteerd, plus de hoogste ernst en het aantal. De katern-kop (`KaternKoppen`)
// en het meldingenslot (`components/toekomst/meldingen/katern-melding.tsx`) lezen
// alleen deze uitvoer.
//
// Regels:
//  - Consume, don't recompute. Ernst en haalbaarheid komen uit `resolvePlanStatus` en
//    `resolvePlanVerdict`, "nu al genoeg" uit `isKernelReachedNowDisplay`, de gegevens-
//    melding uit de outcome-guard. Hier wordt niets herberekend.
//  - Tekst uit de canonieke kopijmodules (`anker-copy`, `aow-notice-minimize`,
//    `deficit-loan-copy`, `eindsituatie-copy`, `outcome-guard`, `plan-status`). Wat daar
//    nog niet staat, staat in `KATERN_MELDING_KOPIJ` hieronder, met per regel de herkomst.
//  - Elke vervolgactie wijst naar precies één plek: een rij in Instellingen
//    (`?rij=`, fase 3), het katern Doelen of /mijn/profiel. Een melding heeft
//    hoogstens twee acties (`actie` + `tweedeActie`), elk naar een eigen plek.
//  - Zichtbaarheid (partnerweergave, pensioenmodus, view-gating) regelt de host: een
//    signaal dat daar niet getoond mag worden, komt hier als `null`/`false` binnen.
//  - De wizard-voortgang is geen melding (ADR 0142 D5, geamendeerd door ADR 0179): die
//    staat in de wizard-ingang zelf.
//
// Pure module: geen React, geen Supabase, geen bedragformattering. Bedragen komen als
// reeds geformatteerde tekst binnen (masked-aware, met vrijheidstijd), net als bij
// `buildDeficitLoanCopy`.

import {
  DOELEN_MELDING_ACTIES,
  ankerZin,
  antwoordMinderUitgeven,
  doelenPlanGewijzigdMelding,
  type AnkerReach,
  type AnkerStop,
} from './anker-copy'
import { AOW_ONTBREEKT_COPY } from './aow-notice-minimize'
import type { DeficitLoanCopy } from './deficit-loan-copy'
import type { DeficitLoanNotice } from './deficit-loan-display'
import {
  EINDSITUATIE_INSTELLING_HREF,
  EINDSITUATIE_INSTELLING_LABEL,
  type EindsituatieCopy,
} from './eindsituatie-copy'
import { KATERN_VOLGORDE, katernStatuspuntLabel, type KaternId } from './katern-copy'
import {
  HORIZON_MISSENDE_GEGEVENS_HINTS,
  HORIZON_MISSENDE_GEGEVENS_LABEL,
  type HorizonOutcomeIssue,
} from './outcome-guard'
import { resolvePlanStatus, resolvePlanVerdict, type PlanStatusInput } from './plan-status'
import { strategieHref } from './strategie-route'
import { INSTELLINGEN_PAGINA, instellingenRijHref } from '@/lib/toekomst/instellingen-rij'
import { isKernelReachedNowDisplay } from '@/lib/horizon-kernel/bridge'
import type { SolverStatus } from '@/lib/horizon-kernel/solver'
import type { KaternKopStatus } from '@/components/editorial/katern-koppen'
import type { GoalProgress } from '@/lib/goal-data'
import type { LeverageStatus } from '@/lib/leverage-status'
import { minimizeLevelFor, resolveBannerDisplay, type BannerDisplay, type MinimizedLevel } from '@/lib/page-status/display'

// ── Types ────────────────────────────────────────────────────────────────────

export interface KaternMeldingActie {
  readonly label: string
  readonly href: string
}

/**
 * "Bespreek met Fin" als vervolgactie (eigenaarsbesluit 26 sep): geen plek maar een
 * gesprek. Het slot rendert `BesprekMetWillButton` — hetzelfde mechanisme als de vroegere
 * `EindsituatieNotice` (chat `openWithMessage` met onderwerp, context en vraag). Data,
 * geen callback: deze module blijft puur; de knop opent de chat zelf.
 */
export interface KaternMeldingFinActie {
  readonly kind: 'fin'
  /** Onderwerp van het gesprek (de titel van de melding). */
  readonly onderwerp: string
  /** Context die mee de chat in gaat — bewust zonder bedragen. */
  readonly detail?: string
  /** Vooraf ingevulde vraag; zonder valt de knop terug op zijn standaardvraag. */
  readonly vraag?: string
}

/** De tweede vervolgactie: een andere plek, of een gesprek met Fin. */
export type KaternMeldingTweedeActie = KaternMeldingActie | KaternMeldingFinActie

export interface KaternMelding {
  /** Stabiele sleutel, uniek over alle katernen (React-key, tests). */
  readonly id: string
  readonly katern: KaternId
  /** Stoplicht-ernst: kleurt het punt op de katern-kop en de streep van het slot. */
  readonly ernst: LeverageStatus
  /** De regel die uitgeklapt en op mobiel zichtbaar is. */
  readonly titel: string
  /** Korte vorm voor het schermlezerlabel van het statuspunt (`katernStatuspuntLabel`). */
  readonly kort: string
  /** Toelichting: desktop direct, mobiel na een tik. */
  readonly uitleg?: string
  /** Eén vervolgactie naar één plek, of geen. */
  readonly actie: KaternMeldingActie | null
  /**
   * Hoogstens één tweede vervolgactie: een ándere plek dan `actie` (spec §4.8: "Verken
   * je opties →" naar Doelen; "Stopmoment →" naar Instellingen), of een gesprek met Fin
   * (tekort-lening, eindsituatie). Alleen naast een eerste actie; meer dan twee kan het
   * model niet dragen.
   */
  readonly tweedeActie?: KaternMeldingTweedeActie | null
}

export interface KaternMeldingenVanKatern {
  /** Op ernst gesorteerd (hoogste eerst); bij gelijke ernst de invoervolgorde. */
  readonly meldingen: readonly KaternMelding[]
  /** Ernst van de eerste melding, `null` zonder meldingen. */
  readonly hoogsteErnst: LeverageStatus | null
  readonly aantal: number
}

export type KaternMeldingen = Readonly<Record<KaternId, KaternMeldingenVanKatern>>

/** Het plan-oordeel en de hoofdrun, zoals de /toekomst-kop ze al heeft. */
export interface PlanSignaal {
  /** Invoer van `resolvePlanStatus` (anker, dekking, `sim.fireReachable`, doel). */
  readonly status: PlanStatusInput
  /** `SolverStatus` van de hoofdrun (`kernelStatus`), `null` zonder run. */
  readonly kernelStatus: SolverStatus | null
  /** `simResult.fireAgeFractional` van de hoofdrun. */
  readonly fireAgeFractional: number | null
  /** Huidige leeftijd (startleeftijd van de run). */
  readonly currentAge: number | null
  /** Tot waar het liquide vermogen reikt (`ankerReachFromSim`/`FromRunway`). */
  readonly ankerReach: AnkerReach | null
  /** Het vaste stopmoment (`ankerStopFromSim`), `null` onder solved. */
  readonly ankerStop: AnkerStop | null
  /** P!B96 van de hoofdrun: €/mnd dat bij een haalbaar plan hoort, `null` zonder. */
  readonly kernelMaandHint: number | null
}

/** Eén doel met zijn canonieke voortgang (`computeGoalProgress`). */
export interface DoelSignaal {
  readonly id: string
  readonly naam: string
  readonly progress: Pick<GoalProgress, 'onTrack' | 'pct'>
  /** `goal.is_completed`: een afgetekend doel staat in het archief, niet in de meldingen. */
  readonly isCompleted: boolean
}

/** Het inputcontract van `wijsMeldingenToe`. Alles optioneel-null: afwezig = geen melding. */
export interface KaternMeldingenInput {
  /** Privacy-weergave: bedragen in zelfgebouwde zinnen als placeholder. */
  readonly masked: boolean
  /** Plan: niet haalbaar / tekort onder een vast anker, en "nu al genoeg". */
  readonly plan: PlanSignaal | null
  /**
   * Plan: tekort-lening. `notice` uit `detectDeficitLoanFromRows`, `copy` uit
   * `buildDeficitLoanCopy` (dezelfde run). `null` = geen (zichtbare) tekort-lening.
   */
  readonly tekortLening: {
    readonly notice: Pick<DeficitLoanNotice, 'firstAge' | 'clearedAge'>
    readonly copy: DeficitLoanCopy
  } | null
  /** Plan: eindsituatie-duiding, `buildEindsituatieCopy` op `detectEindsituatie`. */
  readonly eindsituatie: EindsituatieCopy | null
  /** Doelen: aantal lab-doelen dat niet meer bij het plan past (`labDoelenBuitenPlan.length`). */
  readonly labDoelenBuitenPlan: number
  /** Doelen: de doelen met hun voortgang; de toewijzing filtert zelf op "achter". */
  readonly doelen: readonly DoelSignaal[]
  /** Instellingen: draagt de run de adapter-notice `aow_ontbreekt`? */
  readonly aowOntbreekt: boolean
  /**
   * Instellingen: "je huis wordt nooit verkocht" (`housingHeldNotice`). `bedragTekst` is
   * de huiswaarde, masked-aware en met vrijheidstijd, geformatteerd door de host.
   */
  readonly huisNooitVerkocht: {
    readonly bedragTekst: string
    readonly sharePct: number
    readonly endAge: number
  } | null
  /** Instellingen: de problemen die de outcome-guards op dit scherm meldden. */
  readonly ontbrekendeGegevens: readonly HorizonOutcomeIssue[]
  /**
   * Kan Fin hier antwoorden (AI-abonnement én een uitvoermodus voor 'gesprek', zoals de
   * vroegere `EindsituatieNotice` toetste)? Dan krijgen tekort-lening en eindsituatie
   * "Bespreek met Fin" als tweede actie. Afwezig = nee.
   */
  readonly finBeschikbaar?: boolean
}

// ── Kopij zonder eigen module ────────────────────────────────────────────────

/**
 * Regels die nog in geen kopijmodule stonden. Herkomst per regel ("plan-meldingen.tsx"
 * = het vroegere blok boven de grafiek, in fase 2 opgegaan in het meldingenslot); dit
 * is nu de enige bron, zodat er één formulering blijft.
 * Nieuwe formuleringen (gemarkeerd NIEUW) gaan in fase 2 langs `merkstem`.
 */
export const KATERN_MELDING_KOPIJ = {
  /** Kopij-toets §8 (26 sep): de oude zin "kun je nu al stoppen met werken" botste met de
   *  toonregel uit anker-copy.ts (de app zegt niet dát je kunt stoppen, alleen hoe ver je
   *  vermogen reikt). Zelfde begrip als de nul-tak van ankerVrijZin ("het zelf draagt"). */
  nuAlGenoegSolved: 'Volgens je huidige cijfers draagt je vermogen je uitgaven nu al.',
  /** Letterlijk uit plan-meldingen.tsx (reached_now, vast anker zonder bereik). */
  nuAlGenoegVast: 'Als je op je stopmoment stopt, reikt je liquide vermogen tot het einde van je plan.',
  /** NIEUW: kort label voor het statuspunt bij "nu al genoeg". */
  nuAlGenoegKort: 'nu al gedekt',
  /** Kopij-toets §6 (aangepast): de leenperiode in leeftijden. */
  tekortLeningTitel: (vanaf: number, tot: number | null): string =>
    tot != null
      ? `Je plan dekt tussen je ${vanaf}e en ${tot}e een tekort met een lening.`
      : // NIEUW: variant zonder bewezen aflossing (DeficitLoanCopy.variant 'tot-einde').
        `Je plan dekt vanaf je ${vanaf}e een tekort met een lening.`,
  tekortLeningKort: 'tekort-lening',
  /** Kopij-toets §6. */
  tekortLeningActie: 'Naar de instelling',
  /** Kopij-toets §6 (goedgekeurd). */
  planVerkenActie: 'Verken je opties',
  /** NIEUW (C1): letterlijk uit spec §4.8 ("Stopmoment →"); langs `merkstem`. */
  planStopmomentActie: 'Stopmoment',
  /** Letterlijk uit plan-meldingen.tsx (huis nooit verkocht, kop). */
  huisTitel: 'Je huis wordt in deze projectie nooit verkocht',
  /** Letterlijk uit plan-meldingen.tsx, zonder de nalatenschapszin. */
  huisUitleg: (bedragTekst: string, sharePct: number, endAge: number): string =>
    `Je hebt ingesteld: verkopen zodra je geld opraakt — maar je inkomen blijft je uitgaven dekken, dus dat moment komt niet. Daardoor blijft je huis staan en groeit het mee in je vermogen: ${bedragTekst}, oftewel ${sharePct}% van je vermogen op leeftijd ${endAge}.`,
  /** NIEUW: spiegelt "Naar je AOW-strategie" (kopij-toets §6). */
  huisActie: 'Naar je woonstrategie',
  /** NIEUW: kort label voor het statuspunt bij een doel dat achterloopt. */
  doelAchterKort: 'doel achter op planning',
  /** Het label uit doelen-view.tsx (`goalStatus`), als titel met de doelnaam. */
  doelAchterTitel: (naam: string): string => `${naam}: achter op planning`,
  /** NIEUW: actie naar het doel in de lijst (katern Doelen). */
  doelAchterActie: 'Naar je doelen',
  /** NIEUW: actie naar /mijn/profiel. */
  gegevensActie: 'Naar je profiel',
} as const

// ── Plekken (één per vervolgactie) ───────────────────────────────────────────

/** De route van elk katern — ook de sleutel van zijn minimaliseer-voorkeur. */
export const KATERN_ROUTE: Readonly<Record<KaternId, string>> = {
  plan: '/toekomst',
  doelen: '/toekomst/doelen',
  instellingen: INSTELLINGEN_PAGINA,
}

/**
 * Een rij in katern Instellingen (fase 3: `?rij=`, ADR 0179). Elke vervolgactie wijst naar
 * precies één rij; de oude `?regel=`-vorm blijft alleen als alias voor bestaande links.
 */
export const instellingenRij = instellingenRijHref

export const PROFIEL_HREF = '/mijn/profiel'

/**
 * Het doelscenario-lab bovenaan katern Doelen (`VERKEN_SECTION_ID`). Letterlijk, omdat
 * die constante in een client-component woont; `katern-meldingen.test.ts` pint de gelijkheid.
 */
export const DOELEN_LAB_HREF = '/toekomst/doelen#verken-je-aannames'

/** Pijl weg: het slot tekent zelf een pijl-icoon achter elk actielabel. */
function zonderPijl(label: string): string {
  return label.replace(/\s*→\s*$/, '')
}

/**
 * De twee vervolgacties bij "niet haalbaar" en "tekort onder een vast anker" (spec §4.8):
 * verkennen in Doelen, of het stopmoment zelf in Instellingen. Het stopmoment wordt
 * gekozen in de regel Eindstrategie (de kaart draagt "Stopmoment: …" als ondertitel).
 */
const PLAN_VERKEN_ACTIE: KaternMeldingActie = {
  label: KATERN_MELDING_KOPIJ.planVerkenActie,
  href: KATERN_ROUTE.doelen,
}
const PLAN_STOPMOMENT_ACTIE: KaternMeldingActie = {
  label: KATERN_MELDING_KOPIJ.planStopmomentActie,
  href: instellingenRij('stopmoment'),
}

// ── Ernst ────────────────────────────────────────────────────────────────────

/** bad > warn > good > neutral. Informatief (neutral) staat altijd onderaan. */
const ERNST_RANG: Record<LeverageStatus, number> = { bad: 3, warn: 2, good: 1, neutral: 0 }

export function ernstRang(ernst: LeverageStatus): number {
  return ERNST_RANG[ernst]
}

const SHORTFALL: ReadonlySet<SolverStatus> = new Set<SolverStatus>([
  'anchor_shortfall',
  'pension_shortfall',
  'stop_now_shortfall',
])

// ── Per melding ──────────────────────────────────────────────────────────────

function planMelding(p: PlanSignaal, masked: boolean): KaternMelding | null {
  const verdict = resolvePlanVerdict(p.status)
  const status = resolvePlanStatus(p.status)

  if (p.status.anchorFixed) {
    // Tekort onder een vast anker: het oude blok toonde alleen mét bereik.
    if (p.kernelStatus == null || !SHORTFALL.has(p.kernelStatus) || p.ankerReach == null) return null
    const zin = ankerZin(p.ankerReach, p.ankerStop ?? { kind: 'now' })
    // Spec: rood of oranje. Rondt de dekking af op 100 of ontbreekt ze, dan oranje.
    const ernst: LeverageStatus = status === 'bad' || status === 'warn' ? status : 'warn'
    const titel = verdict.label ?? zin
    return {
      id: 'plan-tekort',
      katern: 'plan',
      ernst,
      titel,
      kort: titel,
      uitleg: verdict.label != null ? zin : undefined,
      actie: PLAN_VERKEN_ACTIE,
      tweedeActie: PLAN_STOPMOMENT_ACTIE,
    }
  }

  if (p.status.solvedReachable !== false || verdict.label == null) return null
  const hint = p.kernelMaandHint
  return {
    id: 'plan-niet-haalbaar',
    katern: 'plan',
    ernst: status,
    titel: verdict.label,
    kort: verdict.label,
    uitleg: hint != null && Number.isFinite(hint) && hint > 0 ? antwoordMinderUitgeven(hint, masked) : undefined,
    actie: PLAN_VERKEN_ACTIE,
    tweedeActie: PLAN_STOPMOMENT_ACTIE,
  }
}

function nuAlGenoegMelding(p: PlanSignaal): KaternMelding | null {
  if (p.kernelStatus !== 'reached_now') return null
  // B93-quirk: bij deplete is de status altijd reached_now; alleen tonen als de
  // gevonden vrijheidsleeftijd ~ de huidige leeftijd is (canonieke helper).
  if (!isKernelReachedNowDisplay(p.fireAgeFractional, p.currentAge)) return null
  const titel = p.status.anchorFixed
    ? p.ankerReach != null
      ? ankerZin(p.ankerReach, p.ankerStop ?? { kind: 'now' })
      : KATERN_MELDING_KOPIJ.nuAlGenoegVast
    : KATERN_MELDING_KOPIJ.nuAlGenoegSolved
  return {
    id: 'plan-nu-al-genoeg',
    katern: 'plan',
    ernst: 'good',
    titel,
    kort: KATERN_MELDING_KOPIJ.nuAlGenoegKort,
    actie: null,
  }
}

function tekortLeningMelding(
  t: NonNullable<KaternMeldingenInput['tekortLening']>,
  finBeschikbaar: boolean,
): KaternMelding {
  const vanaf = Math.floor(t.notice.firstAge)
  const tot = t.notice.clearedAge != null && Number.isFinite(t.notice.clearedAge) ? Math.floor(t.notice.clearedAge) : null
  const c = t.copy
  const titel = KATERN_MELDING_KOPIJ.tekortLeningTitel(vanaf, tot)
  const zinnen = (delen: readonly (string | null | undefined)[]) => delen.filter((z): z is string => !!z).join(' ')
  return {
    id: 'plan-tekort-lening',
    katern: 'plan',
    ernst: 'warn',
    titel,
    kort: KATERN_MELDING_KOPIJ.tekortLeningKort,
    uitleg: zinnen([c.waarom, c.woning, c.piek, c.instelling]),
    actie: { label: KATERN_MELDING_KOPIJ.tekortLeningActie, href: instellingenRij('geen-tekort-lening') },
    // Fin krijgt de uitleg zonder de piekzin: net als bij de eindsituatie gaat er geen
    // bedrag mee de vraag in. Geen eigen vraag — de oude melding had er geen; de knop
    // valt terug op zijn standaardvraag.
    tweedeActie: finBeschikbaar ? { kind: 'fin', onderwerp: titel, detail: zinnen([c.waarom, c.woning, c.instelling]) } : null,
  }
}

function eindsituatieMelding(c: EindsituatieCopy, finBeschikbaar: boolean): KaternMelding {
  // Zoals de vroegere `EindsituatieNotice`: Fin alleen als er niet één oorzaak aan te
  // wijzen is (`onduidelijk`), met die zin erbij, en de vaste vraag + context uit de copy.
  const fin = finBeschikbaar && c.onduidelijk != null
  return {
    id: 'plan-eindsituatie',
    katern: 'plan',
    ernst: 'neutral',
    titel: c.kop,
    kort: c.kop,
    uitleg: fin ? `${c.samenvatting} ${c.onduidelijk}` : c.samenvatting,
    actie: { label: zonderPijl(EINDSITUATIE_INSTELLING_LABEL), href: EINDSITUATIE_INSTELLING_HREF },
    tweedeActie: fin ? { kind: 'fin', onderwerp: c.kop, detail: c.finContext, vraag: c.finVraag } : null,
  }
}

function labPlanMelding(n: number): KaternMelding | null {
  const aantal = Math.floor(n)
  if (!Number.isFinite(aantal) || aantal < 1) return null
  const titel = doelenPlanGewijzigdMelding(aantal)
  return {
    id: 'doelen-lab-plan',
    katern: 'doelen',
    ernst: 'neutral',
    titel,
    kort: titel,
    // Het lab zelf, zoals de vroegere `LabPlanMelding` in doelen-view (één plek).
    // "Loslaten" staat in het doelsituatie-menu van de doelenlijst.
    actie: { label: DOELEN_MELDING_ACTIES.bijwerken, href: DOELEN_LAB_HREF },
  }
}

/**
 * Doelen die achterlopen: dezelfde filter als `OffTrackDoelenLijst` (!onTrack, nog niet
 * behaald, niet afgetekend). `onTrack` blijft bij een vers of ongemeten doel `true`
 * (`computeGoalProgress`), dus die slaan hier geen alarm. Slechtste eerst.
 */
function doelAchterMeldingen(doelen: readonly DoelSignaal[]): KaternMelding[] {
  return doelen
    .filter((d) => !d.progress.onTrack && d.progress.pct < 100 && !d.isCompleted)
    .slice()
    .sort((a, b) => a.progress.pct - b.progress.pct)
    .map((d) => ({
      id: `doelen-achter:${d.id}`,
      katern: 'doelen' as const,
      ernst: 'warn' as const,
      titel: KATERN_MELDING_KOPIJ.doelAchterTitel(d.naam),
      kort: KATERN_MELDING_KOPIJ.doelAchterKort,
      actie: { label: KATERN_MELDING_KOPIJ.doelAchterActie, href: KATERN_ROUTE.doelen },
    }))
}

function aowMelding(): KaternMelding {
  return {
    // Sinds 27 sep staat de AOW-strategie bij de levensgebeurtenissen op Plan: de melding
    // staat bij het katern waar je hem oplost (ADR 0179 D6).
    id: 'plan-aow',
    katern: 'plan',
    ernst: 'warn',
    titel: AOW_ONTBREEKT_COPY.kop,
    // Kopij-toets §4: het statuspunt heet "AOW ontbreekt" (zelfde woord als de samenvatting).
    kort: 'AOW ontbreekt',
    uitleg: `${AOW_ONTBREEKT_COPY.keuze} ${AOW_ONTBREEKT_COPY.effect}`,
    actie: { label: AOW_ONTBREEKT_COPY.actieLabel, href: AOW_ONTBREEKT_COPY.actieHref },
  }
}

function huisMelding(h: NonNullable<KaternMeldingenInput['huisNooitVerkocht']>): KaternMelding {
  return {
    // Woonstrategie: sinds 27 sep op Plan (zie de AOW-melding).
    id: 'plan-huis',
    katern: 'plan',
    ernst: 'neutral',
    titel: KATERN_MELDING_KOPIJ.huisTitel,
    kort: KATERN_MELDING_KOPIJ.huisTitel,
    uitleg: KATERN_MELDING_KOPIJ.huisUitleg(h.bedragTekst, h.sharePct, h.endAge),
    actie: { label: KATERN_MELDING_KOPIJ.huisActie, href: strategieHref('huis') },
  }
}

/**
 * Eén gegevensmelding, hoe veel guards er ook afgaan. `geen-doelvermogen` is geen
 * ontbrekend gegeven maar een eigenschap van "Nu stoppen" en telt niet mee.
 */
function gegevensMelding(issues: readonly HorizonOutcomeIssue[]): KaternMelding | null {
  const eerste = issues.find((i) => i !== 'geen-doelvermogen')
  if (eerste == null) return null
  return {
    id: 'instellingen-gegevens',
    katern: 'instellingen',
    ernst: 'warn',
    titel: HORIZON_MISSENDE_GEGEVENS_LABEL,
    kort: HORIZON_MISSENDE_GEGEVENS_LABEL,
    uitleg: HORIZON_MISSENDE_GEGEVENS_HINTS[eerste],
    actie: { label: KATERN_MELDING_KOPIJ.gegevensActie, href: PROFIEL_HREF },
  }
}

// ── Toewijzing ───────────────────────────────────────────────────────────────

function sorteer(meldingen: readonly KaternMelding[]): KaternMelding[] {
  // Array.prototype.sort is stabiel (ES2019): gelijke ernst houdt de invoervolgorde.
  return meldingen.slice().sort((a, b) => ernstRang(b.ernst) - ernstRang(a.ernst))
}

function perKatern(meldingen: readonly KaternMelding[]): KaternMeldingenVanKatern {
  const gesorteerd = sorteer(meldingen)
  return {
    meldingen: gesorteerd,
    hoogsteErnst: gesorteerd[0]?.ernst ?? null,
    aantal: gesorteerd.length,
  }
}

/**
 * Legt elke melding in precies één katern (spec §4.8) en sorteert per katern op ernst.
 * Volgorde binnen gelijke ernst = de volgorde van de tabel in §4.8.
 */
export function wijsMeldingenToe(input: KaternMeldingenInput): KaternMeldingen {
  const alle: KaternMelding[] = []
  const push = (m: KaternMelding | null) => {
    if (m) alle.push(m)
  }

  // Plan
  if (input.plan) {
    push(planMelding(input.plan, input.masked))
    push(nuAlGenoegMelding(input.plan))
  }
  const fin = input.finBeschikbaar === true
  if (input.tekortLening) push(tekortLeningMelding(input.tekortLening, fin))
  if (input.eindsituatie) push(eindsituatieMelding(input.eindsituatie, fin))

  // Doelen
  push(labPlanMelding(input.labDoelenBuitenPlan))
  for (const m of doelAchterMeldingen(input.doelen)) push(m)

  // Plan: de levensstrategieën (AOW, woning) staan sinds 27 sep bij de gebeurtenissen.
  if (input.aowOntbreekt) push(aowMelding())
  if (input.huisNooitVerkocht) push(huisMelding(input.huisNooitVerkocht))

  // Instellingen
  push(gegevensMelding(input.ontbrekendeGegevens))

  const uit = {} as Record<KaternId, KaternMeldingenVanKatern>
  for (const k of KATERN_VOLGORDE) uit[k] = perKatern(alle.filter((m) => m.katern === k))
  return uit
}

/** Het punt op de katern-kop: hoogste ernst, label van de bovenste melding, aantal. */
export function katernKopStatus(meldingen: KaternMeldingen, katern: KaternId): KaternKopStatus | null {
  const k = meldingen[katern]
  const top = k.meldingen[0]
  if (!top || k.hoogsteErnst == null) return null
  return { ernst: k.hoogsteErnst, label: katernStatuspuntLabel(top.kort), aantal: k.aantal }
}

// ── Minimaliseren per katern-route ───────────────────────────────────────────
//
// Het bestaande mechanisme van de statusbanner (`PageStatusProvider`): de JSONB-pref
// `profiles.status_banner_minimized`, sleutel = route, waarde = het stoplichtniveau
// waarop geminimaliseerd werd; een ergere status klapt weer uit (`resolveBannerDisplay`).
// Elk katern is een route, dus de sleutel is `KATERN_ROUTE[katern]`.

/**
 * Op welk niveau een klik op "Minimaliseren" dit katern opslaat. Dezelfde regel als de
 * informatieve vrijheidsbanner (`minimizeLevelFor` met kind `freedom`): warn/bad op
 * zichzelf, good/neutral op het vaste `info`, dat nooit escaleert.
 */
export function katernMinimizeLevel(ernst: LeverageStatus): MinimizedLevel {
  return minimizeLevelFor('freedom', ernst) ?? 'info'
}

/** `none` zonder meldingen, anders de banner-regel met escalatie-heropenen. */
export function resolveKaternMeldingDisplay(
  hoogsteErnst: LeverageStatus | null,
  minimizedLevel: MinimizedLevel | null,
): BannerDisplay | 'none' {
  if (hoogsteErnst == null) return 'none'
  return resolveBannerDisplay(hoogsteErnst, minimizedLevel)
}

/** Smalt een onbekende JSONB-waarde tot een stoplichtniveau (spiegelt `asMinimizedLevel`). */
export function alsKaternMinimizedLevel(value: unknown): MinimizedLevel | null {
  return value === 'warn' || value === 'bad' || value === 'info' ? value : null
}

/**
 * Het opgeslagen niveau van één katern uit de map van `readMinimizedMap` (server-side,
 * own-row), als seed voor de hook. Hasown: prototype-sleutels tellen niet.
 */
export function katernMinimizedLevelUitMap(
  map: Readonly<Record<string, unknown>>,
  katern: KaternId,
): MinimizedLevel | null {
  const key = KATERN_ROUTE[katern]
  return Object.prototype.hasOwnProperty.call(map, key) ? alsKaternMinimizedLevel(map[key]) : null
}

/** De seed van alle drie de katernen in één keer — wat `loadToekomstData` meegeeft. */
export type KaternMinimizedSeed = Readonly<Record<KaternId, MinimizedLevel | null>>

export function katernMinimizedSeed(map: Readonly<Record<string, unknown>>): KaternMinimizedSeed {
  const uit = {} as Record<KaternId, MinimizedLevel | null>
  for (const k of KATERN_VOLGORDE) uit[k] = katernMinimizedLevelUitMap(map, k)
  return uit
}
