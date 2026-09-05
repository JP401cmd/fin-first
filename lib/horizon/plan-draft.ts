// lib/horizon/plan-draft.ts
//
// De PLAN-REGEL als bewerkbaar concept (ADR 0129 B13/F3b): twee vragen — "Wanneer
// stop je met werken?" (het stop-anker) en "Wat moet er aan het eind gelden?" (de
// eind-vorm + eindleeftijd + nalatenschap) — met de validatie die de route NIET kan
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
  FIRE_END_FORMS,
  STOP_ANCHOR_KINDS,
  STRATEGY_LABELS,
} from '@/lib/fire-strategy'

/** Het bewerkbare plan zoals de twee vragen het dragen. */
export interface PlanDraft {
  anchor: StopAnchorKind
  /** Alleen betekenisvol bij `anchor === 'age'`; halve jaren (B6). */
  stopAge: number | null
  endForm: FireEndForm
  endAge: number
  legacyAmount: number
}

/** Kopij van vraag 1 — letterlijk uit de bijlage van ADR 0129 (merkstem-ronde F0). */
export const STOP_ANCHOR_OPTIONS: ReadonlyArray<{
  kind: StopAnchorKind
  name: string
  subtitle: string
}> = [
  {
    kind: 'solved',
    name: 'Laat de app het uitrekenen',
    subtitle: 'De app zoekt de vroegste leeftijd waarop je vermogen je plan draagt.',
  },
  {
    kind: 'aow',
    name: 'Op mijn AOW-leeftijd',
    subtitle: 'Je werkt door tot je AOW ingaat. De app laat zien of je vermogen dan reikt.',
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

export const STOP_ANCHOR_QUESTION = 'Wanneer stop je met werken?'
export const END_FORM_QUESTION = 'Wat moet er aan het eind gelden?'
export const END_AGE_QUESTION = 'Tot welke leeftijd moet je vermogen reiken?'

/** Kopij van vraag 2 — de drie eind-vormen met de bestaande, canonieke ondertitels. */
export const END_FORM_OPTIONS: ReadonlyArray<{ form: FireEndForm; name: string; subtitle: string }> =
  FIRE_END_FORMS.map((form) => ({
    form,
    name: STRATEGY_LABELS[form].name,
    subtitle: STRATEGY_LABELS[form].subtitle,
  }))

/** Grenzen — spiegel van de route en de DB-CHECK (lees: geen tweede waarheid, wel een vroege). */
export const STOP_AGE_MIN = 18
export const STOP_AGE_MAX = 100
export const END_AGE_MIN = 50
export const END_AGE_MAX = 120

/** Toont de eind-vorm een instelbare eindleeftijd? (perpetual = alleen weergave-horizon). */
export function endFormShowsEndAge(endForm: FireEndForm): boolean {
  return endForm !== 'perpetual'
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

  if (draft.endForm === 'legacy' && (!Number.isFinite(draft.legacyAmount) || draft.legacyAmount < 0)) {
    errors.legacyAmount = 'Een bedrag van nul of hoger.'
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
      errors.stopAge = `Je stopmoment ligt vóór de eindleeftijd van je plan (${draft.endAge}).`
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
