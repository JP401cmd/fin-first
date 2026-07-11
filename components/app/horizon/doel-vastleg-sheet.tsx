'use client'

/**
 * DoelVastlegSheet — promotie-sheet "verkennen wordt richten" (ronde 4 stap 5).
 *
 * Presentational BottomSheet die de actuele lab-stand promoveert tot een vastgelegd
 * doelscenario. Per AFWIJKENDE parameter (spaarquote / salaris / rendement / FIRE) toont
 * hij een aanvinkbare rij (default aan) met de doelwaarde-preview; de gebruiker kiest welke
 * parameters een doel worden. De sheet REKENT NIETS — de parent (`horizon-client`) levert de
 * previews (label + waarde-string) én weet de numerieke doelwaarden; de sheet geeft enkel de
 * aangevinkte set terug via `onSubmit`. De PUT + toast + state-mutatie doet de parent.
 *
 * Naast het component wonen hier de twee PURE persist-helpers die door het persist-effect
 * in horizon-client worden hergebruikt (`buildLiveStand` + `buildScenarioPersistPayload`) —
 * één stand-vorm, zodat het vastgelegde `doel.stand`, de concept-detectie én de PUT-payload
 * exact dezelfde inclusie-/afrondingsregels volgen. Ze zijn los importeerbaar en unit-testbaar
 * (KRITIEK: het doel-blok gaat in ELKE scenario-PUT mee — anders wist een sliderbeweging het).
 */

import { useState, useEffect } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { readSliderValueFromEvents } from '@/lib/scenario-events'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import {
  DOEL_PARAMETERS,
  type DoelParameter,
  type ToekomstScenarioStand,
  type ToekomstScenarioDoel,
  type ToekomstScenarioPrefs,
} from '@/lib/horizon/toekomst-scenario'

// ── Pure persist-helpers (gedeeld met het persist-effect) ────────────────────

/**
 * Bouw de GOAL-RELEVANTE lab-stand (`ToekomstScenarioStand`) uit de live scenario-state.
 * Spiegelt EXACT de inclusie-/afrondingsregels die het persist-effect gebruikte (income/
 * savings afgerond vergeleken; workdays/extraInleg exact; nul-delta's al gedropt door de
 * WhatIfMarketAssumptions-component). `stopAge`/`stopKoppel` staan altijd in de stand
 * (net als de oude payload); `stopMarge` alleen in koppelmodus met een vastgehouden marge.
 * Zonder baseline kunnen sliders niet worden gelezen → geen slider-velden.
 */
export function buildLiveStand(args: {
  baseline: WhatIfOverrides | null
  sliderEvents: WhatIfEvent[]
  returnDeltas: Record<string, number>
  stopAge: number | null
  stopKoppel: boolean
  lockedMarge: number | null
}): ToekomstScenarioStand {
  const { baseline, sliderEvents, returnDeltas, stopAge, stopKoppel, lockedMarge } = args
  const stand: ToekomstScenarioStand = {}

  if (baseline) {
    const sliders: NonNullable<ToekomstScenarioStand['sliders']> = {}
    const income = readSliderValueFromEvents('income', sliderEvents, baseline)
    const workdays = readSliderValueFromEvents('workdays', sliderEvents, baseline)
    const savings = readSliderValueFromEvents('savings', sliderEvents, baseline)
    const extraInleg = readSliderValueFromEvents('extra_inleg', sliderEvents, baseline)
    if (Math.round(income) !== Math.round(baseline.monthlyIncome)) sliders.income = income
    if (workdays !== baseline.workDaysPerWeek) sliders.workdays = workdays
    if (Math.round(savings) !== Math.round(baseline.savingsRate)) sliders.savings = savings
    if (extraInleg !== 0) sliders.extraInleg = extraInleg
    if (Object.keys(sliders).length > 0) stand.sliders = sliders
  }

  if (Object.keys(returnDeltas).length > 0) {
    stand.returnDeltaByCategorie = returnDeltas as Partial<Record<AssetCategorie, number>>
  }

  stand.stopAge = stopAge
  stand.stopKoppel = stopKoppel
  if (stopKoppel && lockedMarge !== null) stand.stopMarge = lockedMarge

  return stand
}

/**
 * Stel de volledige scenario-PUT-payload samen: de stand + weergavevlag + (kritiek!) het
 * vastgelegde doel-blok. Het doel gaat in ELKE PUT mee — laat je het weg, dan wist de
 * volledige-overwrite-route het doel bij de eerste sliderbeweging. `v: 2` is verplicht:
 * de parser leest `doel` alléén bij v2.
 */
export function buildScenarioPersistPayload(args: {
  stand: ToekomstScenarioStand
  showScenarioLine: boolean
  doel: ToekomstScenarioDoel | null
}): ToekomstScenarioPrefs {
  const { stand, showScenarioLine, doel } = args
  return {
    v: 2,
    ...(stand.sliders ? { sliders: stand.sliders } : {}),
    ...(stand.returnDeltaByCategorie
      ? { returnDeltaByCategorie: stand.returnDeltaByCategorie }
      : {}),
    stopAge: stand.stopAge ?? null,
    stopKoppel: stand.stopKoppel ?? false,
    ...(stand.stopMarge !== undefined ? { stopMarge: stand.stopMarge } : {}),
    showScenarioLine,
    ...(doel ? { doel } : {}),
  }
}

// ── Sheet ────────────────────────────────────────────────────────────────────

/** Eén afwijkende parameter met de doelwaarde-preview (label + waarde-string). */
export interface DoelParameterPreview {
  parameter: DoelParameter
  /** Korte parameter-naam ("Spaarquote", "Salaris", "Verwacht rendement", "Vrijheidsleeftijd"). */
  label: string
  /** Doelwaarde als leesbare string ("45%", "€6.000/mnd", "6,3%", "Vrij op 58,5 jr · ≥ 2,0 jr marge"). */
  waarde: string
}

export interface DoelVastlegSheetProps {
  open: boolean
  onClose: () => void
  /** Alleen AFWIJKENDE parameters (rendement wordt weggelaten als het doel-rendement null is). */
  previews: DoelParameterPreview[]
  /** true = "Doel bijwerken" (er ligt al een doel); false = eerste keer vastleggen. */
  bijwerken?: boolean
  /** Bezig met de PUT — CTA toont laad-tekst en blokkeert dubbel-klik. */
  saving?: boolean
  /** Geeft de aangevinkte parameters terug; de parent doet de PUT. */
  onSubmit: (gekozen: Partial<Record<DoelParameter, true>>) => void
}

export function DoelVastlegSheet({
  open,
  onClose,
  previews,
  bijwerken = false,
  saving = false,
  onSubmit,
}: DoelVastlegSheetProps) {
  // Vinkjes: default alles aan. Reset zodra de sheet (her)opent of de afwijkende set wijzigt.
  const [checked, setChecked] = useState<Partial<Record<DoelParameter, boolean>>>({})
  const previewKey = previews.map((p) => p.parameter).join(',')
  useEffect(() => {
    if (!open) return
    const next: Partial<Record<DoelParameter, boolean>> = {}
    for (const p of previews) next[p.parameter] = true
    setChecked(next)
    // previewKey vangt de afwijkende set; previews-array-identiteit is niet stabiel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, previewKey])

  const gekozenAantal = previews.filter((p) => checked[p.parameter]).length
  const kanVastleggen = gekozenAantal > 0 && !saving

  const submit = () => {
    if (!kanVastleggen) return
    const gekozen: Partial<Record<DoelParameter, true>> = {}
    for (const p of DOEL_PARAMETERS) {
      if (previews.some((pr) => pr.parameter === p) && checked[p]) gekozen[p] = true
    }
    onSubmit(gekozen)
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={bijwerken ? 'Werk je doel bij' : 'Maak dit je doel'}
      size="md"
      footerSlot={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-[var(--r)] border-2 border-[var(--ink)] px-4 font-sans text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!kanVastleggen}
            className="min-h-11 flex-1 rounded-[var(--r)] bg-[var(--ink)] px-4 font-sans text-sm font-semibold text-[var(--paper)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? 'Vastleggen …'
              : bijwerken
                ? 'Doel bijwerken'
                : 'Leg vast als mijn doel'}
          </button>
        </div>
      }
    >
      <div className="space-y-5 px-5 py-5">
        <p className="font-serif text-sm leading-snug text-[var(--ink-2)]">
          Je verkenning wordt je <em className="font-normal not-italic text-[var(--ink)]">doel</em>. Kies welke
          aannames je vastlegt — ze verschijnen als doel in je toekomst en je voortgang wordt bijgehouden.
          De gestippelde lijn heet daarna <em className="font-normal not-italic text-[var(--ink)]">Jouw doel</em>.
        </p>

        <ul className="space-y-0 border-t border-[var(--border-ed)]">
          {previews.map((p) => (
            <li key={p.parameter} className="border-b border-[var(--border-ed)]">
              <label className="flex min-h-[52px] cursor-pointer items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={checked[p.parameter] ?? false}
                  onChange={(e) =>
                    setChecked((prev) => ({ ...prev, [p.parameter]: e.target.checked }))
                  }
                  className="h-4 w-4 shrink-0 accent-horizon-600"
                />
                <span className="flex-1 font-sans text-sm text-[var(--ink)]">{p.label}</span>
                <span className="shrink-0 font-mono text-[13px] tabular-nums text-[var(--ink-2)]">
                  {p.waarde}
                </span>
              </label>
            </li>
          ))}
        </ul>

        {gekozenAantal === 0 && (
          <p className="font-sans text-[12px] text-[var(--ink-3)]">
            Vink minstens één parameter aan om een doel vast te leggen.
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
