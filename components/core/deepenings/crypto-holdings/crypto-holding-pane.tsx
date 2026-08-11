'use client'

/**
 * CryptoHoldingPane — view↔edit detail-pane voor één crypto-coin op
 * `/core/assets/crypto?tab=crypto-holdings`. Volgt de patroon-kaart
 * "Entity detail-pane met mode-switch" uit `.claude/commands/ui-ux.md`.
 * Canonical referentie: `components/app/core/assets/asset-pane.tsx`.
 *
 * Twee modi:
 *   - **view** — read-only context: mini-hero (waarde + tone-marker), 7-dgs
 *     sparkline, figures-strip (4 cellen), bron-rij met sync-info, 90-dgs
 *     prijs-chart en transacties-tabel. Footer: Bewerken / Sluiten.
 *   - **edit** — form: units, gem. inkoopprijs en notes. Bij auto-sync staan
 *     de twee numerieke velden read-only met een uitleg-banner; notes blijft
 *     altijd bewerkbaar (gebruiker-eigen veld). Footer: Opslaan / Annuleren.
 *
 * Data-flow:
 *   - Holding-row komt van de parent (`crypto-holdings-page.tsx`) via prop —
 *     geen extra fetch.
 *   - Detail-data (transactions + price history) wordt on-demand opgehaald
 *     via `GET /api/crypto/holdings/[id]/detail` zodra een holding wordt
 *     geselecteerd. Sequentiële fetches per holding-wissel; geen waterfall
 *     op de holdings-tab zelf.
 *
 * Render-mechanisme: `<ShellOverlay kind="pane">` regelt automatisch
 *   - desktop (≥lg) → `SlideInPane` rechts (560px / xl 680px breed)
 *   - mobile (<lg)  → `BottomSheet` size="full" als fallback
 * Beide krijgen identieke pane-header (← + ✕), header-actions slot en
 * sticky footer-bar. Driewegregel: delete-confirm en pane zijn siblings,
 * geen nesting.
 *
 * URL-state: deze component is **stateless** voor pane-open/close — de
 * parent (`crypto-holdings-page.tsx`) leest `?crypto=<id>` uit
 * `useSearchParams()` en geeft de holding (of `null`) als prop door.
 * `onClose` ruimt de query-param op via `router.replace()`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Briefcase,
  Plug,
  TrendingDown,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react'
import {
  ShellOverlay,
  type PaneAction,
} from '@/components/app/shell/shell-overlay'
import { useToast } from '@/components/app/toast-provider'
import { formatCurrency } from '@/lib/format'
import { formatAmsterdamShortDate } from '@/lib/tz'
import type {
  CryptoHoldingPricePoint,
  CryptoHoldingRow,
  CryptoSparklinePoint,
} from '@/lib/crypto-holdings-data'
import { CryptoSparkline } from '@/components/holdings/crypto-sparkline'
import { CryptoHoldingPriceChart } from './crypto-holding-price-chart'
import { labelForSource } from './crypto-source-breakdown'

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Render units met genoeg precisie om kleine fracties leesbaar te houden.
 * Symmetrisch met `crypto-holding-card.tsx::formatUnits` zodat dezelfde
 * coin overal hetzelfde aantal decimalen toont. Trailing zeros gestript.
 */
function formatUnits(units: number): string {
  if (!isFinite(units)) return '0'
  const decimals = Math.abs(units) >= 1 ? 4 : 6
  return units.toFixed(decimals).replace(/\.?0+$/, '')
}

/**
 * Krant-stijl korte datum, identiek aan de full-page detail.
 *
 * De notatie zelf staat in `lib/tz.ts` en rekent in Amsterdamse tijd — niet in
 * de tijdzone van de runtime (#418-klasse; dit was een letterlijke kopie van de
 * variant in components/core/holdings/investment-holding-pane.tsx).
 */
function formatNewspaperDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return formatAmsterdamShortDate(date)
}

/** Capitalize first letter — gebruikt voor wallet-chain-labels. */
function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Types ──────────────────────────────────────────────────────────────

type CryptoHoldingPaneMode = 'view' | 'edit'

/**
 * Save-state shape die de edit-form publiceert naar de pane-wrapper. Mirror
 * van `AssetEditActionsState` zodat de pane-footer de save-CTA kan tonen
 * zonder de form-state zelf te kennen.
 */
interface CryptoEditActionsState {
  canSave: boolean
  saving: boolean
  isEditing: boolean
  /** Roept de meest recente save-handler aan (via ref). */
  save: () => void
}

/**
 * Eén transactie-rij zoals geleverd door `GET /api/crypto/holdings/[id]/detail`.
 * Server-side al genormaliseerd naar `number | null` voor numerieke velden.
 */
interface CryptoTransactionDetailRow {
  id: string
  type: string
  units: number
  price_per_unit: number | null
  total_amount: number | null
  fee_native: number | null
  fee_currency: string | null
  date: string
  notes: string | null
  external_source: string | null
}

interface CryptoHoldingDetailPayload {
  /**
   * Server-fresh holding-row inclusief `notes`. De pane-prop kan stale zijn
   * (page-server-render moment), maar de detail-fetch is on-demand bij
   * pane-open en levert daarmee de meest actuele DB-staat. Edit-mode
   * gebruikt deze waarde als baseline voor de notes-textarea zodat een
   * gewijzigde notitie elders (andere tab, externe PATCH) correct
   * pre-filled wordt.
   */
  holding: CryptoHoldingRow
  transactions: CryptoTransactionDetailRow[]
  priceHistory: CryptoHoldingPricePoint[]
}

// ── Props ──────────────────────────────────────────────────────────────

export interface CryptoHoldingPaneProps {
  /** Wanneer null is de pane gesloten. Symmetrisch met `AssetPane`. */
  holding: CryptoHoldingRow | null
  /** Sluit-callback — parent ruimt URL-state op. */
  onClose: () => void
  /**
   * Aangeroepen na succesvolle save / delete. Parent kan dan
   * `router.refresh()` triggeren zodat de holdings-list zich herlaadt.
   */
  onChanged?: () => void
  /**
   * 7-daagse close-prijs reeks voor de mini-sparkline. Optioneel — bij
   * `undefined`/lege array rendert `<CryptoSparkline>` zelf een neutrale
   * gestippelde streep (geen layout-shift).
   */
  sparkline?: CryptoSparklinePoint[]
}

// ── Component ──────────────────────────────────────────────────────────

export function CryptoHoldingPane({
  holding,
  onClose,
  onChanged,
  sparkline,
}: CryptoHoldingPaneProps) {
  const { addToast } = useToast()

  const [mode, setMode] = useState<CryptoHoldingPaneMode>('view')
  const [editActions, setEditActions] = useState<CryptoEditActionsState | null>(
    null,
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTypeInput, setDeleteTypeInput] = useState('')

  // Detail-data (tx + price history). On-demand fetch bij holding-wissel.
  const [detail, setDetail] = useState<CryptoHoldingDetailPayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailReloadKey, setDetailReloadKey] = useState(0)

  const open = holding !== null
  const symbolDisplay = holding?.symbol.toUpperCase() ?? ''
  const displayName = holding?.name?.trim() || symbolDisplay
  // Pane-titel volgt het patroon van AssetPane: korte identifier links,
  // dan de bestand-naam ernaast. Bij gelijke waarden tonen we alleen de
  // symbol-string zodat we niet "BTC · BTC" laten zien.
  const baseTitle = holding
    ? holding.name && holding.name.trim().length > 0 && displayName !== symbolDisplay
      ? `${symbolDisplay} · ${displayName}`
      : symbolDisplay
    : ''
  const title = mode === 'edit' && holding ? `${baseTitle} — bewerken` : baseTitle

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
    fetch(`/api/crypto/holdings/${holding.id}/detail`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((data: CryptoHoldingDetailPayload) => {
        if (cancelled) return
        setDetail({
          holding: data.holding,
          transactions: data.transactions ?? [],
          priceHistory: data.priceHistory ?? [],
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

  const handleEditActionsChange = useCallback((next: CryptoEditActionsState) => {
    setEditActions(next)
  }, [])

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
        title: `${symbolDisplay} verwijderd`,
        message:
          'Bestaande transacties blijven in de geschiedenis bewaard. Je kunt de coin later opnieuw toevoegen.',
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
  }, [holding, symbolDisplay, addToast, onClose, onChanged])

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
  // achter een mode-switch.
  const headerActions =
    mode === 'view' ? (
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-negative hover:bg-negative/10"
        aria-label="Coin verwijderen"
        title="Verwijderen"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    ) : null

  // Type-to-confirm: gebruiker moet exact het symbol typen (case-insensitive
  // match — zodat 'btc' en 'BTC' beide werken) voordat de delete-knop
  // enabled wordt. Voorkomt accidental click op een gevoelige actie.
  const deleteCanConfirm =
    deleteTypeInput.trim().toUpperCase() === symbolDisplay

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
          <CryptoHoldingPaneView
            holding={holding}
            sparkline={sparkline}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onRetry={handleRetryDetail}
          />
        )}
        {mode === 'edit' && (
          <CryptoHoldingPaneEdit
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
        title="Coin verwijderen?"
        destructive
      >
        <div className="space-y-4 p-5">
          <p
            className="font-serif text-base leading-relaxed text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-source-serif, serif)' }}
          >
            <strong className="text-[var(--ink)]">{symbolDisplay}</strong>{' '}
            wordt uit je actieve crypto-holdings verwijderd. Bestaande
            transactiehistorie blijft bewaard. Je kunt deze later weer
            toevoegen via een koppeling of handmatig.
          </p>
          <div>
            <label
              htmlFor="crypto-delete-confirm-input"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
            >
              Typ {symbolDisplay} om te bevestigen
            </label>
            <input
              id="crypto-delete-confirm-input"
              type="text"
              value={deleteTypeInput}
              onChange={(e) => setDeleteTypeInput(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              className="w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tracking-[0.1em] text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
              placeholder={symbolDisplay}
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
              className="border border-negative bg-negative px-4 py-3 text-sm font-semibold text-[var(--paper)] hover:bg-negative/90 disabled:cursor-not-allowed disabled:opacity-50"
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

interface CryptoHoldingPaneViewProps {
  holding: CryptoHoldingRow
  sparkline?: CryptoSparklinePoint[]
  detail: CryptoHoldingDetailPayload | null
  loading: boolean
  error: string | null
  onRetry: () => void
}

function CryptoHoldingPaneView({
  holding,
  sparkline,
  detail,
  loading,
  error,
  onRetry,
}: CryptoHoldingPaneViewProps) {
  const valueEur = holding.valueEur
  const returnPct = holding.returnPct
  const returnEur = holding.returnEur
  const avgPrice = holding.avgPurchasePrice
  const units = holding.units
  const sourceLabel = labelForSource(holding)
  const sourceKind = holding.source.kind
  const isFiat = holding.isFiatBalance

  // Tone op basis van rendement t.o.v. kostenbasis. NULL → neutraal.
  const valueTone =
    returnPct == null
      ? 'neutral'
      : returnPct >= 0
        ? 'positive'
        : 'negative'
  const valueToneClass =
    valueTone === 'positive'
      ? 'text-positive'
      : valueTone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink)]'

  const lastSyncFormatted = formatNewspaperDate(holding.lastSyncedAt)
  const lastPriceFormatted = formatNewspaperDate(holding.lastPriceUpdate)
  const symbolDisplay = holding.symbol.toUpperCase()

  return (
    <div className="space-y-7">
      {/* 1. Mini-hero — uitkomst-anker van de pane.
          Hoofdbedrag is de marktwaarde; tone volgt rendement. Highlight-
          marker (`linear-gradient`) markeert dit als het primaire scan-
          doel. Sub-meta in italic Source Serif geeft units × gem.
          inkoopprijs als context. */}
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
            {formatCurrency(valueEur)}
          </span>
          {!isFiat && returnPct != null && (
            <span
              className="ml-3 inline-flex items-center gap-1 align-middle text-base font-medium tracking-normal"
              aria-label={
                returnPct >= 0
                  ? `Rendement plus ${returnPct.toFixed(1)} procent`
                  : `Rendement min ${Math.abs(returnPct).toFixed(1)} procent`
              }
            >
              {returnPct >= 0 ? (
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="font-mono tabular-nums">
                {returnPct >= 0 ? '+' : ''}
                {returnPct.toFixed(1)}%
              </span>
            </span>
          )}
        </div>
        <p
          className="mt-2 text-sm italic leading-relaxed text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, serif)' }}
        >
          {isFiat
            ? `Cash bij ${sourceLabel}`
            : avgPrice != null
              ? `${formatUnits(units)} ${symbolDisplay} · gem. inkoop ${formatCurrency(avgPrice)}`
              : `${formatUnits(units)} ${symbolDisplay}`}
        </p>
      </section>

      {/* 2. Sparkline — 7-daagse koerstrend. Cash-saldi krijgen geen
          sparkline (geen koers). */}
      {!isFiat && (
        <section>
          <div className="flex h-20 w-full items-center">
            <CryptoSparkline
              data={sparkline ?? []}
              width={520}
              height={80}
              className="w-full"
            />
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            Laatste 7 dagen
          </div>
        </section>
      )}

      {/* 3. Mini-figures-strip — 4 cellen met figures-strip styling.
          Playfair black bedragen, top+bottom ink-borders, verticale
          rule-soft dividers, mobile 2-rij grid met onderborder op
          cellen 1-2. */}
      <section className="grid grid-cols-2 border-t border-b border-[var(--rule-soft)] sm:grid-cols-4">
        <FigureCell
          label="MARKTWAARDE"
          value={formatCurrency(valueEur)}
          rowOneOnMobile
        />
        <FigureCell
          label="EENHEDEN"
          value={isFiat ? '—' : formatUnits(units)}
          sub={isFiat ? undefined : symbolDisplay}
          rowOneOnMobile
        />
        <FigureCell
          label="GEM. INKOOP"
          value={isFiat || avgPrice == null ? '—' : formatCurrency(avgPrice)}
          sub={
            isFiat
              ? 'cash-saldo'
              : avgPrice == null
                ? 'kostenbasis onbekend'
                : undefined
          }
        />
        <FigureCell
          label="RENDEMENT"
          value={
            isFiat || returnPct == null
              ? '—'
              : `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%`
          }
          sub={
            !isFiat && returnEur != null
              ? `${returnEur >= 0 ? '+' : ''}${formatCurrency(returnEur)}`
              : undefined
          }
          tone={isFiat ? 'neutral' : valueTone}
        />
      </section>

      {/* 4. Bron-rij — uitgebreid met sync-info. Plug voor exchange,
          Wallet voor cold wallet, geen icon voor manual. */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {sourceKind === 'exchange' ? (
            <Plug className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : sourceKind === 'wallet' ? (
            <Wallet className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : null}
          <span>Via {sourceLabel}</span>
        </div>
        {(lastSyncFormatted || lastPriceFormatted) && (
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
            {lastSyncFormatted && (
              <span>Laatste sync: {lastSyncFormatted}</span>
            )}
            {lastSyncFormatted && lastPriceFormatted && <span> · </span>}
            {lastPriceFormatted && (
              <span>Prijs bijgewerkt {lastPriceFormatted}</span>
            )}
          </p>
        )}
        {holding.lastSyncError && (
          <div className="flex items-start gap-2 border border-negative/30 bg-negative/10 px-3 py-2 text-[12px] text-negative">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="leading-snug">
              Laatste sync gaf een fout: {holding.lastSyncError}
            </span>
          </div>
        )}
      </section>

      {/* 5. Prijs-chart — 90-daags. Cash-saldi krijgen geen chart.
          Loading: skeleton; Error: banner met retry. */}
      {!isFiat && (
        <section>
          {loading && !detail ? (
            <PriceChartSkeleton />
          ) : error && !detail ? (
            <DetailErrorBanner message={error} onRetry={onRetry} />
          ) : detail && detail.priceHistory.length > 0 ? (
            <CryptoHoldingPriceChart
              points={detail.priceHistory}
              avgPurchasePrice={avgPrice ?? null}
              symbol={symbolDisplay}
              daysBack={90}
            />
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Koers-historie bouwt nog op voor deze coin.
            </p>
          )}
        </section>
      )}

      {/* 6. Transacties-tabel — compacte 5-koloms (Datum / Type /
          Eenheden / Prijs / Totaal). Loading skeleton tijdens fetch,
          empty state als er geen transacties zijn. */}
      <section>
        <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Transactiegeschiedenis
        </h3>
        {loading && !detail ? (
          <TransactionsSkeleton />
        ) : error && !detail ? null : detail && detail.transactions.length > 0 ? (
          <CryptoPaneTransactionsTable transactions={detail.transactions} />
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

interface CryptoPaneTransactionsTableProps {
  transactions: CryptoTransactionDetailRow[]
}

function CryptoPaneTransactionsTable({
  transactions,
}: CryptoPaneTransactionsTableProps) {
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
                  {px != null ? formatCurrency(px) : '—'}
                </td>
                <td className="py-2 text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">
                  {total != null ? formatCurrency(total) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PriceChartSkeleton() {
  // Grijs blok in `--paper` met scherpe hoeken — past bij krant-stijl,
  // geen rounded corners. Hoogte matcht de echte chart (~160px) zodat
  // er geen layout-shift is wanneer de data binnen valt.
  return (
    <div
      aria-hidden="true"
      className="h-[180px] w-full border border-[var(--border-ed)] bg-[var(--subtle)]/60"
    />
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
    <div className="flex items-start gap-2 border border-negative/30 bg-negative/10 px-3 py-2 text-[12px] text-negative">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-snug">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="border border-negative/40 bg-white px-2 py-0.5 text-[11px] font-medium text-negative hover:bg-negative/15"
      >
        Opnieuw proberen
      </button>
    </div>
  )
}

// ── Edit-mode body ─────────────────────────────────────────────────────

interface CryptoHoldingPaneEditProps {
  holding: CryptoHoldingRow
  /**
   * On-demand opgehaalde detail-bundle. `null` zolang de fetch loopt of
   * faalt. De `notes`-baseline komt hieruit: `detail.holding.notes` is de
   * server-fresh waarde, `holding.notes` (prop) is de page-load-waarde —
   * meestal gelijk maar kan stale zijn na een externe PATCH.
   */
  detail: CryptoHoldingDetailPayload | null
  onSaved: () => void
  onActionsChange: (state: CryptoEditActionsState) => void
}

function CryptoHoldingPaneEdit({
  holding,
  detail,
  onSaved,
  onActionsChange,
}: CryptoHoldingPaneEditProps) {
  const { addToast } = useToast()

  // Initial state spiegelt de holding-prop. We bewaren een lokaal "initial"
  // snapshot zodat de canSave-check werkt op werkelijke wijzigingen — niet
  // op rerenders van dezelfde prop-waarden.
  const initialUnits = holding.units
  const initialAvgPrice = holding.avgPurchasePrice ?? 0
  // Notes-baseline: server-fresh als de detail-fetch klaar is, anders de
  // prop-waarde uit de loader (`CryptoHoldingRow.notes`). Empty-string als
  // beide null zijn. We berekenen dit dynamisch zodat een laat-arriverende
  // detail-fetch (bv. user opent direct edit-mode) de pre-fill alsnog
  // bijwerkt via het useEffect-resync hieronder.
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
  // al open was. Voorbeeld: gebruiker klikt direct op Bewerken, fetch
  // resolved 200ms later. Zonder deze sync zou de textarea leeg blijven.
  // We respecteren `notesDirty` zodat een actieve typing-sessie niet
  // wordt gewist.
  useEffect(() => {
    if (notesDirty) return
    setNotesInput(detail?.holding.notes ?? holding.notes ?? '')
    // We willen alleen op detail-arrival (en holding-id-wisseling) syncen,
    // niet bij elke holding-prop-rerender met dezelfde id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.holding.notes, holding.id])

  const isAutoSynced = holding.source.kind !== 'manual'
  // Transactie-afgeleid: zodra er transacties zijn, worden units + gemiddelde
  // inkoopprijs server-side herberekend uit de historie (canonieke engine) na
  // elke mutatie, dus ze zijn read-only. Handmatig overschrijven zou het
  // opgeslagen veld direct weer laten afwijken van de transactiehistorie —
  // precies de inconsistente-kostenbasis-bug (spiegelt de investment-pane).
  const hasTx = (detail?.transactions?.length ?? 0) > 0
  const unitsReadOnly = isAutoSynced || hasTx
  const avgPriceReadOnly = isAutoSynced || hasTx
  const symbolDisplay = holding.symbol.toUpperCase()

  // Bron-label voor de auto-sync banner. Wallet-label = "Ethereum · 0x12…78".
  const autoSyncSourceLabel = useMemo(() => {
    if (holding.source.kind === 'exchange') {
      return holding.source.exchangeLabel
    }
    if (holding.source.kind === 'wallet') {
      const chainLabel = capitalize(holding.source.walletChain)
      return `${chainLabel} · ${holding.source.walletAddressMask}`
    }
    return 'koppeling'
  }, [holding.source])

  // Numeriek-only canSave: trigger op werkelijke wijziging. Bij auto-sync
  // mogen units/avg niet veranderen; alleen notes telt dan mee. De notes-
  // vergelijking gebruikt de server-fresh baseline (`serverNotes`), niet
  // de empty-string default — anders staat "Opslaan" altijd enabled na de
  // detail-fetch zelfs zonder wijziging.
  const canSave = useMemo(() => {
    if (saving) return false
    const notesChanged = notesInput.trim() !== serverNotes.trim()
    const unitsParsed = parseNumericInput(unitsInput)
    const avgParsed = parseNumericInput(avgPriceInput)
    const unitsChanged =
      !unitsReadOnly &&
      unitsParsed != null &&
      Math.abs(unitsParsed - initialUnits) > 1e-9
    const avgChanged = !avgPriceReadOnly && (() => {
      if (avgParsed == null && initialAvgPrice === 0) return false
      if (avgParsed == null) return false
      return Math.abs(avgParsed - initialAvgPrice) > 1e-6
    })()
    return notesChanged || unitsChanged || avgChanged
  }, [
    saving,
    unitsInput,
    avgPriceInput,
    notesInput,
    initialUnits,
    initialAvgPrice,
    serverNotes,
    unitsReadOnly,
    avgPriceReadOnly,
  ])

  // Save-handler. Body bouw: notes altijd; units/avg alleen als de holding
  // niet auto-synced is. Server geeft 409 bij sync-conflict — we tonen dat
  // dan inline plus toast.
  const handleSave = useCallback(async () => {
    setValidationError(null)

    const body: Record<string, unknown> = {
      notes: notesInput,
    }
    // Positie-velden alleen meesturen als ze bewerkbaar zijn: bij transacties
    // (of auto-sync) zijn ze read-only en worden ze server-side afgeleid.
    if (!unitsReadOnly) {
      const unitsParsed = parseNumericInput(unitsInput)
      if (unitsParsed == null || unitsParsed < 0) {
        setValidationError('Aantal eenheden moet een positief getal zijn.')
        return
      }
      body.units = unitsParsed
    }
    if (!avgPriceReadOnly) {
      const avgParsed = parseNumericInput(avgPriceInput)
      if (avgParsed != null && avgParsed < 0) {
        setValidationError(
          'Gemiddelde inkoopprijs mag niet negatief zijn.',
        )
        return
      }
      // Avg-price is optioneel: gebruiker kan het veld leeg laten om "geen
      // kostenbasis" te signaleren. We sturen alleen door als er een
      // waarde getypt is.
      if (avgParsed != null) {
        body.avg_purchase_price = avgParsed
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/holdings/${holding.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (
        res.status === 409 &&
        (data?.error === 'auto_synced' || data?.error === 'has_transactions')
      ) {
        const msg =
          data.message ||
          'Aantal en gemiddelde inkoopprijs kunnen niet handmatig worden gewijzigd.'
        setValidationError(msg)
        addToast({ type: 'warning', title: 'Bewerking geblokkeerd', message: msg })
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
        title: `${symbolDisplay} bijgewerkt`,
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
    unitsReadOnly,
    avgPriceReadOnly,
    unitsInput,
    avgPriceInput,
    notesInput,
    addToast,
    onSaved,
    symbolDisplay,
  ])

  // Publiceer save-state naar pane-wrapper (zelfde patroon als
  // AssetForm). Een ref voor de save-handler voorkomt stale closures: de
  // wrapper roept altijd de meest recente handler aan zonder dat we de
  // callback-identity hoeven te invalideren bij elke state-mutatie.
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

  // Read-only context-velden (mini-hero + figures-strip) tonen we ook in
  // edit-mode zodat de gebruiker context behoudt tijdens het wijzigen.
  // Compacter dan in view-mode — alleen mini-hero + figures-strip; geen
  // sparkline, geen prijs-chart, geen transacties (die horen bij de view-
  // mode-context, niet bij een edit-actie).
  const valueEur = holding.valueEur
  const returnPct = holding.returnPct
  const isFiat = holding.isFiatBalance
  const valueTone =
    returnPct == null
      ? 'neutral'
      : returnPct >= 0
        ? 'positive'
        : 'negative'
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
            {formatCurrency(valueEur)}
          </span>
        </div>
        <p
          className="mt-2 text-sm italic leading-relaxed text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, serif)' }}
        >
          {symbolDisplay} · huidige marktwaarde
        </p>
      </section>

      {/* Auto-sync banner — exchange/wallet-sourced holdings. Editorial
          neutral-grond + kern-accent. */}
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
            Deze coin wordt automatisch gesynchroniseerd vanuit{' '}
            <strong className="not-italic">{autoSyncSourceLabel}</strong>.
            Aantal en gemiddelde inkoopprijs kunnen niet handmatig worden
            gewijzigd.
          </p>
        </section>
      )}

      {/* Transactie-afgeleid banner — toont waarom positie-velden read-only
          zijn wanneer er transacties bestaan (en het geen auto-sync is). */}
      {hasTx && !isAutoSynced && (
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
            Aantal en gemiddelde inkoopprijs worden{' '}
            <strong className="not-italic">afgeleid uit je transacties</strong>{' '}
            en zijn niet los bewerkbaar. Voeg een transactie toe om de positie te
            wijzigen.
          </p>
        </section>
      )}

      {/* Form-velden */}
      <section className="space-y-4">
        {/* Veld 1 — Units */}
        <FormFieldNumeric
          id="crypto-edit-units"
          label="Aantal eenheden"
          value={unitsInput}
          onChange={setUnitsInput}
          readOnly={unitsReadOnly}
          step="any"
          min={0}
          help={
            hasTx
              ? 'Afgeleid uit je transactiehistorie.'
              : isAutoSynced
                ? `Synced vanuit ${autoSyncSourceLabel}`
                : 'Hoeveelheid van deze coin in je portefeuille.'
          }
          disabled={isFiat}
        />

        {/* Veld 2 — Gem. inkoopprijs */}
        <FormFieldNumeric
          id="crypto-edit-avg-price"
          label="Gem. inkoopprijs (EUR)"
          value={avgPriceInput}
          onChange={setAvgPriceInput}
          readOnly={avgPriceReadOnly}
          step="0.01"
          min={0}
          help={
            hasTx
              ? 'Gewogen gemiddelde kostprijs, afgeleid uit je transactiehistorie.'
              : isAutoSynced
                ? 'Wordt automatisch berekend uit de gesynchroniseerde transacties.'
                : 'Gewogen gemiddelde aankoopprijs over al je transacties.'
          }
          disabled={isFiat}
        />

        {/* Veld 3 — Notities (altijd bewerkbaar, ook bij auto-sync) */}
        <div>
          <label
            htmlFor="crypto-edit-notes"
            className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
          >
            Notities
          </label>
          <textarea
            id="crypto-edit-notes"
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
        <div className="flex items-start gap-2 border border-negative/30 bg-negative/10 px-3 py-2 text-[12px] text-negative">
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
  // Read-only stijl (match `AssetForm` regel 2932): grijze achtergrond,
  // ink-3 tekst, cursor-not-allowed. Voor disabled (fiat-saldo) zelfde
  // visuele staat — gebruiker kan toch niet muteren.
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

/** Render avg-price in EUR-stijl voor een input-veld (max 4 decimalen). */
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
