// lib/horizon/lab-antwoorden.ts
//
// HET ANTWOORDENBLOK ONDER EEN VAST ANKER (spec lab-haalbaarheid §3, 15 sep 2026)
// ───────────────────────────────────────────────────────────────────────────
// Bij een tekort (dekking < 100%) geeft het lab de drie hefbomen als antwoord, elk met
// een getal dat al bestaat: "doorwerken tot X" = de opgeloste leeftijd zonder anker
// (tweede run, ADR 0129 D7); "€X extra opzij" en "€X minder uitgeven" = `maandHint`
// (P!B96) — één bedrag, twee hefbomen, want beide zijn dezelfde maandelijkse stroom.
// Elke regel is één klik die de betreffende hefboom als VERKENNING zet, nooit als plan.
// Puur: geen kernel-run, geen eigen som — alleen klemmen op het slider-bereik.

import { computeSliderUiRange, savingsPpForMonthlyAmount } from '@/lib/scenario-events'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { LabUitkomstDekking } from './lab-uitkomst'
import { antwoordDoorwerken, antwoordExtraOpzij, antwoordMinderUitgeven } from './anker-copy'

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
  baseline: WhatIfOverrides | null
  masked?: boolean
}

export function resolveLabAntwoorden(input: LabAntwoordenInput): LabAntwoord[] {
  const { dekking, solvedFireAge, baseline, masked = false } = input
  if (!dekking || !dekking.tekort || !dekking.stop || dekking.stop.kind === 'now') return []
  const stopAge = dekking.stop.stopAge
  const out: LabAntwoord[] = []

  if (solvedFireAge != null && Number.isFinite(solvedFireAge) && solvedFireAge > stopAge) {
    // Naar boven op een half jaar: de stop-slider kent halve jaren, en naar beneden
    // afronden zou een leeftijd noemen waarop het plan nét niet reikt.
    const tot = Math.ceil(solvedFireAge * 2) / 2
    out.push({ kind: 'doorwerken', zin: antwoordDoorwerken(tot), bovenBereik: false, actie: { kind: 'stop', stopAge: tot } })
  }

  const hint = dekking.maandHint
  if (hint != null && Number.isFinite(hint) && hint > 0 && baseline) {
    const extraRange = computeSliderUiRange('extra_inleg', baseline.monthlyIncome, 0)
    const extra = Math.round(hint)
    out.push({
      kind: 'extra_opzij',
      zin: antwoordExtraOpzij(hint, masked),
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
