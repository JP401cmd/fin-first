'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShellOverlay, type PaneAction } from '@/components/app/shell/shell-overlay'
import UitgavenNaPensioenClient, {
  type UitgavenPaneActionsState,
} from '@/app/(app)/horizon/uitgaven-na-pensioen/uitgaven-client'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

interface UitgavenPaneProps {
  open: boolean
  onClose: () => void
}

interface Context {
  initialMethod: RetirementExpenseMethod
  customAmount: number | null
  yearlyMustExpenses: number
  yearlyIncome: number
  estimatedYearlyExpenses: number
  currentRetirementExpense: number
  budgetingActive: boolean
  savedAspirations: unknown
}

export function UitgavenPane({ open, onClose }: UitgavenPaneProps) {
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumpt de fetch-effect-dep zodat de pane zijn ctx opnieuw ophaalt ná een
  // methode-wissel (save) terwijl 'ie open blijft. Zonder dit blijft `ctx`
  // (incl. currentRetirementExpense) hangen op de waarde van de initiële open —
  // `router.refresh()` in de child raakt deze client-fetch-state niet.
  const [reloadKey, setReloadKey] = useState(0)
  const reloadContext = useCallback(() => setReloadKey(k => k + 1), [])
  // Save-state komt uit de child via `onActionsChange`. We houden 'm hier
  // in lokale state zodat de pane-footer (primary/secondary) reactief is.
  // Default = `null` → footer wordt niet gerenderd zolang de child nog niet
  // gepubliceerd heeft (eerste render of niet-custom flow).
  const [actions, setActions] = useState<UitgavenPaneActionsState | null>(null)
  const { masked } = useMaskedAmounts()

  // Bewust setState-in-effect voor data-fetching: we synchroniseren externe
  // state (HTTP) met React. De alternatieve patronen (Suspense / SWR) zouden
  // de pane-wrapper veel ingrijpender maken; dit volgt het bestaande pattern
  // in `account-form-modal.tsx` en sheet-componenten.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/uitgaven-na-pensioen/context')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Laden mislukt')
        return r.json() as Promise<Context>
      })
      .then(data => {
        if (!cancelled) setCtx(data)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Onbekende fout')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, reloadKey])

  // Reset actions wanneer de pane sluit, anders blijft een stale snapshot
  // hangen voor de volgende open (tot child re-publishes). Bewust set-state-
  // in-effect: synchroniseert externe lifecycle (open/close) met lokale state.
  useEffect(() => {
    if (!open) setActions(null)
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Stabiele callback voor de child — anders trigger we elke render een
  // nieuwe `onActionsChange`-identity en daarmee een onnodige effect-loop.
  const handleActionsChange = useCallback((next: UitgavenPaneActionsState) => {
    setActions(next)
  }, [])

  // Footer-knoppen samenstellen: alleen tonen tijdens custom-flow waar er
  // iets op te slaan valt (andere methoden saven direct bij methode-klik).
  const primaryAction: PaneAction | undefined =
    actions && actions.isCustom
      ? {
          label: actions.savedFlash ? 'Opgeslagen' : 'Opslaan',
          onClick: actions.save,
          disabled: !actions.canSave,
          loading: actions.saving,
        }
      : undefined
  const secondaryAction: PaneAction | undefined =
    actions && actions.isCustom
      ? {
          label: 'Annuleren',
          onClick: onClose,
        }
      : undefined

  // Live preview-bedrag náást de Opslaan/Annuleren-knoppen — alleen tijdens
  // custom-flow zinvol (de andere methoden saven direct bij methode-klik en
  // hebben geen knoppen-rij). Toont dezelfde berekening die de pane na
  // opslaan vastlegt, met privacy-masking voor consistente UX.
  const footerInfo =
    actions && actions.isCustom ? (
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
          Voorlopig totaal
        </span>
        <span
          className="font-mono tabular-nums text-base font-bold text-[var(--ink)]"
        >
          {formatMaskedCurrency(actions.finalAmount, masked)}
          <span className="text-[var(--ink-3)] font-normal text-xs ml-1">/ jr</span>
        </span>
      </div>
    ) : undefined

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="pane"
      mobileBackCloses
      title="Uitgave na pensioen"
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      footerInfo={footerInfo}
    >
      {loading && !ctx ? (
        <div className="px-6 py-12 text-center text-sm text-[var(--ink-3)]">Laden…</div>
      ) : error ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-red-700">Fout bij laden: {error}</p>
          <button
            type="button"
            onClick={() => {
              setCtx(null)
              setError(null)
              // Trigger reload
              setLoading(true)
              fetch('/api/uitgaven-na-pensioen/context')
                .then(async r => (r.ok ? r.json() : Promise.reject(await r.json())))
                .then(setCtx)
                .catch(e => setError(e?.error ?? 'Onbekende fout'))
                .finally(() => setLoading(false))
            }}
            className="mt-3 text-xs underline text-[var(--ink-2)]"
          >
            Probeer opnieuw
          </button>
        </div>
      ) : ctx ? (
        <UitgavenNaPensioenClient
          initialMethod={ctx.initialMethod}
          customAmount={ctx.customAmount}
          yearlyMustExpenses={ctx.yearlyMustExpenses}
          yearlyIncome={ctx.yearlyIncome}
          estimatedYearlyExpenses={ctx.estimatedYearlyExpenses}
          currentRetirementExpense={ctx.currentRetirementExpense}
          budgetingActive={ctx.budgetingActive}
          savedAspirations={ctx.savedAspirations}
          inPane
          onActionsChange={handleActionsChange}
          onSaved={onClose}
          onSaveComplete={reloadContext}
        />
      ) : null}
    </ShellOverlay>
  )
}
