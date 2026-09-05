// lib/horizon/plan-draft.ts
//
// De PLAN-REGEL als bewerkbaar concept (ADR 0129 B13/F3b): twee vragen — "Wanneer
// wil je stoppen met werken?" (het stop-anker) en "Tot welke leeftijd moet je geld
// reiken, en wat moet er dan nog over zijn?" (eindleeftijd + eind-vorm + bedrag dat
// over moet blijven) — met de validatie die de route NIET kan
// doen (de AOW-leeftijd kent alleen de client) en de vertaling naar de PUT-body van
// `/api/fire-settings`.
//
// ÉÉN bron voor vier oppervlakken: Voorkeuren (`eindstrategie-body.tsx`, de bron),
// de strategie-modal op /toekomst, de module-activatie-modal en de "Maak dit mijn
// plan"-CTA van de vrijheidsas. Vóór F3b had elk scherm zijn eigen strategie-lijst,
// zijn eigen eindleeftijd-conditie en zijn eigen PUT-body — precies hoe `pensioen`
// het eindleeftijd-veld verloor en de modal 67 hardcodede (bevinding 3).
//
// Geen rekenwerk: alleen vorm, validatie en kopij uit de ADR-bijlage.

import {
  type FireEndForm,
  type FirePlan,
  type StopAnchorKind,
  DEFAULT_FIRE_STRATEGY,
  END_AGE_MAX,
  END_AGE_MIN,
  FIRE_END_FORMS,
  PERPETUAL_END_AGE,
  STOP_AGE_MAX,
  STOP_AGE_MIN,
  STOP_ANCHOR_KINDS,
} from '@/lib/fire-strategy'

/**
 * Grenzen — ÉÉN bron in `lib/fire-strategy.ts` (naast de schrijftoets van de routes);
 * hier alleen doorgegeven zodat de plan-vragen en de onboarding-stap ze via dit
 * bestand kunnen lezen. `END_AGE_MIN = 60` spiegelt de live DB-CHECK (60..120).
 */
export { END_AGE_MAX, END_AGE_MIN, STOP_AGE_MAX, STOP_AGE_MIN }

/** Het bewerkbare plan zoals de twee vragen het dragen. */
export interface PlanDraft {
  anchor: StopAnchorKind
  /** Alleen betekenisvol bij `anchor === 'age'`; halve jaren (B6). */
  stopAge: number | null
  endForm: FireEndForm
  endAge: number
  legacyAmount: number
}

// ── Kopij van de twee vragen — ÉÉN bron voor onboarding, Voorkeuren en modals ──
//
// Eigenaar-besluit 5 sep 2026 (herziening van de ADR 0129-bijlage): de eind-vorm is
// eigenlijk twee getallen — "tot welke leeftijd moet je geld reiken, en wat moet er
// dan nog over zijn?" Die formulering is de norm op ALLE oppervlakken, in gewone
// taal. Beschrijvend, nooit aansporend: geen "je kunt stoppen", geen advies, geen
// "oneindig". De onboarding-stap "Jouw plan" leest letterlijk dezelfde strings.

/** Kopij van vraag 1 — de vier ankers. De onboarding biedt `now` bewust niet aan. */
export const STOP_ANCHOR_OPTIONS: ReadonlyArray<{
  kind: StopAnchorKind
  name: string
  subtitle: string
}> = [
  {
    kind: 'solved',
    name: 'Zo vroeg als het kan',
    subtitle: 'De app rekent uit vanaf welke leeftijd werken een keuze wordt.',
  },
  {
    kind: 'aow',
    name: 'Op mijn AOW-leeftijd',
    subtitle: 'Je werkt door tot je AOW ingaat. De app laat zien of je geld dan reikt.',
  },
  {
    kind: 'age',
    name: 'Op een leeftijd die ik kies',
    subtitle: 'Jij kiest het moment. De app laat zien hoe het dan loopt.',
  },
  {
    kind: 'now',
    name: 'Nu',
    subtitle: 'Je rekent alsof je vandaag stopt.',
  },
]

export const STOP_ANCHOR_QUESTION = 'Wanneer wil je stoppen met werken?'
/** Vraag 2 als geheel — de kop boven eindleeftijd-veld én keuze. */
export const END_FORM_QUESTION = 'Tot welke leeftijd moet je geld reiken, en wat moet er dan nog over zijn?'
/** Het eindleeftijd-veld (eerste helft van vraag 2). */
export const END_AGE_QUESTION = 'Tot welke leeftijd moet je geld reiken?'
/** De keuze wat er overblijft (tweede helft van vraag 2). */
export const END_REMAINDER_QUESTION = 'Wat moet er dan nog over zijn?'
/** Getoond in plaats van het eindleeftijd-veld onder `perpetual`. */
export const PERPETUAL_NO_END_AGE_NOTE =
  'Dan rekent de app zonder eindleeftijd: je leeft van wat je vermogen oplevert.'

/**
 * Kopij van vraag 2 — de drie eind-vormen in gewone taal. Bewust EXPLICIET en niet
 * afgeleid uit `STRATEGY_LABELS` (Vermogen opeten · Nalatenschap · Eeuwigdurend):
 * die vaktermen blijven de canonieke korte labels voor rapporten, grafiek-voetnoten
 * en tests; hier spreekt de vraag de gebruiker aan in de woorden van het besluit.
 */
export const END_FORM_OPTIONS: ReadonlyArray<{ form: FireEndForm; name: string; subtitle: string }> = [
  {
    form: 'deplete',
    name: 'Niets, het mag op zijn',
    subtitle: 'Je geld mag op de eindleeftijd volledig opgemaakt zijn. Dit is de standaard.',
  },
  {
    form: 'legacy',
    name: 'Een bedrag voor later of voor anderen',
    subtitle: 'Op de eindleeftijd blijft een bedrag over dat je bewust apart houdt.',
  },
  {
    form: 'perpetual',
    name: 'Mijn vermogen mag niet slinken',
    subtitle: 'Je geld houdt zijn waarde; je leeft van wat het oplevert, zonder eindleeftijd.',
  },
]

/** Toont de eind-vorm een instelbare eindleeftijd? (perpetual = alleen weergave-horizon). */
export function endFormShowsEndAge(endForm: FireEndForm): boolean {
  return endForm !== 'perpetual'
}

/**
 * De eind-vorm kiezen — de ENIGE manier waarop de plan-vragen (Voorkeuren, modals,
 * onboarding) `endForm` zetten. Eigenaar-besluit 5 sep 2026: kiest de gebruiker
 * `perpetual`, dan gaat de (verborgen) eindleeftijd naar `PERPETUAL_END_AGE` (100),
 * dezelfde horizon als de kernel — anders zou de B7-toets een stopleeftijd van 92
 * afwijzen tegen een onzichtbare 90. Wisselt hij daarna terug naar een vorm mét
 * eindleeftijd en staat die nog op de perpetual-zet, dan keert de standaard (90)
 * terug; een zelf gekozen andere leeftijd blijft staan.
 */
export function withEndForm(draft: PlanDraft, endForm: FireEndForm): PlanDraft {
  if (endForm === 'perpetual') {
    return { ...draft, endForm, endAge: PERPETUAL_END_AGE }
  }
  const endAge =
    draft.endForm === 'perpetual' && draft.endAge === PERPETUAL_END_AGE
      ? DEFAULT_FIRE_STRATEGY.endAge
      : draft.endAge
  return { ...draft, endForm, endAge }
}

/** Een `FirePlan` (gelezen) → concept. */
export function planDraftFromPlan(plan: FirePlan): PlanDraft {
  return {
    anchor: plan.anchor.kind,
    stopAge: plan.anchor.kind === 'age' ? plan.anchor.age : null,
    endForm: plan.endForm,
    endAge: plan.endAge,
    legacyAmount: plan.legacyAmount,
  }
}

/** Een gelezen `/api/fire-settings`-GET-antwoord → concept (tolerant op ontbrekende velden). */
export function planDraftFromSettings(row: {
  fire_end_strategy?: string | null
  fire_end_age?: number | string | null
  fire_legacy_amount?: number | string | null
  fire_stop_anchor?: string | null
  fire_stop_age?: number | string | null
}): PlanDraft {
  const strategy = row.fire_end_strategy
  const endForm: FireEndForm = (FIRE_END_FORMS as readonly string[]).includes(String(strategy))
    ? (strategy as FireEndForm)
    : 'deplete'
  // Legacy-label wint voor het anker (D2) — spiegel van `parseFirePlan`.
  const anchor: StopAnchorKind =
    strategy === 'pensioen'
      ? 'aow'
      : strategy === 'nu-stoppen'
        ? 'now'
        : (STOP_ANCHOR_KINDS as readonly string[]).includes(String(row.fire_stop_anchor))
          ? (row.fire_stop_anchor as StopAnchorKind)
          : 'solved'
  const rawStop = Number(row.fire_stop_age)
  const stopAge = anchor === 'age' && Number.isFinite(rawStop) ? rawStop : null
  const endAge = Number(row.fire_end_age)
  return {
    anchor: anchor === 'age' && stopAge === null ? 'solved' : anchor,
    stopAge,
    endForm,
    endAge: Number.isFinite(endAge) && endAge > 0 ? endAge : 90,
    legacyAmount: Number(row.fire_legacy_amount ?? 0) || 0,
  }
}

/**
 * Standaard-stopleeftijd wanneer de gebruiker "Op een leeftijd die ik kies" aanvinkt
 * zonder dat er al een leeftijd staat: het opgeloste vrijheidsmoment als dat bekend is
 * (halve jaren), anders de huidige leeftijd + 5, geklemd binnen de grenzen en vóór de
 * eindleeftijd. Bewust GEEN vaste 58 of 65: dat leest als een advies.
 */
export function defaultStopAge(input: {
  solvedFireAge?: number | null
  currentAge?: number | null
  endAge: number
}): number {
  const basis =
    input.solvedFireAge != null && Number.isFinite(input.solvedFireAge)
      ? input.solvedFireAge
      : input.currentAge != null && Number.isFinite(input.currentAge)
        ? input.currentAge + 5
        : 60
  const halved = Math.round(basis * 2) / 2
  const max = Math.min(STOP_AGE_MAX, input.endAge - 0.5)
  return Math.max(STOP_AGE_MIN, Math.min(max, halved))
}

export interface PlanDraftErrors {
  stopAge?: string
  endAge?: string
  legacyAmount?: string
}

/**
 * Validatie vóór de save. Twee toetsen die alleen HIER kunnen (de route kent de AOW
 * niet): onder anker `aow` moet de eindleeftijd ná de AOW-leeftijd liggen; onder
 * `age` moet de stopleeftijd vóór de eindleeftijd liggen (de route weigert dat ook,
 * maar de gebruiker hoort het vóór de klik te zien — B7/R4).
 */
export function validatePlanDraft(
  draft: PlanDraft,
  ctx: { aowAge?: number | null } = {},
): { ok: boolean; errors: PlanDraftErrors } {
  const errors: PlanDraftErrors = {}

  if (!Number.isFinite(draft.endAge) || draft.endAge < END_AGE_MIN || draft.endAge > END_AGE_MAX) {
    errors.endAge = `Tussen ${END_AGE_MIN} en ${END_AGE_MAX} jaar.`
  }

  // "Een bedrag dat over moet blijven" is per definitie > 0 — nul is de eind-vorm
  // `deplete`. Gelijk aan de onboarding-route (`fire_legacy_amount: positive()`), zodat
  // Voorkeuren en onboarding één regel spreken.
  if (draft.endForm === 'legacy' && (!Number.isFinite(draft.legacyAmount) || draft.legacyAmount <= 0)) {
    errors.legacyAmount = 'Een bedrag boven nul.'
  }

  if (draft.anchor === 'age') {
    const s = draft.stopAge
    if (s == null || !Number.isFinite(s)) {
      errors.stopAge = 'Kies een stopleeftijd.'
    } else if (s * 2 !== Math.floor(s * 2)) {
      errors.stopAge = 'In stappen van een half jaar.'
    } else if (s < STOP_AGE_MIN || s > STOP_AGE_MAX) {
      errors.stopAge = `Tussen ${STOP_AGE_MIN} en ${STOP_AGE_MAX} jaar.`
    } else if (!errors.endAge && s >= draft.endAge) {
      errors.stopAge = `Je stopleeftijd moet vóór de eindleeftijd van je plan (${draft.endAge}) liggen.`
    }
  }

  if (
    draft.anchor === 'aow' &&
    !errors.endAge &&
    ctx.aowAge != null &&
    Number.isFinite(ctx.aowAge) &&
    draft.endAge <= ctx.aowAge
  ) {
    errors.endAge = `Je plan moet voorbij je AOW-leeftijd (${formatPlanAge(ctx.aowAge)}) reiken.`
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/** "67" of "67,3" — hetzelfde komma-formaat als `formatStopAge` in anker-copy. */
export function formatPlanAge(age: number): string {
  if (Number.isInteger(age)) return String(age)
  return (Math.round(age * 10) / 10).toFixed(1).replace('.', ',')
}

/**
 * De PUT-body voor `/api/fire-settings` — ALTIJD het volledige plan (route-contract R3):
 * eind-vorm in `fire_end_strategy` (nooit een legacy-label), eindleeftijd, nalatenschap
 * (null buiten `legacy`), anker en — alleen bij `age` — de stopleeftijd.
 */
export function planDraftToFireSettingsBody(draft: PlanDraft): {
  fire_end_strategy: FireEndForm
  fire_end_age: number
  fire_legacy_amount: number | null
  fire_stop_anchor: StopAnchorKind
  fire_stop_age: number | null
} {
  return {
    fire_end_strategy: draft.endForm,
    fire_end_age: draft.endAge,
    fire_legacy_amount: draft.endForm === 'legacy' ? draft.legacyAmount : null,
    fire_stop_anchor: draft.anchor,
    fire_stop_age: draft.anchor === 'age' ? draft.stopAge : null,
  }
}

/** Zijn twee concepten inhoudelijk gelijk? (voor "Opslaan"-enable) */
export function planDraftEquals(a: PlanDraft, b: PlanDraft): boolean {
  return (
    a.anchor === b.anchor &&
    (a.anchor !== 'age' || a.stopAge === b.stopAge) &&
    a.endForm === b.endForm &&
    a.endAge === b.endAge &&
    (a.endForm !== 'legacy' || a.legacyAmount === b.legacyAmount)
  )
}

/**
 * Bijschrift onder het eindleeftijd-veld — beschrijvend per eind-vorm (dezelfde drie
 * zinnen die Voorkeuren al droeg), zonder anker-woorden: de eind-vorm is de andere as.
 */
export function endAgeHint(endForm: FireEndForm): string {
  switch (endForm) {
    case 'deplete':
      return 'Op deze leeftijd is je vermogen volledig opgemaakt.'
    case 'legacy':
      return 'Op deze leeftijd resteert het nalatenschapsbedrag.'
    case 'perpetual':
      return 'Tot deze leeftijd rekent de grafiek door; je koopkracht blijft intact.'
  }
}
