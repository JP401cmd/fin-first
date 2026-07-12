'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Globe2, Loader2, Info } from 'lucide-react'
import { suggestPublicDefault } from '@/lib/calculator/suggest-public-default'
import type {
  CustomCalculatorRow,
  CalculatorInput,
  InputKind,
} from '@/lib/calculator/types'
import { Button } from '@/components/editorial'

/**
 * PublishCurationSheet — laat de auteur per input een neutrale publieke
 * voorbeeldwaarde kiezen (zodat persoonlijke bedragen niet lekken) en
 * per input beslissen of `prefill` mee mag voor andere gebruikers.
 *
 * Flow:
 *   1. Open: pre-fill van elk veld met `suggestPublicDefault(currentDefault, kind)`.
 *   2. Gebruiker mag de suggestie overschrijven.
 *   3. Submit POST naar `/api/calculators/publish` met
 *      `{ calculatorId, curated_defaults, prefill_overrides }`.
 *
 * Bij een failure ({ ok:false }) blijft de sheet open en tonen we de
 * server-error (bv. validation- of metadata-check); bij succes sluiten we,
 * roepen `onPublished` en doen een `router.refresh()` zodat de lijst de
 * nieuwe `is_public`-status oppikt.
 *
 * Stijl gevolgd: overlay-patroon van `<CalculatorToLifeEventSheet>` /
 * `<DoelToevoegenSheet>` — bewust gekozen i.p.v. de zwaardere
 * `<BottomSheet>` zodat alle `components/future/` sheets visueel
 * consistent zijn.
 */

// Helper: lokale fallback wanneer de gedeelde lib (Agent A) niet
// beschikbaar zou zijn. Hier is hij wel beschikbaar; deze adapter
// houdt typing strikt voor het format(value, kind)-contract.
function suggestDefault(value: number, kind: InputKind): number {
  return suggestPublicDefault(value, kind)
}

interface PublishApiOk {
  ok: true
  publishedId: string
}
interface PublishApiErr {
  ok: false
  error: string
}
type PublishApiResponse = PublishApiOk | PublishApiErr

export function PublishCurationSheet({
  open,
  onClose,
  calculator,
  onPublished,
}: {
  open: boolean
  onClose: () => void
  calculator: CustomCalculatorRow
  onPublished?: (publishedId: string) => void
}) {
  const router = useRouter()
  const inputs = calculator.definition.inputs

  // Per-input state: de "publieke voorbeeldwaarde" en of `prefill` aan
  // mag blijven. We initialiseren met de suggest-functie zodat de
  // gebruiker direct ronde getallen ziet i.p.v. zijn eigen €321.500.
  const initialDefaults = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const input of inputs) {
      out[input.key] = suggestDefault(input.default, input.kind)
    }
    return out
  }, [inputs])

  const initialPrefill = useMemo<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    for (const input of inputs) {
      // Alleen relevant voor inputs die überhaupt een prefill-binding hebben.
      // We bewaren wel een entry voor *iedere* input zodat de payload
      // expliciet is en niet impliciet via afwezigheid.
      out[input.key] = Boolean(input.prefill)
    }
    return out
  }, [inputs])

  const [defaults, setDefaults] = useState<Record<string, number>>(initialDefaults)
  const [prefillOverrides, setPrefillOverrides] = useState<Record<string, boolean>>(initialPrefill)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function updateDefault(key: string, raw: string) {
    const parsed = Number(raw)
    setDefaults((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }))
  }

  function togglePrefill(key: string) {
    setPrefillOverrides((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/calculators/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculatorId: calculator.id,
          curated_defaults: defaults,
          prefill_overrides: prefillOverrides,
        }),
      })
      let data: PublishApiResponse | null = null
      try {
        data = (await res.json()) as PublishApiResponse
      } catch {
        data = null
      }
      if (!res.ok || !data || data.ok === false) {
        const msg = data && data.ok === false ? data.error : 'Publiceren mislukt — probeer het opnieuw.'
        setError(msg)
        setSubmitting(false)
        return
      }
      setSubmitting(false)
      onPublished?.(data.publishedId)
      onClose()
      router.refresh()
    } catch {
      setSubmitting(false)
      setError('Netwerkfout — probeer het opnieuw.')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Publiceer ${calculator.name}`}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4 pb-[calc(1rem+var(--safe-area-bottom,0px))]"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-horizon-50 flex items-center justify-center shrink-0">
              <Globe2 className="w-4 h-4 text-horizon-700" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                Publiceer in de bibliotheek
              </div>
              <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5 truncate">
                {calculator.name}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        <p className="text-xs text-[var(--ink-2)] leading-relaxed mb-4">
          Anderen zien deze rekenhulp met de waarden die jij hieronder
          instelt — niet jouw privé-cijfers. Suggesties zijn afgerond op
          ronde getallen; je mag ze aanpassen.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {error}
          </div>
        )}

        <ul className="space-y-3">
          {inputs.map((input) => (
            <InputRow
              key={input.key}
              input={input}
              publicValue={defaults[input.key] ?? 0}
              prefillEnabled={prefillOverrides[input.key] ?? false}
              onPublicValueChange={(v) => updateDefault(input.key, v)}
              onTogglePrefill={() => togglePrefill(input.key)}
            />
          ))}
        </ul>

        <aside className="mt-4 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-[var(--ink-3)] mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px] text-[var(--ink-3)] leading-snug">
            Educatieve berekening — geen financieel advies. Voor je
            persoonlijke situatie raadpleeg je een erkend financieel
            planner.
          </p>
        </aside>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
          >
            Annuleer
          </button>
          <Button type="submit" disabled={submitting} className="gap-1.5">
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Globe2 className="w-4 h-4" aria-hidden="true" />
            )}
            Publiceren
          </Button>
        </div>
      </form>
    </div>
  )
}

/**
 * Eén rij in de inputs-lijst. Toont privé-waarde (readonly) naast het
 * te bewerken publieke voorbeeld en — indien van toepassing — de
 * prefill-toggle. De prefill-uitleg is bewust kort; in de hoofdcopy
 * staat het waarom van de hele flow.
 */
function InputRow({
  input,
  publicValue,
  prefillEnabled,
  onPublicValueChange,
  onTogglePrefill,
}: {
  input: CalculatorInput
  publicValue: number
  prefillEnabled: boolean
  onPublicValueChange: (raw: string) => void
  onTogglePrefill: () => void
}) {
  const hasPrefill = Boolean(input.prefill)
  const step = input.step ?? defaultStepForKind(input.kind)

  return (
    <li className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-sm font-semibold text-[var(--ink)]">{input.label}</span>
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {kindLabel(input.kind)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="block">
          <span className="block text-[11px] font-semibold text-[var(--ink-3)] mb-1">
            Jouw waarde
          </span>
          <input
            type="number"
            value={input.default}
            readOnly
            tabIndex={-1}
            aria-readonly="true"
            className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-2.5 py-1.5 text-sm text-[var(--ink-3)] cursor-not-allowed"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-[var(--ink-2)] mb-1">
            Voorbeeld voor anderen
          </span>
          <input
            type="number"
            inputMode="decimal"
            step={step}
            value={Number.isFinite(publicValue) ? publicValue : 0}
            onChange={(e) => onPublicValueChange(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-sm focus:outline-none focus:border-[var(--ink-3)]"
          />
        </label>
      </div>

      {hasPrefill && (
        <label className="flex items-start gap-2 mt-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={prefillEnabled}
            onChange={onTogglePrefill}
            className="mt-0.5 h-4 w-4 rounded border-[var(--border-ed)] accent-horizon-600"
          />
          <span className="text-[11px] text-[var(--ink-2)] leading-snug">
            Anderen mogen hier hun eigen waarde uit hun profiel laten invullen
            <span className="block text-[var(--ink-3)] text-[10px] mt-0.5">
              Uit zet betekent dat iedereen jouw voorbeeldwaarde ziet.
            </span>
          </span>
        </label>
      )}
    </li>
  )
}

function kindLabel(kind: InputKind): string {
  switch (kind) {
    case 'euro':
      return 'EUR'
    case 'percent':
      return 'Fractie'
    case 'years':
      return 'Jaren'
    case 'number':
      return 'Getal'
    case 'boolean':
      return 'Ja/nee'
    case 'enum':
      return 'Keuze'
  }
}

/**
 * Sensible step per kind als het schema geen `step` heeft. EUR springt
 * met €100, percent met 0.001 (1 promille — fijn genoeg), years per 1.
 */
function defaultStepForKind(kind: InputKind): number {
  switch (kind) {
    case 'euro':
      return 100
    case 'percent':
      return 0.001
    case 'years':
      return 1
    case 'number':
      return 1
    case 'boolean':
    case 'enum':
      // Categorische inputs hebben geen "step" — value komt uit
      // toggle/segmented control, niet uit een slider.
      return 1
  }
}
