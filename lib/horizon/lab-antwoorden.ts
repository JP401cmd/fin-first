// lib/horizon/lab-antwoorden.ts
//
// DE ANTWOORDEN ONDER EEN VAST ANKER (spec lab-haalbaarheid §3, 15 sep 2026; sinds de
// spec antwoorden-naast-sliders staat elk antwoord onder zijn eigen knop)
// ───────────────────────────────────────────────────────────────────────────
// Bij een tekort (dekking < 100%) geeft het lab de drie hefbomen als antwoord, elk met
// een getal dat al bestaat: "doorwerken tot X" = de opgeloste leeftijd zonder anker
// (tweede run, ADR 0129 D7); "€X meer salaris" en "€X minder uitgeven" = `planMaandHint`
// (P!B96 van de hoofd-run, dus van het PLAN-stopmoment — nooit de stop-pad-hint) — één
// bedrag, twee hefbomen, want beide zijn dezelfde maandelijkse stroom.
// Elke regel is één klik die de betreffende hefboom als VERKENNING zet, nooit als plan.
// Puur: geen kernel-run, geen eigen som — alleen klemmen op het slider-bereik.

import { computeSliderUiRange, savingsPpForMonthlyAmount } from '@/lib/scenario-events'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { LabUitkomstDekking } from './lab-uitkomst'
import { formatCurrency } from '@/lib/format'
import {
  ANTWOORD_KNOP,
  ANTWOORD_KNOP_MAX,
  DEKKINGSAS_COPY,
  HEFBOOM_COPY,
  antwoordDoorwerken,
  antwoordMeerSalaris,
  antwoordMinderUitgeven,
  formatStopAge,
} from './anker-copy'

export type LabAntwoordActie =
  | { readonly kind: 'stop'; readonly stopAge: number }
  | { readonly kind: 'slider'; readonly key: 'extra_inleg' | 'savings'; readonly value: number }

export interface LabAntwoord {
  readonly kind: 'doorwerken' | 'extra_opzij' | 'minder_uitgeven'
  readonly zin: string
  /** Het bedrag ligt boven het slider-bereik; de actie zet het maximum (spec §3). */
  readonly bovenBereik: boolean
  readonly actie: LabAntwoordActie
}

export interface LabAntwoordenInput {
  dekking: LabUitkomstDekking | null
  /** `solvedRun.fireAge` — de tweede run; `null` = niet gevonden/nog niet gedraaid. */
  solvedFireAge: number | null
  /**
   * P!B96 van de HOOFD-run (`kernelMaandHint` uit de hook) — het plan-stopmoment.
   * Bewust NIET `dekking.maandHint`: dat veld laat het verkende stop-pad (met de
   * scenario-overrides) voorgaan, en dat bedrag hoort bij een ánder stopmoment dan
   * het plan waarover dit blok spreekt (eindreview I1, 15 sep 2026).
   */
  planMaandHint: number | null
  baseline: WhatIfOverrides | null
  masked?: boolean
}

export function resolveLabAntwoorden(input: LabAntwoordenInput): LabAntwoord[] {
  const { dekking, solvedFireAge, planMaandHint, baseline, masked = false } = input
  if (!dekking || !dekking.tekort || !dekking.stop || dekking.stop.kind === 'now') return []
  const stopAge = dekking.stop.stopAge
  const out: LabAntwoord[] = []

  if (solvedFireAge != null && Number.isFinite(solvedFireAge) && solvedFireAge > stopAge) {
    // Naar boven op een half jaar: de stop-slider kent halve jaren, en naar beneden
    // afronden zou een leeftijd noemen waarop het plan nét niet reikt.
    const tot = Math.ceil(solvedFireAge * 2) / 2
    out.push({ kind: 'doorwerken', zin: antwoordDoorwerken(tot), bovenBereik: false, actie: { kind: 'stop', stopAge: tot } })
  }

  const hint = planMaandHint
  if (hint != null && Number.isFinite(hint) && hint > 0 && baseline) {
    const extraRange = computeSliderUiRange('extra_inleg', baseline.monthlyIncome, 0)
    const extra = Math.round(hint)
    out.push({
      kind: 'extra_opzij',
      zin: antwoordMeerSalaris(hint, masked),
      bovenBereik: extra > extraRange.max,
      actie: { kind: 'slider', key: 'extra_inleg', value: Math.min(extra, extraRange.max) },
    })

    const pp = savingsPpForMonthlyAmount(baseline, hint)
    if (pp != null) {
      const savingsRange = computeSliderUiRange('savings', baseline.savingsRate, baseline.savingsRate)
      const ppRound = Math.round(pp)
      out.push({
        kind: 'minder_uitgeven',
        zin: antwoordMinderUitgeven(hint, masked),
        bovenBereik: ppRound > savingsRange.max,
        actie: { kind: 'slider', key: 'savings', value: Math.min(ppRound, savingsRange.max) },
      })
    }
  }
  return out
}

// ── Antwoorden naast de knoppen (spec antwoorden-naast-sliders, 15 sep 2026) ──────────
// Elk antwoord staat onder de knop waar het over gaat: "meer salaris" onder Meer salaris,
// "minder uitgeven" onder Spaarquote, "doorwerken tot" onder de stop-slider in sectie 2.
// Deze mapper is de enige plek die die verdeling maakt, zodat horizon-client geen
// mapping-logica draagt. Bewust React-vrij: het item is een plat structureel type dat de
// presentational `SliderAntwoordRegel` (components/app/horizon/whatif-sliders.tsx) rendert.

/** Eén antwoordregel onder een knop — tekst, boven-bereik-vlag en (optioneel) de knop. */
export interface SliderAntwoordItem {
  tekst: string
  /** Het bedrag ligt boven het bereik van de knop: de regel zegt dat, de knop zet het maximum. */
  bovenBereik: boolean
  /** `null` in de privacy-weergave — de slider zou na een klik het echte bedrag tonen. */
  knop: { label: string; onClick: () => void } | null
}

export interface LabAntwoordenPerSlider {
  sliders: Partial<Record<'extra_inleg' | 'savings', SliderAntwoordItem>>
  stop: SliderAntwoordItem | null
}

/**
 * Verdeelt de antwoorden over hun knoppen, gesleuteld op de actie (`slider` → de
 * slider-key, `stop` → de stop-slider). `onActie` gaat alleen in de `onClick` — nooit
 * hier aangeroepen (ADR 0145 D7: alleen op klik). `masked` → geen knop.
 */
export function labAntwoordenPerSlider(
  antwoorden: readonly LabAntwoord[],
  onActie: (actie: LabAntwoordActie) => void,
  opts: { masked?: boolean } = {},
): LabAntwoordenPerSlider {
  const out: LabAntwoordenPerSlider = { sliders: {}, stop: null }
  for (const a of antwoorden) {
    const item: SliderAntwoordItem = {
      tekst: a.zin,
      bovenBereik: a.bovenBereik,
      knop: opts.masked
        ? null
        : { label: a.bovenBereik ? ANTWOORD_KNOP_MAX : ANTWOORD_KNOP, onClick: () => onActie(a.actie) },
    }
    if (a.actie.kind === 'stop') out.stop = item
    else out.sliders[a.actie.key] = item
  }
  return out
}

/**
 * De sr-only melding na een klik (de focus blijft op de knop, dus niets anders kondigt
 * de nieuwe stand aan): "Meer salaris staat nu op € 1.800."
 */
export function labAntwoordGezetMelding(actie: LabAntwoordActie): string {
  if (actie.kind === 'stop') return `${DEKKINGSAS_COPY.sliderLabel} staat nu op ${formatStopAge(actie.stopAge)}.`
  if (actie.key === 'extra_inleg') return `${HEFBOOM_COPY.meerSalaris} staat nu op ${formatCurrency(actie.value)}.`
  return `${HEFBOOM_COPY.spaarquote} staat nu op ${Math.round(actie.value)}%.`
}
