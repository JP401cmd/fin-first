'use client'

/**
 * InvestmentHoldingPane — view↔edit detail-pane voor één investment-positie
 * (aandeel/ETF/fonds) op `/core/assets/holdings` en op de Holdings-app
 * deepening (`/core/assets/investment?tab=holdings`). Volgt de patroon-kaart
 * "Entity detail-pane met mode-switch" uit `.claude/commands/ui-ux.md`.
 *
 * Canonical referentie:
 *   - `components/core/deepenings/crypto-holdings/crypto-holding-pane.tsx`
 *     — net afgerond, exact het patroon dat we hier kopiëren.
 *
 * Twee modi:
 *   - **view** — read-only context: mini-hero (waarde + tone-marker),
 *     ISIN/currency-badges, figures-strip (4 cellen), meta-rij in mono
 *     UPPERCASE, optionele bron-banner bij broker-imports en transacties-
 *     tabel. **Geen prijs-chart**: investment-detail toont die niet
 *     (full-page detail rendert ook geen chart). Footer: Bewerken / Sluiten.
 *   - **edit** — form: units, gem. inkoopprijs en notes. Bij broker-imports
 *     (`externalSource !== null`) staat het units-veld read-only met een
 *     uitleg-banner; gem. inkoopprijs en notes blijven altijd bewerkbaar
 *     (broker-import levert vaak geen avg-price terug, dus dat is een
 *     gebruiker-eigen veld). Footer: Opslaan / Annuleren.
 *
 * Data-flow:
 *   - Holding-row komt van de parent (`holdings-client.tsx`) via prop —
 *     geen extra fetch. Alleen de velden die de parent al heeft (zie
 *     `InvestmentHoldingPaneInput` hieronder) worden gelezen.
 *   - Detail-data (transactions) wordt on-demand opgehaald via
 *     `GET /api/investment/holdings/[id]/detail` zodra een holding wordt
 *     geselecteerd. Sequentiële fetches per holding-wissel; geen waterfall
 *     op de holdings-pagina zelf.
 *
 * Render-mechanisme: `<ShellOverlay kind="pane">` regelt automatisch
 *   - desktop (≥lg) → `SlideInPane` rechts (560px / xl 680px breed)
 *   - mobile (<lg)  → `BottomSheet` size="full" als fallback
 * Beide krijgen identieke pane-header (← + ✕), header-actions slot en
 * sticky footer-bar. Driewegregel: delete-confirm en pane zijn siblings,
 * geen nesting.
 *
 * URL-state: deze component is **stateless** voor pane-open/close — de
 * parent (`holdings-client.tsx`) leest `?holding=<id>` uit
 * `useSearchParams()` en geeft de holding (of `null`) als prop door.
 * `onClose` ruimt de query-param op via `router.replace()`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Briefcase,
  TrendingDown,
  TrendingUp,
  Trash2,
} from 'lucide-react'
import {
  ShellOverlay,
  type PaneAction,
} from '@/components/app/shell/shell-overlay'
import { useToast } from '@/components/app/toast-provider'
import { formatCurrency } from '@/lib/format'

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Render units met genoeg precisie om kleine fracties leesbaar te houden.
 * Investment-units hebben doorgaans 0–4 decimalen (broker-rapportage); we
 * volgen dezelfde regel als `crypto-holding-pane.tsx::formatUnits`.
 * Trailing zeros worden gestript zodat "100.0000" niet drukker oogt dan
 * nodig.
 */
function formatUnits(units: number): string {
  if (!isFinite(units)) return '0'
  const decimals = Math.abs(units) >= 1 ? 4 : 6
  return units.toFixed(decimals).replace(/\.?0+$/, '')
}

/** Krant-stijl korte datum, identiek aan de full-page detail. */
function formatNewspaperDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return new Intl.DateTimeFormat('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

/** Capitalize eerste letter — gebruikt voor broker-source labels. */
function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Currency-aware formatter voor non-EUR holdings (USD/GBP/...). Valt terug
 * op `${value.toFixed(2)} ${currency}` als de browser de ISO-code niet
 * herkent — voorkomt een runtime-throw op exotische currencies.
 */
function formatCurrencyOf(value: number, currency: string): string {
  const safe = Number.isFinite(value) ? value : 0
  if (!currency || currency === 'EUR') return formatCurrency(safe)
  try {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe)
  } catch {
    return `${safe.toFixed(2)} ${currency}`
  }
}

// ── Types ──────────────────────────────────────────────────────────────

type InvestmentHoldingPaneMode = 'view' | 'edit'

/**
 * Save-state shape die de edit-form publiceert naar de pane-wrapper. Mirror
 * van `CryptoEditActionsState` zodat de pane-footer de save-CTA kan tonen
 * zonder de form-state zelf te kennen.
 */
interface InvestmentEditActionsState {
  canSave: boolean
  saving: boolean
  isEditing: boolean
  /** Roept de meest recente save-handler aan (via ref). */
  save: () => void
}

/**
 * Eén transactie-rij zoals geleverd door `GET /api/investment/holdings/[id]/detail`.
 * Server-side al genormaliseerd naar `number | null` voor numerieke velden.
 */
interface InvestmentTransactionDetailRow {
  id: string
  type: string
  units: number
  price_per_unit: number | null
  total_amount: number | null
  currency: string | null
  date: string
  notes: string | null
  external_source: string | null
}

/**
 * Server-side holding-row die de detail-endpoint ophaalt — bevat de
 * edit-form-velden (`notes`, `avg_purchase_price`) die de pane-prop niet
 * altijd vers heeft. De velden zijn een subset van de DB-kolommen; we
 * lezen alleen wat de edit-form als baseline nodig heeft.
 */
interface InvestmentHoldingDetailHolding {
  notes: string | null
}

interface InvestmentHoldingDetailPayload {
  /**
   * Server-fresh holding-row inclusief `notes`. De pane-prop kan stale zijn
   * (page-server-render moment), maar de detail-fetch is on-demand bij
   * pane-open en levert daarmee de meest actuele DB-staat. Edit-mode
   * gebruikt deze waarde als baseline voor de notes-textarea zodat een
   * gewijzigde notitie elders (andere tab, externe PATCH) correct
   * pre-filled wordt.
   */
  holding: InvestmentHoldingDetailHolding
  transactions: InvestmentTransactionDetailRow[]
}

/**
 * Minimale velden die de pane uit de parent verwacht. Dit is een subset van
 * de `Holding`-shape in `holdings-client.tsx` plus de typed
 * `InvestmentHoldingRow` uit `lib/investment-holdings-data.ts`. Bewust een
 * eigen interface op pane-niveau (in plaats van direct importeren) zodat
 * de pane onafhankelijk is van zowel de loader-shape als de page-state-
 * shape, en zo bruikbaar blijft als één van die twee evolueert.
 */
export interface InvestmentHoldingPaneInput {
  id: string
  ticker: string | null
  name: string
  isin: string | null
  units: number
  /**
   * Native currency van het instrument (USD/EUR/GBP/...). EUR is de default
   * wanneer de bron geen expliciete currency leverde.
   */
  currency: string | null
  currentPrice: number | null
  avgPurchasePrice: number
  /** Optioneel: notities. `null` of leeg = geen notitie. */
  notes: string | null
  /**
   * Bron-tag: `'degiro' | 'saxo' | 'ing' | 'trading212' | 'etoro'` voor
   * broker-imports, `null` voor handmatig ingevoerd. Bepaalt of de
   * auto-sync banner verschijnt en of het units-veld read-only is.
   */
  externalSource: string | null
  lastPriceUpdate: string | null
  /** Dag-Δ% (Yahoo Finance refresh). Null voor manual rijen of bij feed-storing. */
  dailyChangePercent: number | null
  /** TER (decimaal, bv 0.0022 = 0.22%). Null = onbekend; UI verbergt dan de regel. */
  ter: number | null
}

// ── Props ──────────────────────────────────────────────────────────────

export interface InvestmentHoldingPaneProps {
  /** Wanneer null is de pane gesloten. Symmetrisch met `CryptoHoldingPane`. */
  holding: InvestmentHoldingPaneInput | null
  /** Sluit-callback — parent ruimt URL-state op. */
  onClose: () => void
  /**
   * Aangeroepen na succesvolle save / delete. Parent kan dan
   * `router.refresh()` triggeren zodat de holdings-list zich herlaadt.
   */
  onChanged?: () => void
}

// ── Component ──────────────────────────────────────────────────────────

export function InvestmentHoldingPane({
  holding,
  onClose,
  onChanged,
}: InvestmentHoldingPaneProps) {
  const { addToast } = useToast()

  const [mode, setMode] = useState<InvestmentHoldingPaneMode>('view')
  const [editActions, setEditActions] = useState<InvestmentEditActionsState | null>(
    null,
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTypeInput, setDeleteTypeInput] = useState('')

  // Detail-data (tx). On-demand fetch bij holding-wissel.
  const [detail, setDetail] = useState<InvestmentHoldingDetailPayload | null>(
    null,
  )
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailReloadKey, setDetailReloadKey] = useState(0)

  const open = holding !== null
  const tickerDisplay = holding?.ticker?.toUpperCase() ?? ''
  const displayName = holding?.name?.trim() || tickerDisplay
  // Pane-titel volgt het patroon van CryptoHoldingPane: korte identifier
  // links, dan de bestand-naam ernaast. Bij gelijke waarden tonen we alleen
  // de ticker-string zodat we niet "VWRL · VWRL" laten zien.
  const baseTitle = holding
    ? holding.name && holding.name.trim().length > 0 && displayName !== tickerDisplay
      ? `${tickerDisplay} · ${displayName}`
      : tickerDisplay || displayName
    : ''
  const title =
    mode === 'edit' && holding ? `${baseTitle} — bewerken` : baseTitle

  // Reset interne state bij holding-wissel — anders zou een nieuwe holding
  // openen in de oude edit-mode of met de oude detail-data tonen tot de
  // fetch klaar is. We resetten alleen op id-wisseling (niet op object-
  // identity) zodat een refresh-roundtrip met dezelfde id niet flickert.
  useEffect(() => {
    if (holding) {
      setMode('view')
      setEditActions(null)
      setConfirmDelete(false)
      setDeleteTypeInput('')
      setDetail(null)
      setDetailError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding?.id])

  // Wanneer mode terug naar 'view' valt, ruimen we de gepubliceerde edit-
  // actions op zodat de pane-footer geen stale save-handler vasthoudt.
  useEffect(() => {
    if (mode !== 'edit') setEditActions(null)
  }, [mode])

  // Lazy detail-fetch: alleen wanneer een holding is geselecteerd. We
  // includeren `detailReloadKey` zodat een retry-knop op de error-banner
  // de fetch opnieuw kan triggeren zonder de holding te wisselen.
  useEffect(() => {
    if (!holding) return
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    fetch(`/api/investment/holdings/${holding.id}/detail`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((data: InvestmentHoldingDetailPayload) => {
        if (cancelled) return
        setDetail({
          holding: data.holding,
          transactions: data.transactions ?? [],
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Onbekende fout'
        setDetailError(`Detailgegevens niet geladen (${msg})`)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
    // We willen alleen op `holding.id` triggeren — een nieuwe object-
    // identity met dezelfde id (na router.refresh) mag de fetch niet
    // opnieuw kicken. De fetch-URL gebruikt alleen `holding.id`, dus de
    // bredere `holding`-ref is niet nodig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding?.id, detailReloadKey])

  const handleEditActionsChange = useCallback(
    (next: InvestmentEditActionsState) => {
      setEditActions(next)
    },
    [],
  )

  const handleRetryDetail = useCallback(() => {
    setDetailReloadKey((k) => k + 1)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!holding) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/holdings?id=${holding.id}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 200) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      addToast({
        type: 'success',
        title: `${tickerDisplay || displayName} verwijderd`,
        message:
          'Bestaande transacties blijven in de geschiedenis bewaard. Je kunt de positie later opnieuw toevoegen.',
      })
      setConfirmDelete(false)
      onClose()
      onChanged?.()
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Verwijderen mislukt',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      })
    } finally {
      setDeleting(false)
    }
  }, [holding, tickerDisplay, displayName, addToast, onClose, onChanged])

  if (!holding) {
    // Render een gesloten pane zodat de unmount-animatie kan eindigen
    // wanneer parent `null` doorgeeft. ShellOverlay regelt het zelf
    // wanneer `open=false`.
    return (
      <ShellOverlay kind="pane" open={false} onClose={onClose} title="">
        <div />
      </ShellOverlay>
    )
  }

  // Footer-acties per mode. View: Bewerken / Sluiten. Edit: Opslaan /
  // Annuleren — primary disabled tot er iets te wijzigen valt.
  const primaryAction: PaneAction | undefined =
    mode === 'edit'
      ? editActions
        ? {
            label: 'Opslaan',
            onClick: editActions.save,
            disabled: !editActions.canSave,
            loading: editActions.saving,
          }
        : undefined
      : {
          label: 'Bewerken',
          onClick: () => setMode('edit'),
        }

  const secondaryAction: PaneAction | undefined =
    mode === 'edit'
      ? {
          label: 'Annuleren',
          onClick: () => setMode('view'),
        }
      : {
          label: 'Sluiten',
          onClick: onClose,
        }

  // Header-action: alleen in view-mode een delete-icon. In edit-mode geen
  // header-action zodat de footer-knoppen de enige actie-affordance vormen
  // — voorkomt dat een delete tijdens een onopgeslagen edit verborgen blijft
  // achter een mode-switch. Symmetrisch met `crypto-holding-pane.tsx`.
  const headerActions =
    mode === 'view' ? (
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-600 hover:bg-red-50"
        aria-label="Holding verwijderen"
        title="Verwijderen"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    ) : null

  // Type-to-confirm: gebruiker moet exact de ticker typen (case-insensitive
  // match) voordat de delete-knop enabled wordt. Voorkomt accidental click
  // op een gevoelige actie. Bij een holding zonder ticker (handmatig zonder
  // ticker ingevoerd) valt de check terug op de display-naam.
  const deleteIdentifier = tickerDisplay || displayName
  const deleteCanConfirm =
    deleteTypeInput.trim().toUpperCase() === deleteIdentifier.toUpperCase()

  return (
    <>
      <ShellOverlay
        kind="pane"
        open={open}
        onClose={onClose}
        title={title}
        actions={headerActions}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
      >
        {mode === 'view' && (
          <InvestmentHoldingPaneView
            holding={holding}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onRetry={handleRetryDetail}
          />
        )}
        {mode === 'edit' && (
          <InvestmentHoldingPaneEdit
            holding={holding}
            detail={detail}
            onSaved={() => {
              setMode('view')
              onChanged?.()
              // Detail-bundle herladen — units/avg kunnen invloed hebben op
              // de berekende rendement-cellen. We bumpen de reload-key zodat
              // de fetch opnieuw draait.
              setDetailReloadKey((k) => k + 1)
            }}
            onActionsChange={handleEditActionsChange}
          />
        )}
      </ShellOverlay>

      {/* Delete-confirm — sibling overlay (driewegregel). Type-to-confirm
          is bewust verplicht omdat dit een onomkeerbare actie is en geen
          undo-slot in de UI bestaat. */}
      <ShellOverlay
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false)
          setDeleteTypeInput('')
        }}
        kind="confirm"
        title="Holding verwijderen?"
        destructive
      >
        <div className="space-y-4 p-5">
          <p
            className="font-serif text-base leading-relaxed text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-source-serif, serif)' }}
          >
            <strong className="text-[var(--ink)]">{deleteIdentifier}</strong>{' '}
            wordt uit je actieve holdings verwijderd. Bestaande
            transactiehistorie blijft bewaard. Je kunt deze later weer
            toevoegen via een import of handmatig.
          </p>
          <div>
            <label
              htmlFor="investment-delete-confirm-input"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
            >
              Typ {deleteIdentifier} om te bevestigen
            </label>
            <input
              id="investment-delete-confirm-input"
              type="text"
              value={deleteTypeInput}
              onChange={(e) => setDeleteTypeInput(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              className="w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tracking-[0.1em] text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
              placeholder={deleteIdentifier}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false)
                setDeleteTypeInput('')
              }}
              className="border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
              style={{ minHeight: 44 }}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={!deleteCanConfirm || deleting}
              className="border border-red-600 bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              {deleting ? 'Verwijderen…' : 'Definitief verwijderen'}
            </button>
          </div>
        </div>
      </ShellOverlay>
    </>
  )
}

// ── View-mode body ─────────────────────────────────────────────────────

interface InvestmentHoldingPaneViewProps {
  holding: InvestmentHoldingPaneInput
  detail: InvestmentHoldingDetailPayload | null
  loading: boolean
  error: string | null
  onRetry: () => void
}

function InvestmentHoldingPaneView({
  holding,
  detail,
  loading,
  error,
  onRetry,
}: InvestmentHoldingPaneViewProps) {
  const units = holding.units
  const currentPrice = holding.currentPrice
  const avgPrice = holding.avgPurchasePrice
  const currency = (holding.currency ?? 'EUR').toUpperCase()
  const dailyChange = holding.dailyChangePercent
  const ter = holding.ter
  const externalSource = holding.externalSource
  const tickerDisplay = holding.ticker?.toUpperCase() ?? ''

  // Marktwaarde + rendement-tone in native currency (en wanneer non-EUR
  // tonen we een currency-suffix). Mirror van de full-page detail
  // `app/(app)/core/assets/investment/[holdingId]/page.tsx` regel 187-215.
  const value = currentPrice != null ? units * currentPrice : 0
  const costBasis = avgPrice > 0 ? units * avgPrice : null
  const returnPct =
    costBasis != null && costBasis !== 0
      ? ((value - costBasis) / costBasis) * 100
      : null
  const returnVal = costBasis != null ? value - costBasis : null

  const valueTone =
    returnPct == null ? 'neutral' : returnPct >= 0 ? 'positive' : 'negative'
  const valueToneClass =
    valueTone === 'positive'
      ? 'text-positive'
      : valueTone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink)]'

  const lastPriceFormatted = formatNewspaperDate(holding.lastPriceUpdate)

  return (
    <div className="space-y-7">
      {/* 1. Mini-hero — uitkomst-anker van de pane.
          Hoofdbedrag is de marktwaarde (native currency); tone volgt
          rendement. Highlight-marker (`linear-gradient`) markeert dit als
          het primaire scan-doel. Sub-meta in italic Source Serif geeft
          units × ticker als context. 24h-pijl rechts wanneer de feed dat
          oplevert. */}
      <section>
        <div
          className={`font-mono text-[28px] leading-none tabular-nums sm:text-[36px] font-bold ${valueToneClass}`}
        >
          <span
            className="inline px-1"
            style={{
              backgroundImage:
                'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
            }}
          >
            {formatCurrencyOf(value, currency)}
          </span>
          {dailyChange != null && (
            <span
              className="ml-3 inline-flex items-center gap-1 align-middle text-base font-medium tracking-normal"
              aria-label={
                dailyChange >= 0
                  ? `Vandaag plus ${dailyChange.toFixed(2)} procent`
                  : `Vandaag min ${Math.abs(dailyChange).toFixed(2)} procent`
              }
            >
              {dailyChange >= 0 ? (
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="font-mono tabular-nums">
                {dailyChange >= 0 ? '+' : ''}
                {dailyChange.toFixed(2)}%
              </span>
            </span>
          )}
        </div>
        <p
          className="mt-2 text-sm italic leading-relaxed text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, serif)' }}
        >
          {avgPrice > 0
            ? `${formatUnits(units)} eenheden${tickerDisplay ? ` · ${tickerDisplay}` : ''} · gem. inkoop ${formatCurrencyOf(avgPrice, currency)}`
            : `${formatUnits(units)} eenheden${tickerDisplay ? ` · ${tickerDisplay}` : ''}`}
        </p>
      </section>

      {/* 2. ISIN + currency badges — krant-meta direct onder de mini-hero.
          ISIN als monospace identifier; currency-pill alleen wanneer
          non-EUR (EUR is de default, dus zou ruis zijn). */}
      {(holding.isin || currency !== 'EUR') && (
        <section className="flex flex-wrap items-center gap-2">
          {holding.isin && (
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
              <span className="mr-1.5 font-semibold uppercase tracking-[0.06em] text-[var(--ink-4)]">
                ISIN
              </span>
              {holding.isin}
            </span>
          )}
          {currency !== 'EUR' && (
            <span className="inline-flex h-6 items-center border border-[var(--border-ed)] bg-[var(--paper)] px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              {currency}
            </span>
          )}
        </section>
      )}

      {/* 3. Mini-figures-strip — 4 cellen met figures-strip styling.
          Playfair black bedragen, top+bottom ink-borders, verticale
          rule-soft dividers, mobile 2-rij grid met onderborder op
          cellen 1-2. Highlight-marker bewust niet hier, want die zit al
          op het mini-hero hoofdbedrag — twee markers per pagina-sectie
          verwateren de signaal-discipline. */}
      <section className="grid grid-cols-2 border-t border-b border-[var(--rule-soft)] sm:grid-cols-4">
        <FigureCell
          label="MARKTWAARDE"
          value={formatCurrencyOf(value, currency)}
          rowOneOnMobile
        />
        <FigureCell
          label="EENHEDEN"
          value={formatUnits(units)}
          rowOneOnMobile
        />
        <FigureCell
          label="HUIDIGE PRIJS"
          value={
            currentPrice != null ? formatCurrencyOf(currentPrice, currency) : '—'
          }
          sub={
            dailyChange != null
              ? `${dailyChange >= 0 ? '+' : ''}${dailyChange.toFixed(2)}% vandaag`
              : undefined
          }
          tone={
            dailyChange != null
              ? dailyChange >= 0
                ? 'positive'
                : 'negative'
              : 'neutral'
          }
        />
        <FigureCell
          label="RENDEMENT"
          value={
            returnPct != null
              ? `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%`
              : '—'
          }
          sub={
            returnVal != null
              ? `${returnVal >= 0 ? '+' : ''}${formatCurrencyOf(returnVal, currency)}`
              : 'kostenbasis onbekend'
          }
          tone={valueTone}
        />
      </section>

      {/* 4. Meta-rij — krant-meta in mono UPPERCASE.
          "Prijs bijgewerkt {datum}" + optionele TER + bron-tag.
          Items gescheiden door ` · `. Verberg de hele regel als geen van
          de drie bronnen iets oplevert. */}
      {(lastPriceFormatted || (ter != null && ter > 0) || externalSource) && (
        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
            {lastPriceFormatted && (
              <span>Prijs bijgewerkt {lastPriceFormatted}</span>
            )}
            {lastPriceFormatted && ter != null && ter > 0 && <span> · </span>}
            {ter != null && ter > 0 && (
              <span>
                TER {(ter * 100).toFixed(2).replace(/\.?0+$/, '')}%
              </span>
            )}
            {(lastPriceFormatted || (ter != null && ter > 0)) &&
              externalSource && <span> · </span>}
            {externalSource && <span>Bron · {capitalize(externalSource)}</span>}
          </p>
        </section>
      )}

      {/* 5. Bron-info-banner — alleen voor broker-imports. Voor manual
          holdings (externalSource = null) tonen we niets, conform de
          spec en analoog aan de auto-sync banner in de crypto-pane. */}
      {externalSource && (
        <section
          className="flex items-start gap-2 border border-l-4 border-[var(--border-ed)] border-l-[var(--ink-3)] bg-[var(--paper)] px-3 py-2"
          style={{ borderRadius: 'var(--r)' }}
        >
          <Briefcase
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]"
            aria-hidden="true"
          />
          <p
            className="text-[12px] leading-snug text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-source-serif, serif)' }}
          >
            Geïmporteerd via{' '}
            <strong className="not-italic">{capitalize(externalSource)}</strong>
            . Aantal en valuta worden automatisch gesynchroniseerd vanuit deze
            bron.
          </p>
        </section>
      )}

      {/* 6. Transacties-tabel — compacte 5-koloms (Datum / Type /
          Eenheden / Prijs / Totaal). Loading skeleton tijdens fetch,
          empty state als er geen transacties zijn. Mirror van de
          crypto-pane tabel-component. */}
      <section>
        <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Transactiegeschiedenis
        </h3>
        {loading && !detail ? (
          <TransactionsSkeleton />
        ) : error && !detail ? (
          <DetailErrorBanner message={error} onRetry={onRetry} />
        ) : detail && detail.transactions.length > 0 ? (
          <InvestmentPaneTransactionsTable
            transactions={detail.transactions}
            fallbackCurrency={currency}
          />
        ) : (
          <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8 text-center">
            <p
              className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]"
              style={{ fontFamily: 'var(--font-source-serif, serif)' }}
            >
              Geen transacties geregistreerd voor deze positie.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

// ── View-mode helpers ──────────────────────────────────────────────────

interface InvestmentPaneTransactionsTableProps {
  transactions: InvestmentTransactionDetailRow[]
  /** Fallback-currency voor rijen zonder eigen `currency`-veld. */
  fallbackCurrency: string
}

function InvestmentPaneTransactionsTable({
  transactions,
  fallbackCurrency,
}: InvestmentPaneTransactionsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border-ed)]">
            <th className="py-2 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Datum
            </th>
            <th className="py-2 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Type
            </th>
            <th className="py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Eenheden
            </th>
            <th className="py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Prijs
            </th>
            <th className="py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Totaal
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const px = tx.price_per_unit
            const total = tx.total_amount
            const cur = (tx.currency ?? fallbackCurrency).toUpperCase()
            return (
              <tr
                key={tx.id}
                className="border-b border-[var(--border-ed)] hover:bg-[var(--subtle)]"
              >
                <td className="py-2 font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                  {formatNewspaperDate(tx.date) ?? tx.date}
                </td>
                <td className="py-2 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-2)]">
                  {tx.type}
                </td>
                <td className="py-2 text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">
                  {formatUnits(tx.units)}
                </td>
                <td className="py-2 text-right font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                  {px != null ? formatCurrencyOf(px, cur) : '—'}
                </td>
                <td className="py-2 text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">
                  {total != null ? formatCurrencyOf(total, cur) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TransactionsSkeleton() {
  // Drie rijen van een grijze balk — voldoende om de leesvolgorde te
  // suggereren zonder de pane vol te ploppen met fake data.
  return (
    <div aria-hidden="true" className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-7 w-full border border-[var(--border-ed)] bg-[var(--subtle)]/60"
        />
      ))}
    </div>
  )
}

interface DetailErrorBannerProps {
  message: string
  onRetry: () => void
}

function DetailErrorBanner({ message, onRetry }: DetailErrorBannerProps) {
  return (
    <div className="flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-snug">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium text-red-800 hover:bg-red-100"
      >
        Opnieuw proberen
      </button>
    </div>
  )
}

// ── Edit-mode body ─────────────────────────────────────────────────────

interface InvestmentHoldingPaneEditProps {
  holding: InvestmentHoldingPaneInput
  /**
   * On-demand opgehaalde detail-bundle. `null` zolang de fetch loopt of
   * faalt. De `notes`-baseline komt hieruit: `detail.holding.notes` is de
   * server-fresh waarde, `holding.notes` (prop) is de page-load-waarde —
   * meestal gelijk maar kan stale zijn na een externe PATCH.
   */
  detail: InvestmentHoldingDetailPayload | null
  onSaved: () => void
  onActionsChange: (state: InvestmentEditActionsState) => void
}

function InvestmentHoldingPaneEdit({
  holding,
  detail,
  onSaved,
  onActionsChange,
}: InvestmentHoldingPaneEditProps) {
  const { addToast } = useToast()

  // Initial state spiegelt de holding-prop. We bewaren een lokaal "initial"
  // snapshot zodat de canSave-check werkt op werkelijke wijzigingen — niet
  // op rerenders van dezelfde prop-waarden.
  const initialUnits = holding.units
  const initialAvgPrice = holding.avgPurchasePrice ?? 0
  // Notes-baseline: server-fresh als de detail-fetch klaar is, anders de
  // prop-waarde (`holding.notes`). Empty-string als beide null zijn. We
  // berekenen dit dynamisch zodat een laat-arriverende detail-fetch (bv.
  // user opent direct edit-mode) de pre-fill alsnog bijwerkt via het
  // useEffect-resync hieronder.
  const serverNotes = detail?.holding.notes ?? holding.notes ?? ''

  const [unitsInput, setUnitsInput] = useState(formatUnitsInput(initialUnits))
  const [avgPriceInput, setAvgPriceInput] = useState(
    initialAvgPrice > 0 ? avgPriceToInput(initialAvgPrice) : '',
  )
  const [notesInput, setNotesInput] = useState(serverNotes)
  // We dirty-flag de notes zodat een laat-arriverende detail-fetch de
  // gebruiker-invoer niet overschrijft. Onbewerkt veld → herladen bij detail.
  const [notesDirty, setNotesDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Sync notes-input wanneer de detail-fetch arriveert nadat de edit-mode
  // al open was. Zonder deze sync zou de textarea de oude prop-waarde
  // tonen totdat de gebruiker zelf typt. We respecteren `notesDirty`
  // zodat een actieve typing-sessie niet wordt gewist.
  useEffect(() => {
    if (notesDirty) return
    setNotesInput(detail?.holding.notes ?? holding.notes ?? '')
    // We willen alleen op detail-arrival (en holding-id-wisseling) syncen,
    // niet bij elke holding-prop-rerender met dezelfde id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.holding.notes, holding.id])

  // Auto-sync: alleen units staat read-only bij broker-import. Avg-purchase-
  // price blijft bewerkbaar omdat brokers vaak geen gewogen-gemiddelde
  // doorgeven (bv. DEGIRO levert per-trade-prijs maar geen position-avg).
  // Notes blijft altijd bewerkbaar — gebruiker-eigen veld.
  const isAutoSynced = holding.externalSource !== null
  const tickerDisplay = holding.ticker?.toUpperCase() ?? ''
  const displayName = holding.name?.trim() || tickerDisplay
  const currency = (holding.currency ?? 'EUR').toUpperCase()

  // Bron-label voor de auto-sync banner.
  const autoSyncSourceLabel = useMemo(() => {
    if (!holding.externalSource) return 'koppeling'
    return capitalize(holding.externalSource)
  }, [holding.externalSource])

  // Numeriek-only canSave: trigger op werkelijke wijziging. Bij auto-sync
  // mogen units niet veranderen (server 409); avg-price en notes wel. De
  // notes-vergelijking gebruikt de server-fresh baseline (`serverNotes`),
  // niet de prop-waarde — anders staat "Opslaan" altijd enabled na een
  // detail-fetch die de prop bijwerkt zonder dat de gebruiker iets typte.
  const canSave = useMemo(() => {
    if (saving) return false
    const notesChanged = notesInput.trim() !== serverNotes.trim()
    const avgParsed = parseNumericInput(avgPriceInput)
    const avgChanged = (() => {
      if (avgParsed == null && initialAvgPrice === 0) return false
      if (avgParsed == null) return false
      return Math.abs(avgParsed - initialAvgPrice) > 1e-6
    })()
    if (isAutoSynced) return notesChanged || avgChanged
    const unitsParsed = parseNumericInput(unitsInput)
    const unitsChanged =
      unitsParsed != null && Math.abs(unitsParsed - initialUnits) > 1e-9
    return notesChanged || unitsChanged || avgChanged
  }, [
    saving,
    unitsInput,
    avgPriceInput,
    notesInput,
    initialUnits,
    initialAvgPrice,
    serverNotes,
    isAutoSynced,
  ])

  // Save-handler. Body-bouw: notes altijd; avg-price altijd; units alleen
  // als de holding niet auto-synced is. Server geeft 409 bij sync-conflict
  // — we tonen dat dan inline plus toast.
  const handleSave = useCallback(async () => {
    setValidationError(null)

    const body: Record<string, unknown> = {
      notes: notesInput,
    }
    const avgParsed = parseNumericInput(avgPriceInput)
    if (avgParsed != null && avgParsed < 0) {
      setValidationError('Gemiddelde inkoopprijs mag niet negatief zijn.')
      return
    }
    if (avgParsed != null) {
      body.avg_purchase_price = avgParsed
    }
    if (!isAutoSynced) {
      const unitsParsed = parseNumericInput(unitsInput)
      if (unitsParsed == null || unitsParsed < 0) {
        setValidationError('Aantal eenheden moet een positief getal zijn.')
        return
      }
      body.units = unitsParsed
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/holdings/${holding.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data?.error === 'auto_synced') {
        const msg =
          data.message ||
          'Aantal kan niet worden gewijzigd: deze holding is auto-synced.'
        setValidationError(msg)
        addToast({
          type: 'warning',
          title: 'Bewerking geblokkeerd',
          message: msg,
        })
        return
      }
      if (!res.ok) {
        const msg = data.error || `HTTP ${res.status}`
        setValidationError(`Opslaan mislukt: ${msg}`)
        addToast({ type: 'error', title: 'Opslaan mislukt', message: msg })
        return
      }
      addToast({
        type: 'success',
        title: `${tickerDisplay || displayName} bijgewerkt`,
        message: 'Wijzigingen zijn opgeslagen.',
      })
      onSaved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout'
      setValidationError(`Opslaan mislukt: ${msg}`)
      addToast({ type: 'error', title: 'Opslaan mislukt', message: msg })
    } finally {
      setSaving(false)
    }
  }, [
    holding.id,
    isAutoSynced,
    unitsInput,
    avgPriceInput,
    notesInput,
    addToast,
    onSaved,
    tickerDisplay,
    displayName,
  ])

  // Publiceer save-state naar pane-wrapper. Een ref voor de save-handler
  // voorkomt stale closures: de wrapper roept altijd de meest recente
  // handler aan zonder dat we de callback-identity hoeven te invalideren
  // bij elke state-mutatie.
  const saveHandlerRef = useRef<() => void>(() => {})
  useEffect(() => {
    saveHandlerRef.current = () => {
      void handleSave()
    }
  })
  useEffect(() => {
    onActionsChange({
      canSave,
      saving,
      isEditing: true,
      save: () => saveHandlerRef.current(),
    })
  }, [onActionsChange, canSave, saving])

  // Read-only context-velden (mini-hero) tonen we ook in edit-mode zodat
  // de gebruiker context behoudt tijdens het wijzigen. Compacter dan in
  // view-mode — alleen mini-hero; geen figures-strip, geen transacties.
  const value =
    holding.currentPrice != null ? holding.units * holding.currentPrice : 0
  const costBasis = holding.avgPurchasePrice > 0
    ? holding.units * holding.avgPurchasePrice
    : null
  const returnPct =
    costBasis != null && costBasis !== 0
      ? ((value - costBasis) / costBasis) * 100
      : null
  const valueTone =
    returnPct == null ? 'neutral' : returnPct >= 0 ? 'positive' : 'negative'
  const valueToneClass =
    valueTone === 'positive'
      ? 'text-positive'
      : valueTone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink)]'

  return (
    <div className="space-y-7">
      {/* Mini-hero (read-only context, identiek aan view-mode) */}
      <section>
        <div
          className={`font-mono text-[28px] leading-none tabular-nums sm:text-[36px] font-bold ${valueToneClass}`}
        >
          <span
            className="inline px-1"
            style={{
              backgroundImage:
                'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
            }}
          >
            {formatCurrencyOf(value, currency)}
          </span>
        </div>
        <p
          className="mt-2 text-sm italic leading-relaxed text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, serif)' }}
        >
          {tickerDisplay || displayName} · huidige marktwaarde
        </p>
      </section>

      {/* Auto-sync banner — alleen tonen voor broker-imports. Editorial
          neutral-grond + kern-accent (zelfde palet als crypto-pane). */}
      {isAutoSynced && (
        <section
          className="flex items-start gap-2 border border-kern-200 bg-kern-50 px-3 py-2"
          style={{ borderRadius: 'var(--r)' }}
        >
          <Briefcase
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kern-600"
            aria-hidden="true"
          />
          <p
            className="text-[12px] leading-snug text-kern-800"
            style={{ fontFamily: 'var(--font-source-serif, serif)' }}
          >
            Deze positie wordt automatisch gesynchroniseerd vanuit{' '}
            <strong className="not-italic">{autoSyncSourceLabel}</strong>.
            Aantal en valuta kunnen niet handmatig worden gewijzigd.
          </p>
        </section>
      )}

      {/* Form-velden */}
      <section className="space-y-4">
        {/* Veld 1 — Units */}
        <FormFieldNumeric
          id="investment-edit-units"
          label="Aantal eenheden"
          value={unitsInput}
          onChange={setUnitsInput}
          readOnly={isAutoSynced}
          step="any"
          min={0}
          help={
            isAutoSynced
              ? `Synced vanuit ${autoSyncSourceLabel}`
              : 'Hoeveelheid van deze positie in je portefeuille.'
          }
        />

        {/* Veld 2 — Gem. inkoopprijs (altijd bewerkbaar — broker geeft niet
            altijd een gewogen-gemiddelde terug, dus dit blijft een
            gebruiker-eigen veld). */}
        <FormFieldNumeric
          id="investment-edit-avg-price"
          label={`Gem. inkoopprijs (${currency})`}
          value={avgPriceInput}
          onChange={setAvgPriceInput}
          step="0.01"
          min={0}
          help="Gewogen gemiddelde aankoopprijs over al je transacties."
        />

        {/* Veld 3 — Notities (altijd bewerkbaar, ook bij auto-sync) */}
        <div>
          <label
            htmlFor="investment-edit-notes"
            className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
          >
            Notities
          </label>
          <textarea
            id="investment-edit-notes"
            value={notesInput}
            onChange={(e) => {
              setNotesInput(e.target.value)
              setNotesDirty(true)
            }}
            rows={3}
            placeholder="Persoonlijke notities bij deze positie…"
            className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--ink)] focus:outline-none"
            style={{ fontFamily: 'var(--font-source-serif, serif)' }}
          />
        </div>
      </section>

      {/* Validatie-fout / sync-conflict — inline rood banner. */}
      {validationError && (
        <div className="flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          <AlertCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="leading-snug">{validationError}</span>
        </div>
      )}
    </div>
  )
}

// ── Edit-mode form-helpers ─────────────────────────────────────────────

interface FormFieldNumericProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  disabled?: boolean
  step?: string
  min?: number
  help?: string
}

function FormFieldNumeric({
  id,
  label,
  value,
  onChange,
  readOnly = false,
  disabled = false,
  step = 'any',
  min,
  help,
}: FormFieldNumericProps) {
  // Read-only stijl: grijze achtergrond, ink-3 tekst, cursor-not-allowed.
  // Mirror van `crypto-holding-pane.tsx::FormFieldNumeric`.
  const lockedStyle = readOnly || disabled
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={disabled}
        step={step}
        min={min}
        inputMode="decimal"
        className={
          lockedStyle
            ? 'w-full cursor-not-allowed border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink-3)]'
            : 'w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none'
        }
      />
      {help && (
        <p
          className="mt-1 text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, serif)' }}
        >
          {help}
        </p>
      )}
    </div>
  )
}

/** Parse een input-string naar een number; lege string → null. */
function parseNumericInput(s: string): number | null {
  const trimmed = s.trim()
  if (trimmed.length === 0) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return n
}

/** Render units in een vorm die de gebruiker kan bewerken (geen trailing
 *  zeros, maar wel volle precisie). */
function formatUnitsInput(units: number): string {
  if (!Number.isFinite(units)) return ''
  // Volle precisie tot 8 decimalen; trailing zeros eraf zodat het veld
  // er niet uit ziet als "1.00000000".
  const fixed = units.toFixed(8)
  return fixed.replace(/\.?0+$/, '')
}

/** Render avg-price in numeriek-input-stijl (max 4 decimalen). */
function avgPriceToInput(avg: number): string {
  if (!Number.isFinite(avg)) return ''
  const fixed = avg.toFixed(4)
  return fixed.replace(/\.?0+$/, '')
}

// ── Figure cel — interne component (mirror van editorial FiguresStripCell) ──

interface FigureCellProps {
  label: string
  value: string
  sub?: string
  tone?: 'neutral' | 'positive' | 'negative'
  /**
   * Wanneer true: cel zit op de bovenste rij in de mobile 2-koloms-layout
   * en krijgt een onder-border zodat rij 1 en rij 2 visueel gescheiden
   * worden. De pane gebruikt 4 cellen → cellen 1+2 op rij 1, cellen 3+4
   * op rij 2 (mobile).
   */
  rowOneOnMobile?: boolean
}

function FigureCell({
  label,
  value,
  sub,
  tone = 'neutral',
  rowOneOnMobile = false,
}: FigureCellProps) {
  const toneStyle =
    tone === 'positive'
      ? { color: 'var(--positive)' }
      : tone === 'negative'
        ? { color: 'var(--negative)' }
        : { color: 'var(--ink)' }

  const baseClass =
    'p-3 sm:p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-center'
  const mobileBorderClass = rowOneOnMobile
    ? 'border-b border-[var(--rule-soft)] sm:border-b-0'
    : ''

  return (
    <div className={`${baseClass} ${mobileBorderClass}`}>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        {label}
      </div>
      <div
        className="font-serif text-[22px] font-black leading-none tracking-[-0.02em] tabular-nums sm:text-[28px]"
        style={toneStyle}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-1.5 text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, serif)' }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
