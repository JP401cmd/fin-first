'use client'

import { useEffect, useState } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  AspirationQuestionnaire,
} from '@/components/app/horizon/aspiration-questionnaire'
import {
  DEFAULT_ASPIRATIONS,
  computeAspirationTotal,
  type AspirationAnswers,
} from '@/lib/retirement-aspirations'
import type { HouseholdRetirementMethod } from '@/lib/household-projection'

/**
 * HouseholdRetirementPane — aanpas-flow voor de huishoud-brede "uitgave ná
 * pensioen". Spiegelt de drie methode-kaarten van de persoonlijke flow, maar
 * leeft buiten een module-route (vandaar horizon-tokens i.p.v. --module-active).
 *
 * Drie methodes:
 *  - auto_shared   : gedeelde vaste lasten tellen één keer mee
 *  - sum_partners  : som van beide individuele uitgaven
 *  - custom_amount : zelf samenstellen via de gedeelde vragen-flow
 *
 * Bij auto_shared / sum_partners slaat een klik direct op (zoals de
 * persoonlijke `pickMethod`) en sluit de pane. Bij custom_amount toont de
 * pane de questionnaire + een expliciete "Opslaan"-footer.
 */

type Method = HouseholdRetirementMethod

const METHOD_META: Record<Method, { title: string; sub: string }> = {
  auto_shared: {
    title: 'Automatisch samen',
    sub: 'Gedeelde vaste lasten één keer',
  },
  sum_partners: {
    title: 'Som van de 2',
    sub: 'Beide individuele uitgaven samen',
  },
  custom_amount: {
    title: 'Zelf samenstellen',
    sub: 'Doorloop de vragen-flow',
  },
}

/** Merge bewaarde JSON met defaults zodat nieuwe keys altijd een fallback hebben. */
function hydrateAspirations(saved: unknown): AspirationAnswers {
  if (!saved || typeof saved !== 'object') return DEFAULT_ASPIRATIONS
  const s = saved as Partial<AspirationAnswers>
  return {
    ...DEFAULT_ASPIRATIONS,
    ...s,
    hobbies: Array.isArray(s.hobbies) ? s.hobbies : DEFAULT_ASPIRATIONS.hobbies,
    customDreams: Array.isArray(s.customDreams) ? s.customDreams : DEFAULT_ASPIRATIONS.customDreams,
  }
}

export function HouseholdRetirementPane({
  open,
  onClose,
  candidates,
  currentMethod,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  candidates: { autoShared: number; sumPartners: number; custom: number | null }
  currentMethod: Method
  onSaved: () => void
}) {
  const [method, setMethod] = useState<Method>(currentMethod)
  const [answers, setAnswers] = useState<AspirationAnswers>(DEFAULT_ASPIRATIONS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bij openen: actuele opgeslagen status ophalen en lokale state hydrateren.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    setMethod(currentMethod)
    void (async () => {
      try {
        const res = await fetch('/api/household/retirement-expense')
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        if (json?.method) setMethod(json.method as Method)
        setAnswers(hydrateAspirations(json?.aspirations))
      } catch {
        // Stilte: pane valt terug op currentMethod + defaults.
      }
    })()
    return () => {
      cancelled = true
    }
    // currentMethod bewust meegenomen: re-hydrateer bij elke open met de
    // laatst-bekende prop-waarde voordat de fetch landt.
  }, [open, currentMethod])

  const breakdown = computeAspirationTotal(answers)
  /** Eindbedrag bij custom: handmatige override wint van berekend totaal. */
  const finalAmount = answers.manualOverride != null && answers.manualOverride > 0
    ? answers.manualOverride
    : breakdown.total

  // Live preview per kaart. Custom toont het live-bedrag wanneer die methode
  // actief is, anders het laatst-opgeslagen custom-bedrag (kan null zijn).
  const previewByMethod: Record<Method, number | null> = {
    auto_shared: candidates.autoShared,
    sum_partners: candidates.sumPartners,
    custom_amount: method === 'custom_amount' ? finalAmount : candidates.custom,
  }

  async function persist(targetMethod: Method) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/household/retirement-expense', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          method: targetMethod,
          customAmount: targetMethod === 'custom_amount' ? finalAmount : null,
          aspirations: targetMethod === 'custom_amount' ? answers : null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Opslaan mislukt')
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  function pickMethod(m: Method) {
    setMethod(m)
    // Directe methodes slaan meteen op + sluiten; custom wacht op de Opslaan-knop.
    if (m !== 'custom_amount') {
      void persist(m)
    }
  }

  const isCustom = method === 'custom_amount'
  const canSaveCustom = isCustom && finalAmount > 0 && !saving

  const footer = (
    <div className="flex items-center justify-end gap-3">
      {error && (
        <p className="mr-auto text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
      >
        Annuleren
      </button>
      {isCustom && (
        <button
          type="button"
          onClick={() => void persist('custom_amount')}
          disabled={!canSaveCustom}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-horizon-600 text-white hover:bg-horizon-700 disabled:opacity-50"
        >
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      )}
    </div>
  )

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Uitgave na pensioen — huishouden"
      size="xl"
      footerSlot={footer}
    >
      <div className="px-5 py-5 space-y-6">
        <p className="text-sm text-[var(--ink-3)] leading-relaxed">
          Bepaal hoe het huishouden de uitgaven ná pensioen berekent. Deze keuze
          stuurt het gedeelde FIRE-doel — beide partners kunnen hem aanpassen.
        </p>

        {/* Methode-kaarten */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.keys(METHOD_META) as Method[]).map(m => {
            const meta = METHOD_META[m]
            const active = method === m
            const preview = previewByMethod[m]
            return (
              <button
                key={m}
                type="button"
                onClick={() => pickMethod(m)}
                disabled={saving}
                aria-pressed={active}
                className={`text-left border-2 rounded-lg p-4 transition-all min-h-[116px] flex flex-col gap-2 ${
                  active
                    ? 'border-horizon-700 bg-horizon-50'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-horizon-700">
                  {meta.title}
                </div>
                <div
                  className="text-xl font-black leading-none tracking-[-0.02em]"
                  style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                >
                  {preview != null && preview > 0 ? (
                    <span className="font-mono tabular-nums">
                      <MaskedAmount value={preview} tone="horizon" monoWhenVisible={false} />
                      <span className="text-[var(--ink-3)] font-normal text-xs ml-1">/jaar</span>
                    </span>
                  ) : (
                    <span className="text-[var(--ink-4)] text-sm font-normal italic">
                      Nog niet ingevuld
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--ink-3)] mt-auto">{meta.sub}</div>
              </button>
            )
          })}
        </div>

        {/* Reflectieve flow alleen bij Zelf samenstellen */}
        {isCustom && (
          <div className="pt-2">
            <AspirationQuestionnaire answers={answers} setAnswers={setAnswers} />
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

export default HouseholdRetirementPane
