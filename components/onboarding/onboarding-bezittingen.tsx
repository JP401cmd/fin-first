'use client'

import { useMemo, useState } from 'react'
import { Hammer, Minus, Plus, Trash2, Link2, Shield, Zap, CheckCircle2, AlertTriangle } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
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
 * Stap — Registreer je bezittingen en schulden (/core-style: 2 entry-knoppen
 * + lijst).
 *
 * Vervangt het oude ja/nee-tile + inline-mini-form-patroon. De gebruiker
 * krijgt twee gelijkwaardige toevoeg-paden, identiek aan de bezittings-
 * en schulden-cards op `/core`:
 *
 *  1. **Bezitting toevoegen** — `QuickAddWizard` in `mode='collect'` met
 *     `initialIntent='asset'`. Wizard rendert als BottomSheet (eigen portal)
 *     en geeft het verzamelde item via `onCollect` terug. Geen DB-write.
 *  2. **Schuld toevoegen** — idem voor `initialIntent='debt'`.
 *
 * De aangifte-upload is in jun 2026 uit deze stap verwijderd (te zwaar voor
 * onboarding); importeren via aangifte kan nog steeds op /mijn/koppelingen
 * en de bezittingen-pagina. De PSD2-bankkoppeling staat er nog wel, maar
 * achter een "in ontwikkeling"-overlay tot de flow productieklaar is.
 *
 * Toegevoegde items verschijnen in twee secties onder de actie-strip:
 * Bezittingen + Schulden, met type-icoon, naam, bedrag en delete-knop.
 * Lege secties zijn verborgen om visuele ruis te vermijden.
 *
 * **Wizard binnen onboarding**: de wizard wordt gerenderd als BottomSheet
 * (via `BottomSheet` → `createPortal` → document.body). Geen z-index issues
 * met de onboarding-shell. De wizard zelf detecteert via `useOptionalToast`
 * dat er geen ToastProvider is en skipt de toasts in collect-mode.
 */

// ── Props ──────────────────────────────────────────────────────────────

export interface OnboardingBezittingenProps {
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  onAssetsChange: (items: AssetQuickInput[]) => void
  onDebtsChange: (items: DebtQuickInput[]) => void
  onNext: () => void
  onBack: () => void
  /** 1-indexed stap-nummer voor de voortgangsbalk (default 3). */
  currentStep?: number
  totalSteps?: number
  /** True wanneer de gebruiker net terug is van een succesvolle PSD2 bank
   *  koppeling (callback redirect met ?bank_connected=1). Toont een
   *  succesmelding boven de actie-strip. */
  bankConnected?: boolean
  /** True wanneer de PSD2 callback een fout gaf (?bank_error=1). */
  bankError?: boolean
}

// ── Component ──────────────────────────────────────────────────────────

export function OnboardingBezittingen({
  quickAssets,
  quickDebts,
  onAssetsChange,
  onDebtsChange,
  onNext,
  onBack,
  currentStep = 3,
  totalSteps = 5,
  bankConnected = false,
  bankError = false,
}: OnboardingBezittingenProps) {
  // PSD2 bank connect state — de koppel-flow zelf staat achter een
  // "in ontwikkeling"-overlay, maar de callback-states blijven afgehandeld
  // voor gebruikers die al een koppeling gestart hadden.
  const [bankConnecting, setBankConnecting] = useState(false)
  const [bankConnectError, setBankConnectError] = useState<string | null>(
    bankError ? 'Bankverbinding mislukt. Probeer het opnieuw.' : null
  )

  const [wizardIntent, setWizardIntent] = useState<QuickAddIntent | null>(null)
  // Subtiele melding wanneer een huis met gekoppelde hypotheek verwijderd is:
  // de hypotheek blijft bestaan als losse schuld (ontkoppeld). Blijft staan tot
  // de volgende mutatie zodat de gebruiker de overgang opmerkt.
  const [unlinkNotice, setUnlinkNotice] = useState<string | null>(null)

  // Koppel-index: client_ref → de bijbehorende (gekoppelde) schuld + haar
  // positie in `quickDebts`. Gevuld vanuit de wizard-`asset_with_debt`-flow.
  const debtByRef = useMemo(() => {
    const map = new Map<string, { debt: DebtQuickInput; index: number }>()
    quickDebts.forEach((debt, index) => {
      if (debt.linked_client_ref) map.set(debt.linked_client_ref, { debt, index })
    })
    return map
  }, [quickDebts])

  // Losse schulden = alles zonder koppeling. Gekoppelde hypotheken tonen we
  // gegroepeerd ónder hun huis (niet dubbel in de schulden-sectie).
  const standaloneDebts = useMemo(
    () =>
      quickDebts
        .map((debt, index) => ({ debt, index }))
        .filter(({ debt }) => !debt.linked_client_ref),
    [quickDebts],
  )
  const standaloneDebtsTotal = useMemo(
    () => standaloneDebts.reduce((s, { debt }) => s + (Number(debt.current_balance) || 0), 0),
    [standaloneDebts],
  )

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
    setUnlinkNotice(null)
    if (item.kind === 'asset') {
      onAssetsChange([...quickAssets, item.asset])
    } else if (item.kind === 'debt') {
      onDebtsChange([...quickDebts, item.debt])
    } else {
      // 'asset_with_debt' — huis + hypotheek als lokaal paar. Het huis heeft
      // nog geen DB-id, dus we koppelen via een opaak client_ref-token: de
      // server vertaalt dat na insert naar het echte debts.linked_asset_id.
      const ref = `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      onAssetsChange([...quickAssets, { ...item.asset, client_ref: ref }])
      onDebtsChange([
        ...quickDebts,
        { ...item.debt, linked_asset_id: null, linked_client_ref: ref },
      ])
    }
  }

  // Item-removal handlers — gewone splice-by-index, geen confirm-modal:
  // onboarding-input is transient en kan trivially opnieuw worden ingevoerd.
  function removeAsset(idx: number) {
    const removed = quickAssets[idx]
    onAssetsChange(quickAssets.filter((_, i) => i !== idx))
    // Verwijder je een huis met gekoppelde hypotheek, dan blijft de hypotheek
    // bestaan als losse schuld — alleen de lokale koppeling vervalt (spiegelt
    // het DB-gedrag ON DELETE SET NULL). Subtiele melding zodat de overgang
    // niet verrast.
    if (removed?.client_ref) {
      const linked = quickDebts.find((d) => d.linked_client_ref === removed.client_ref)
      if (linked) {
        onDebtsChange(
          quickDebts.map((d) =>
            d.linked_client_ref === removed.client_ref ? { ...d, linked_client_ref: null } : d,
          ),
        )
        setUnlinkNotice(linked.name)
        return
      }
    }
    setUnlinkNotice(null)
  }
  function removeDebt(idx: number) {
    setUnlinkNotice(null)
    onDebtsChange(quickDebts.filter((_, i) => i !== idx))
  }

  // ── Headline ──────────────────────────────────────────────────────
  const headline = (
    <>
      Registreer je{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        bezittingen
      </em>{' '}
      en{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        schulden
      </em>
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
        romanNum="iii."
        title={headline}
        deck="Denk aan je betaal- en spaarrekening, woning of beleggingen — en je hypotheek, studieschuld of lening. Samen tonen ze hoeveel vrijheid je al hebt opgebouwd; alles vul je later aan."
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
            {hasAnyItem ? 'Verder' : 'Later invullen'}
          </button>
        }
      >
        <div className="space-y-7">
          {/* ── PSD2 Bank Connect — achter "in ontwikkeling"-overlay ──
              De kaart blijft zichtbaar als preview van wat eraan komt,
              maar de semi-transparante overlay vangt alle interactie af
              tot de koppel-flow productieklaar is. */}
          {bankConnected ? (
            <div className="flex items-center gap-3 border-2 border-green-200 bg-green-50 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-800">
                  Bank succesvol gekoppeld
                </p>
                <p
                  className="text-xs italic text-green-700"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  Transacties worden automatisch gesynchroniseerd.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative" aria-disabled="true">
              <div aria-hidden className="select-none">
                <PSD2ConnectCard
                  connecting={bankConnecting}
                  error={bankConnectError}
                  onConnect={async (provider) => {
                    setBankConnecting(true)
                    setBankConnectError(null)
                    try {
                      const res = await fetch('/api/bank-connect/auth-link', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          provider_id: provider.id,
                          provider_name: provider.name,
                          provider_logo: provider.logo,
                        }),
                      })
                      const data = await res.json()
                      if (!res.ok) {
                        throw new Error(data.error || 'Verbinding maken mislukt')
                      }
                      // Redirect to bank authorization — user returns via callback → /onboarding?bank_connected=1
                      window.location.href = data.auth_url
                    } catch (err) {
                      setBankConnectError(
                        err instanceof Error ? err.message : 'Verbinding maken mislukt'
                      )
                      setBankConnecting(false)
                    }
                  }}
                />
              </div>
              {/* Semi-transparante overlay — vangt klikken af (geen
                  pointer-events-none) en kondigt de optie aan. */}
              <div
                role="note"
                aria-label="Bank koppelen is in ontwikkeling en nog niet beschikbaar"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-[var(--paper)]/75 backdrop-blur-[1px]"
              >
                <span className="flex items-center gap-2 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-2)]">
                  <Hammer className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  In ontwikkeling
                </span>
                <p
                  className="text-xs italic text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  Bank koppelen komt binnenkort — voeg nu handmatig toe.
                </p>
              </div>
            </div>
          )}

          {/* ── Actie-strip: twee tiles ──────────────────────────────── */}
          <div
            role="group"
            aria-label="Voeg bezittingen of schulden toe"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            <ActionTile
              icon={<Plus className="h-4 w-4" strokeWidth={2} />}
              label="Bezitting toevoegen"
              sublabel="Betaal- of spaarrekening, woning, beleggingen, auto…"
              onClick={() => setWizardIntent('asset')}
              variant="asset"
            />
            <ActionTile
              icon={<Minus className="h-4 w-4" strokeWidth={2} />}
              label="Schuld toevoegen"
              sublabel="Hypotheek, studieschuld, lening, creditcard…"
              onClick={() => setWizardIntent('debt')}
              variant="debt"
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
                    {quickAssets.map((item, idx) => {
                      const linked = item.client_ref
                        ? debtByRef.get(item.client_ref)
                        : undefined
                      return (
                        <li key={`asset-${idx}`} className="space-y-2">
                          <AssetRow item={item} onRemove={() => removeAsset(idx)} />
                          {linked && (
                            <LinkedDebtRow
                              item={linked.debt}
                              onRemove={() => removeDebt(linked.index)}
                            />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              {standaloneDebts.length > 0 && (
                <section>
                  <SectionLabel
                    kicker="Schulden"
                    count={standaloneDebts.length}
                    total={standaloneDebtsTotal}
                    negative
                  />
                  {unlinkNotice && (
                    <p className="mb-3 text-[11px] italic text-[var(--ink-3)]">
                      {unlinkNotice} blijft als losse schuld staan na het verwijderen van de woning.
                    </p>
                  )}
                  <ul className="space-y-2">
                    {standaloneDebts.map(({ debt, index }) => (
                      <li key={`debt-${index}`}>
                        <DebtRow item={debt} onRemove={() => removeDebt(index)} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
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
  variant: 'asset' | 'debt'
}) {
  // Asset krijgt de module-tint (kern-warm). Schuld blijft neutraal-ink —
  // bewuste visuele afsplitsing zodat "schuld" zich niet als een primair
  // pad presenteert.
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

/**
 * Gekoppelde-schuld-subrij — getoond ingesprongen ónder het huis waaraan de
 * hypotheek hangt. Visueel ondergeschikt (insprong + verbindingsstreep +
 * Link2-affordance) zodat de groepering "huis met hypotheek eronder" direct
 * leesbaar is. Verwijderen haalt alleen de schuld weg; het huis blijft staan.
 */
function LinkedDebtRow({
  item,
  onRemove,
}: {
  item: DebtQuickInput
  onRemove: () => void
}) {
  const iconName = DEBT_TYPE_ICONS[item.debt_type as DebtType] ?? 'CircleDot'
  const typeLabel = DEBT_QUICK_ADD_LABELS[item.debt_type as DebtType] ?? 'Overig'
  return (
    <div className="ml-5 flex items-center gap-3 border-l-2 border-[var(--border-ed)] bg-[var(--subtle)]/30 py-2 pl-3 pr-3">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--paper)] text-[var(--ink-2)]"
      >
        <TypeIcon name={iconName} className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-[var(--ink)]">
          <Link2 className="h-3 w-3 shrink-0 text-[var(--ink-3)]" aria-hidden />
          {item.name}
        </p>
        <p
          className="text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {typeLabel} · gekoppeld
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

// ── PSD2 Connect Card ─────────────────────────────────────────────────

type PSD2Provider = {
  id: string
  name: string
  logo: string
}

/**
 * Prominent PSD2/Open Banking verbinding-card bovenaan de bezittingen-stap.
 * Geframed als "Aanbevolen — snelste weg" om gebruikers te stimuleren hun
 * bank automatisch te koppelen. Klikken opent een bank-selector en start
 * de bestaande /api/bank-connect/auth-link flow.
 */
function PSD2ConnectCard({
  connecting,
  error,
  onConnect,
}: {
  connecting: boolean
  error: string | null
  onConnect: (provider: PSD2Provider) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [providers, setProviders] = useState<PSD2Provider[]>([])
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function handleExpand() {
    setExpanded(true)
    if (providers.length === 0 && !loadingProviders) {
      setLoadingProviders(true)
      setProviderError(null)
      try {
        const res = await fetch('/api/bank-connect/providers')
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Kon banken niet laden')
        }
        const data = await res.json()
        setProviders(data)
      } catch (err) {
        setProviderError(err instanceof Error ? err.message : 'Kon banken niet laden')
      } finally {
        setLoadingProviders(false)
      }
    }
  }

  const filtered = search.trim()
    ? providers.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : providers

  return (
    <div className="border-2 border-[var(--module-active-300)] bg-[var(--module-active-50)]/40 p-5 space-y-4">
      {/* Header with badge */}
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--module-active-100)] text-[var(--module-active-700)]"
        >
          <Link2 className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className="font-bold text-base text-[var(--ink)] sm:text-[17px]"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              Bank koppelen
            </p>
            <span className="inline-flex items-center gap-1 bg-[var(--module-active-600)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              <Zap className="h-3 w-3" />
              Aanbevolen
            </span>
          </div>
          <p
            className="mt-1 text-sm italic text-[var(--ink-2)] leading-snug"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Snelste weg om te starten — transacties worden automatisch geïmporteerd via Open Banking (PSD2).
          </p>
        </div>
      </div>

      {/* Security info */}
      <div className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
        <Shield className="h-3.5 w-3.5 shrink-0" />
        <span>Veilig via TrueLayer · Alleen lezen · 90 dagen geldig</span>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Action: expand to show bank selector */}
      {!expanded ? (
        <button
          type="button"
          onClick={handleExpand}
          disabled={connecting}
          className="w-full min-h-11 bg-[var(--module-active-600)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--module-active-700)] disabled:opacity-50"
        >
          {connecting ? 'Verbinden...' : 'Kies je bank'}
        </button>
      ) : (
        <div className="space-y-3">
          {loadingProviders && (
            <div className="flex items-center justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--module-active-500)] border-t-transparent" />
            </div>
          )}
          {providerError && (
            <p className="text-sm text-red-600 text-center">{providerError}</p>
          )}
          {!loadingProviders && !providerError && providers.length > 0 && (
            <>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek je bank..."
                className="w-full border border-[var(--border-ed)] bg-[var(--paper)] py-2 pl-3 pr-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)]"
                autoFocus
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                {filtered.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => onConnect(provider)}
                    disabled={connecting}
                    className="flex flex-col items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-center text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--module-active-500)] hover:bg-[var(--module-active-50)] disabled:opacity-50"
                  >
                    {provider.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={provider.logo}
                        alt={provider.name}
                        className="h-8 w-8 object-contain"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center bg-[var(--subtle)] text-[var(--ink-3)]">
                        <Link2 className="h-4 w-4" />
                      </div>
                    )}
                    <span className="truncate w-full">{provider.name}</span>
                  </button>
                ))}
              </div>
              {filtered.length === 0 && (
                <p className="text-sm text-center text-[var(--ink-3)] py-3">
                  Geen banken gevonden
                </p>
              )}
            </>
          )}

          {/* Collapse / cancel link */}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
          >
            Annuleren
          </button>
        </div>
      )}

      {/* Skip hint — onboarding framing: expliciet dat overslaan kan */}
      {!expanded && !connecting && (
        <p className="text-[11px] text-center text-[var(--ink-4)]">
          Niet verplicht — je kunt ook handmatig toevoegen
        </p>
      )}
    </div>
  )
}
