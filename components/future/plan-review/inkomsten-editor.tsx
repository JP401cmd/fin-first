'use client'

/**
 * Stap 3 "Wat er binnenkomt" inline in de plan-review (TPR-15).
 *
 * Drie soorten instellingen, één tegelijk (zoals stap 4 en 5), elk met de BESTAANDE body van
 * /toekomst/gebeurtenissen en dezelfde schrijfroute (`PUT /api/life-events/strategie`):
 *  - AOW (`AowStrategieBody`) — bestaat er nog geen eigen AOW-rij, dan is het formulier
 *    vooringevuld en maakt pas opslaan hem aan (besluit eigenaar 13 sep 2026);
 *  - werk (`WerkStrategieBody`);
 *  - elke eigen pensioenpot, of een nieuwe (`PensioenPotBody`).
 *
 * Alleen EIGEN rijen (editor-context via `loadEigenStrategieEvents`): de policy is
 * huishoud-gedeeld, de route wijzigt alleen eigen rijen. Het live effect draait op de
 * client-veilige snapshot (`runRegelProjection` met een `lifeEvent`-override) en staat in de
 * footer. De UPO-upload, de jaarruimte en verwijderen blijven op het pensioenscherm.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { lookupAowAge } from '@/lib/aow-leeftijd'
import { newPot, potFromEvent } from '@/lib/pension/pot-draft'
import { AowStrategieBody } from '@/components/future/strategie/aow-strategie-body'
import { WerkStrategieBody } from '@/components/future/strategie/werk-strategie-body'
import { PensioenPotBody } from '@/components/future/strategie/pensioen-pot-body'
import type { StrategieImpactBron } from '@/components/future/strategie/strategie-impact'
import type { PlanReviewEditorProps } from './editors'

const AOW = 'aow'
const WERK = 'werk'
const NIEUWE_POT = 'nieuwe-pot'

/** Keuze · effect · waarom per onderdeel (norm formulier-uitleg). */
export const INKOMSTEN_UITLEG: Record<typeof AOW | typeof WERK | 'pensioen', string> = {
  aow:
    'Je AOW hangt af van je leefsituatie en van de jaren dat je tussen je 15e en je AOW-leeftijd buiten Nederland woonde. ' +
    'Wat de AOW uitkeert, hoeft je eigen vermogen vanaf je AOW-leeftijd niet op te brengen.',
  werk:
    'Je werkplan beschrijft hoe je inkomen verandert tot je stopt: groei, een plafond of minder werken. ' +
    'Meer inkomen telt als extra sparen, minder werken als minder sparen; je uitgaven blijven gelijk.',
  pensioen:
    'Een pensioenregeling keert uit vanaf de ingangsleeftijd. Wat die uitkeert, hoeft je eigen vermogen vanaf dan niet op te brengen. ' +
    'Je pensioenoverzicht uploaden, een pot verwijderen en je jaarruimte berekenen doe je op het pensioenscherm.',
}

export function InkomstenEditor({ context, onActionsChange, onSaved }: PlanReviewEditorProps) {
  const inkomsten = context.inkomsten
  const [actief, setActief] = useState<string>(AOW)
  // Een save die pas terugkomt nadat de gebruiker naar een ander onderdeel wisselde, mag de
  // stap niet bevestigen: dan zou het concept van het nieuwe onderdeel stil verloren gaan.
  const actiefRef = useRef(actief)
  useEffect(() => {
    actiefRef.current = actief
  }, [actief])

  const impact = useMemo<StrategieImpactBron>(() => ({ kind: 'kern', snapshot: context.snapshot }), [context.snapshot])
  const aowAge = useMemo(
    () => (inkomsten ? Math.ceil(lookupAowAge(inkomsten.aowRows, inkomsten.basis.dateOfBirth).fractional) : 67),
    [inkomsten],
  )

  // Tijdens een save blijven de onderdelen dicht: een wissel halverwege zou de save zijn stap
  // laten missen, en een tweede "nieuwe pot" daarna maakte een dubbele rij (review M1).
  const [bezig, setBezig] = useState(false)
  const publiceer = useCallback(
    (s: RegelEditActionsState) => {
      setBezig(s.saving)
      onActionsChange(s)
    },
    [onActionsChange],
  )

  const opgeslagen = useCallback(
    (sleutel: string) => {
      if (actiefRef.current === sleutel) onSaved({ aowGeschreven: sleutel === AOW })
    },
    [onSaved],
  )

  useEffect(() => {
    if (!inkomsten) onActionsChange({ canSave: false, saving: false, save: () => {}, changed: false })
  }, [inkomsten, onActionsChange])

  if (!inkomsten) {
    return (
      <p role="alert" className="text-xs text-negative">
        Je AOW, werk en pensioen konden niet geladen worden. Sluit deze stap en probeer het later opnieuw.
      </p>
    )
  }

  const onderdelen = [
    { key: AOW, label: 'AOW' },
    { key: WERK, label: 'Werk' },
    ...inkomsten.pensioenen.map((p) => ({ key: p.id, label: p.name })),
    { key: NIEUWE_POT, label: 'Nieuwe pensioenpot' },
  ]
  const pot = inkomsten.pensioenen.find((p) => p.id === actief) ?? null
  const uitleg = actief === AOW ? INKOMSTEN_UITLEG.aow : actief === WERK ? INKOMSTEN_UITLEG.werk : INKOMSTEN_UITLEG.pensioen

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Wat pas je aan" className="flex flex-wrap gap-1.5">
        {onderdelen.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setActief(o.key)}
            disabled={bezig}
            aria-pressed={actief === o.key}
            className={`inline-flex min-h-[44px] max-w-full items-center rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${
              actief === o.key
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:text-[var(--ink)]'
            }`}
          >
            <span className="truncate">{o.label}</span>
          </button>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-[var(--ink-3)]">{uitleg}</p>

      {actief === AOW ? (
        <AowStrategieBody
          key={AOW}
          event={inkomsten.aow}
          impact={impact}
          dailyExpenses={inkomsten.basis.dailyExpenses}
          aowRows={inkomsten.aowRows}
          dateOfBirth={inkomsten.basis.dateOfBirth}
          onActionsChange={publiceer}
          onSaved={() => opgeslagen(AOW)}
        />
      ) : actief === WERK ? (
        <WerkStrategieBody
          key={WERK}
          event={inkomsten.werk}
          impact={impact}
          dailyExpenses={inkomsten.basis.dailyExpenses}
          currentAge={inkomsten.basis.currentAge}
          currentNetMonthly={inkomsten.basis.currentNetMonthly}
          aowAge={aowAge}
          onActionsChange={publiceer}
          onSaved={() => opgeslagen(WERK)}
        />
      ) : (
        <PensioenPotBody
          key={actief}
          initialPot={pot ? potFromEvent(pot) : newPot(aowAge, 0)}
          bestaandeMetadata={pot?.metadata}
          impact={impact}
          dailyExpenses={inkomsten.basis.dailyExpenses}
          aowAge={aowAge}
          onActionsChange={publiceer}
          onSaved={() => opgeslagen(actief)}
        />
      )}
    </div>
  )
}
