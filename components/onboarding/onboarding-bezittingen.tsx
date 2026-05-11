'use client'

import { useMemo, useState } from 'react'
import { FileText, Minus, Plus, Trash2 } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { AangifteImportPane } from '@/components/onboarding/aangifte-import-pane'
import {
  ASSET_QUICK_ADD_LABELS,
  ASSET_TYPE_ICONS,
  type AssetType,
} from '@/lib/asset-data'
import {
  DEBT_QUICK_ADD_LABELS,
  DEBT_TYPE_ICONS,
  type DebtType,
} from '@/lib/debt-data'
import type {
  AssetQuickInput,
  DebtQuickInput,
  QuickAddInput,
  QuickAddIntent,
} from '@/lib/quick-add/types'
import { TypeIcon } from '@/components/app/quick-add-wizard/icon-map'
import { formatCurrency } from '@/lib/format'
import { useFlashChange } from '@/lib/hooks/use-flash-change'

/**
 * Stap 4 — Wat heb je al? (/core-style: 3 entry-knoppen + lijst).
 *
 * Vervangt het oude ja/nee-tile + inline-mini-form-patroon. De gebruiker
 * krijgt nu drie gelijkwaardige toevoeg-paden, identiek aan de bezittings-
 * en schulden-cards op `/core`:
 *
 *  1. **Bezitting toevoegen** — `QuickAddWizard` in `mode='collect'` met
 *     `initialIntent='asset'`. Wizard rendert als BottomSheet (eigen portal)
 *     en geeft het verzamelde item via `onCollect` terug. Geen DB-write.
 *  2. **Schuld toevoegen** — idem voor `initialIntent='debt'`.
 *  3. **Aangifte uploaden** — `AangifteImportPane` in
 *     `mode='onboarding-collect'`. Pane geeft `assets[]` + `debts[]` terug
 *     via `onCollect`-payload; we mergen die in de parent-state, profile-
 *     updates en life-events negeren we in deze run (kan later).
 *
 * Toegevoegde items verschijnen in twee secties onder de actie-strip:
 * Bezittingen + Schulden, met type-icoon, naam, bedrag en delete-knop.
 * Lege secties zijn verborgen om visuele ruis te vermijden.
 *
 * De ja/nee-keuze is verdwenen: het kost net zoveel klikken om te skippen
 * (één tekstlink onderaan), en de gebruiker hoeft niet eerst een vraag te
 * beantwoorden voordat hij iets kan toevoegen. Boldin-tactiek "vraag eerst,
 * detail later" is vervangen door /core-tactiek "actie eerst, vraag overslaan
 * via skip-link".
 *
 * **Wizard binnen onboarding**: de wizard wordt gerenderd als BottomSheet
 * (via `BottomSheet` → `createPortal` → document.body). Geen z-index issues
 * met de onboarding-shell. De wizard zelf detecteert via `useOptionalToast`
 * dat er geen ToastProvider is en skipt de toasts in collect-mode.
 *
 * **Backward-compat**: de deprecated props (`activeModules`,
 * `onActivateBudgetteren`, `subStep`) zijn verwijderd. De orchestrator-page
 * geeft ze sinds fase 3 niet meer door — als ze toch worden meegegeven door
 * een oudere caller, faalt de TypeScript-compile bewust.
 */

// ── Props ──────────────────────────────────────────────────────────────

export interface OnboardingBezittingenProps {
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  onAssetsChange: (items: AssetQuickInput[]) => void
  onDebtsChange: (items: DebtQuickInput[]) => void
  onNext: () => void
  onBack: () => void
  /** 1-indexed stap-nummer voor de voortgangsbalk (default 4). */
  currentStep?: number
  totalSteps?: number
}

// ── Component ──────────────────────────────────────────────────────────

export function OnboardingBezittingen({
  quickAssets,
  quickDebts,
  onAssetsChange,
  onDebtsChange,
  onNext,
  onBack,
  currentStep = 4,
  totalSteps = 5,
}: OnboardingBezittingenProps) {
  // Drie modale-states. Ze sluiten elkaar uit (je opent er maar één tegelijk
  // omdat de tiles disabled worden zodra er één open is — onnodig in praktijk,
  // de wizard/pane zelf dimt de achtergrond). We houden ze separaat zodat de
  // sluit-handlers atomair zijn en de wizard niet "per ongeluk" een aangifte-
  // pane sluit.
  const [wizardIntent, setWizardIntent] = useState<QuickAddIntent | null>(null)
  const [aangifteOpen, setAangifteOpen] = useState(false)

  const totalAssets = useMemo(
    () => quickAssets.reduce((s, a) => s + (Number(a.current_value) || 0), 0),
    [quickAssets],
  )
  const totalDebts = useMemo(
    () => quickDebts.reduce((s, d) => s + (Number(d.current_balance) || 0), 0),
    [quickDebts],
  )
  const netWorth = totalAssets - totalDebts
  const hasAnyItem = quickAssets.length + quickDebts.length > 0

  // Flash-class voor het cumulatief vermogen in het facts-paneel. Flasht
  // groen bij toename, rood bij afname. Speelt af zodra `netWorth` muteert.
  const { flashClass } = useFlashChange(hasAnyItem ? netWorth : null)

  // ── Wizard-collect handler ────────────────────────────────────────
  // De wizard retourneert één `QuickAddInput`-payload per call. We mergen
  // het item in de juiste array; de wizard regelt zelf z'n eigen close-flow
  // (success-screen + "Nog een toevoegen"-knop) zodat de gebruiker meerdere
  // items na elkaar kan toevoegen zonder dat we 'm hier hoeven te re-openen.
  function handleWizardCollect(item: QuickAddInput) {
    if (item.kind === 'asset') {
      onAssetsChange([...quickAssets, item.asset])
    } else if (item.kind === 'debt') {
      onDebtsChange([...quickDebts, item.debt])
    } else {
      // 'asset_with_debt' wordt in collect-mode niet getriggerd (de wizard
      // skipt de koppel-prompt). Defensief: voeg beide los toe als het ooit
      // wel zou voorkomen, zodat onboarding-data niet stilzwijgend verdwijnt.
      onAssetsChange([...quickAssets, item.asset])
      onDebtsChange([
        ...quickDebts,
        { ...item.debt, linked_asset_id: null },
      ])
    }
  }

  // ── Aangifte-collect handler ──────────────────────────────────────
  // De pane retourneert assets + debts in `AangifteAssetReviewItem` /
  // `AangifteDebtReviewItem`-shape — beide extenden `AssetQuickInput` /
  // `DebtQuickInput`, dus de `current_value_actual` / `current_balance_actual`
  // extra-velden glijden er gewoon doorheen (server-validator negeert ze in
  // de quickAssets/quickDebts arrays). Profile-updates en peildatum/tax-year
  // worden in deze flow genegeerd — life-events en bruto inkomen kunnen later
  // toegevoegd worden via een aparte uitbreiding.
  function handleAangifteCollect(payload: {
    assets: AssetQuickInput[]
    debts: DebtQuickInput[]
  }) {
    if (payload.assets.length > 0) {
      onAssetsChange([...quickAssets, ...payload.assets])
    }
    if (payload.debts.length > 0) {
      onDebtsChange([...quickDebts, ...payload.debts])
    }
  }

  // Item-removal handlers — gewone splice-by-index, geen confirm-modal:
  // onboarding-input is transient en kan trivially opnieuw worden ingevoerd.
  function removeAsset(idx: number) {
    onAssetsChange(quickAssets.filter((_, i) => i !== idx))
  }
  function removeDebt(idx: number) {
    onDebtsChange(quickDebts.filter((_, i) => i !== idx))
  }

  // ── Headline ──────────────────────────────────────────────────────
  const headline = (
    <>
      Heb je al{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        bezittingen
      </em>{' '}
      of{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        schulden
      </em>
      ?
    </>
  )

  // Dynamisch facts-paneel: zodra de gebruiker iets toegevoegd heeft, toont
  // het paneel z'n cumulatieve netto vermogen + flash-feedback. Anders
  // fallback CBS-mediaan.
  const factsProps = hasAnyItem
    ? {
        stat: formatCurrency(netWorth),
        sub: 'jouw netto vermogen tot nu toe',
        source: `${quickAssets.length} bezit${quickAssets.length === 1 ? '' : 'ten'} · ${quickDebts.length} schuld${quickDebts.length === 1 ? '' : 'en'}`,
      }
    : {
        stat: '€128.500',
        sub: 'mediaan huishoud-vermogen in Nederland',
        source: 'CBS Vermogensstatistiek, 2023',
      }

  return (
    <>
      <OnboardingShell
        kicker="Bezit"
        romanNum="iv."
        title={headline}
        deck="Voor je dashboard. Skip kan altijd."
        factsPanel={
          <FactsPanel
            {...factsProps}
            evolution={
              hasAnyItem ? (
                <div className={`${flashClass} -mx-2 px-2 py-1`}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                    Cumulatief
                  </p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-[var(--ink-3)]">Bezittingen</span>
                    <span className="text-right font-mono tabular-nums text-[var(--ink-2)]">
                      {formatCurrency(totalAssets)}
                    </span>
                    <span className="text-[var(--ink-3)]">Schulden</span>
                    <span className="text-right font-mono tabular-nums text-[var(--ink-2)]">
                      {totalDebts > 0 ? `−${formatCurrency(totalDebts)}` : formatCurrency(0)}
                    </span>
                  </div>
                </div>
              ) : undefined
            }
          />
        }
        currentStep={currentStep}
        totalSteps={totalSteps}
        onBack={onBack}
        footer={
          <button
            type="button"
            onClick={onNext}
            className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
          >
            {hasAnyItem ? 'Verder' : 'Overslaan'}
          </button>
        }
      >
        <div className="space-y-7">
          {/* ── Actie-strip: drie tiles ──────────────────────────────── */}
          <div
            role="group"
            aria-label="Voeg bezittingen, schulden of een aangifte toe"
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
          >
            <ActionTile
              icon={<Plus className="h-4 w-4" strokeWidth={2} />}
              label="Bezitting toevoegen"
              sublabel="Bankrekening, woning, beleggingen…"
              onClick={() => setWizardIntent('asset')}
              variant="asset"
            />
            <ActionTile
              icon={<Minus className="h-4 w-4" strokeWidth={2} />}
              label="Schuld toevoegen"
              sublabel="Hypotheek, lening, krediet…"
              onClick={() => setWizardIntent('debt')}
              variant="debt"
            />
            <ActionTile
              icon={<FileText className="h-4 w-4" strokeWidth={1.75} />}
              label="Aangifte uploaden"
              sublabel="Snel je gegevens importeren via PDF"
              onClick={() => setAangifteOpen(true)}
              variant="aangifte"
            />
          </div>

          {/* ── Lijst — verschijnt zodra er items zijn ───────────────── */}
          {hasAnyItem && (
            <div className="space-y-8">
              {quickAssets.length > 0 && (
                <section>
                  <SectionLabel
                    kicker="Bezittingen"
                    count={quickAssets.length}
                    total={totalAssets}
                  />
                  <ul className="space-y-2">
                    {quickAssets.map((item, idx) => (
                      <li key={`asset-${idx}`}>
                        <AssetRow item={item} onRemove={() => removeAsset(idx)} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {quickDebts.length > 0 && (
                <section>
                  <SectionLabel
                    kicker="Schulden"
                    count={quickDebts.length}
                    total={totalDebts}
                    negative
                  />
                  <ul className="space-y-2">
                    {quickDebts.map((item, idx) => (
                      <li key={`debt-${idx}`}>
                        <DebtRow item={item} onRemove={() => removeDebt(idx)} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {/* ── Skip-link — alleen tonen zolang er nog niks ingevoerd is.
              Anders is de primary "Verder"-knop in de footer voldoende. */}
          {!hasAnyItem && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={onNext}
                className="min-h-11 px-3 text-xs uppercase tracking-[0.18em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                Sla over &rarr;
              </button>
            </div>
          )}
        </div>
      </OnboardingShell>

      {/* ── QuickAddWizard — BottomSheet via portal ─────────────────── */}
      <QuickAddWizard
        open={wizardIntent !== null}
        onClose={() => setWizardIntent(null)}
        initialIntent={wizardIntent ?? undefined}
        mode="collect"
        onCollect={handleWizardCollect}
      />

      {/* ── AangifteImportPane — ShellOverlay (pane → BottomSheet) ──── */}
      <AangifteImportPane
        open={aangifteOpen}
        onClose={() => setAangifteOpen(false)}
        mode="onboarding-collect"
        onCollect={handleAangifteCollect}
      />
    </>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────

/** Eén actie-tile in de strip — variant-bewust voor tinting + a11y-label. */
function ActionTile({
  icon,
  label,
  sublabel,
  onClick,
  variant,
}: {
  icon: React.ReactNode
  label: string
  sublabel: string
  onClick: () => void
  variant: 'asset' | 'debt' | 'aangifte'
}) {
  // Asset + Aangifte krijgen de module-tint (kern-warm). Schuld blijft
  // neutraal-ink — bewuste visuele afsplitsing zodat "schuld" zich niet
  // als een primair pad presenteert.
  const accentBorder =
    variant === 'debt'
      ? 'hover:border-[var(--ink-2)]'
      : 'hover:border-[var(--module-active-500)]'
  const accentBg =
    variant === 'debt'
      ? 'hover:bg-[var(--subtle)]/60'
      : 'hover:bg-[var(--module-active-50)]/40'
  const iconColor =
    variant === 'debt'
      ? 'text-[var(--ink-2)]'
      : 'text-[var(--module-active-700)]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[100px] flex-col items-start gap-2 border-2 border-[var(--border-ed)] bg-[var(--paper)] p-5 text-left transition-colors ${accentBorder} ${accentBg} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
    >
      <span
        aria-hidden
        className={`flex h-7 w-7 items-center justify-center ${iconColor}`}
      >
        {icon}
      </span>
      <p
        className="font-serif text-base leading-tight text-[var(--ink)] sm:text-[17px]"
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {label}
      </p>
      <p
        className="font-serif text-xs italic text-[var(--ink-3)] leading-snug"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {sublabel}
      </p>
    </button>
  )
}

function SectionLabel({
  kicker,
  count,
  total,
  negative,
}: {
  kicker: string
  count: number
  total: number
  negative?: boolean
}) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block h-px w-5 shrink-0"
          style={{ background: 'var(--module-active-500)' }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--module-active-700)]">
          {kicker}
        </span>
        {count > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
            &middot; {count}
          </span>
        )}
      </div>
      {count > 0 && (
        <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">
          {negative && total > 0 ? '−' : ''}
          {formatCurrency(total)}
        </span>
      )}
    </div>
  )
}

function AssetRow({
  item,
  onRemove,
}: {
  item: AssetQuickInput
  onRemove: () => void
}) {
  const iconName = ASSET_TYPE_ICONS[item.asset_type as AssetType] ?? 'CircleDot'
  const typeLabel = ASSET_QUICK_ADD_LABELS[item.asset_type as AssetType] ?? 'Overig'
  return (
    <div className="flex items-center gap-3 border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-3 py-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--paper)] text-[var(--module-active-700)]"
      >
        <TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink)]">{item.name}</p>
        <p
          className="text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {typeLabel}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink-2)]">
        {formatCurrency(item.current_value)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 flex h-9 w-9 items-center justify-center text-[var(--ink-4)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink-2)]"
        aria-label={`Verwijder ${item.name}`}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}

function DebtRow({
  item,
  onRemove,
}: {
  item: DebtQuickInput
  onRemove: () => void
}) {
  const iconName = DEBT_TYPE_ICONS[item.debt_type as DebtType] ?? 'CircleDot'
  const typeLabel = DEBT_QUICK_ADD_LABELS[item.debt_type as DebtType] ?? 'Overig'
  return (
    <div className="flex items-center gap-3 border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-3 py-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--paper)] text-[var(--ink-2)]"
      >
        <TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink)]">{item.name}</p>
        <p
          className="text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {typeLabel}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink-2)]">
        &minus;{formatCurrency(item.current_balance)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 flex h-9 w-9 items-center justify-center text-[var(--ink-4)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink-2)]"
        aria-label={`Verwijder ${item.name}`}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}
