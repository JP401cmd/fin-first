'use client'

import { useEffect, useState } from 'react'
import { Building2, CheckCircle2, Lightbulb } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { BankSelector } from '@/components/app/bank-connect/bank-selector'
import { BankAuthWaiting } from '@/components/app/bank-connect/bank-auth-waiting'
import { TargetAccountChoice } from '@/components/app/bank-connect/target-account-choice'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { BetaAddonDialog } from '@/components/app/beta-addon/beta-addon-dialog'
import { BETA_SELF_SERVE_ADDONS, CONNECTED_REQUIRED_CODE } from '@/lib/beta-addons'
import { BANK_CONNECT_SAFETY_SHORT } from '@/lib/bank-connect-copy'
import { BANK_SKIP_REDENEN, type BankSkipReden } from '@/lib/onboarding/afronding'
import {
  fetchTargetOptions,
  startBankConnect,
  type BankConnectProvider,
  type TargetSelection,
} from '@/lib/truelayer/start-bank-connect'
import { isInstalledApp } from '@/lib/truelayer/open-bank-auth'
import type { TargetAccountOption, TargetAssetOption } from '@/lib/truelayer/target-account'

export type { BankSkipReden }

/**
 * Onboarding-afronding — "Koppel je bank" (plan §3).
 *
 * Hergebruikt de koppelwizard in plaats van hem na te bouwen: dezelfde doelkeuze
 * (`TargetAccountChoice`), dezelfde bankkeuze (`BankSelector`), dezelfde start
 * (`startBankConnect` → `auth-link` → `openBankAuth`) en hetzelfde wachtscherm
 * (`BankAuthWaiting`) als `/core/cash/connect`. Alleen de stap-indeling en de
 * afsluiting zijn van de onboarding.
 *
 * **Waarom eerst de rekening.** De onboarding heeft net een betaalrekening als
 * cash-bezit aangemaakt. Koppelen zónder die keuze liet de callback een tweede
 * rekening aanmaken — een dubbele betaalrekening. Stap A is dus verplicht, met
 * voorselectie als er precies één betaalrekening is.
 *
 * **Overslaan met frictie.** Geen overslaan-knop naast de primaire actie; alleen
 * een rustige tekstlink die een bevestiging opent waarin de gebruiker kiest
 * waaróm. Die reden gaat via `onSkipped` naar de pagina.
 *
 * Geen directe Supabase-lezing (ADR 0058): de opties komen via
 * `GET /api/bank-connect/accounts`.
 */
export interface OnboardingBankProps {
  /** Uit `?bank_connected=1` / `?bank_error=1` na terugkeer in hetzelfde tabblad. */
  result: 'connected' | 'error' | null
  /** De gebruiker gaat verder na een geslaagde koppeling. */
  onDone: () => void
  onSkipped: (reden: BankSkipReden) => void
  currentStep?: number
  totalSteps?: number
}

type Stap = 'rekening' | 'bank'

const SKIP_LABELS: Record<BankSkipReden, string> = {
  rondkijken: 'Ik wil eerst rondkijken',
  bank_ontbreekt: 'Mijn bank staat er niet tussen',
  liever_niet: 'Ik koppel liever niet',
}

const PRIMARY_BUTTON =
  'w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40'

const TEXT_LINK =
  'min-h-11 px-1 text-xs text-[var(--ink-2)] underline decoration-[var(--border-ed)] underline-offset-2 transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

/**
 * Voorselectie: precies één cash-bezit dat als betaalrekening landt. Een leeg
 * subtype (de onboarding vult het niet) telt als betaalrekening — dat is ook waar
 * de companion op landt (`cashSubtypeToAccountType`). Bij twee of meer kiest de
 * gebruiker zelf: de app kiest niet stil een rekening uit.
 *
 * Een eerdere, afgebroken koppelpoging heeft voor dat bezit al een companion
 * aangemaakt; het staat dan als vrije, lege rekening in `accounts` in plaats van
 * in `assets`. Die telt als dezelfde kandidaat, anders verdwijnt de voorselectie
 * precies bij "Opnieuw proberen".
 */
export function preselectTarget(accounts: TargetAccountOption[], assets: TargetAssetOption[]): TargetSelection {
  if (accounts.length + assets.length === 0) return { kind: 'new' }
  const betaal = assets.filter((a) => a.account_type === 'checking')
  const vrijeLegeRekeningen = accounts.filter(
    (a) => a.linked_provider_name === null && a.transaction_count === 0,
  )
  if (betaal.length === 1 && vrijeLegeRekeningen.length === 0) return { kind: 'asset', id: betaal[0].id }
  if (betaal.length === 0 && assets.length === 0 && vrijeLegeRekeningen.length === 1 && accounts.length === 1) {
    return { kind: 'existing', id: vrijeLegeRekeningen[0].id }
  }
  return { kind: 'none' }
}

export function OnboardingBank({
  result,
  onDone,
  onSkipped,
  currentStep = 1,
  totalSteps = 1,
}: OnboardingBankProps) {
  const [stap, setStap] = useState<Stap>('rekening')
  const [connected, setConnected] = useState(result === 'connected')
  const [showResultError, setShowResultError] = useState(result === 'error')

  const [accounts, setAccounts] = useState<TargetAccountOption[]>([])
  const [assets, setAssets] = useState<TargetAssetOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selection, setSelection] = useState<TargetSelection>({ kind: 'none' })
  const [enableBudgetTracking, setEnableBudgetTracking] = useState(true)

  const [bank, setBank] = useState<BankConnectProvider | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [waitingFor, setWaitingFor] = useState<string | null>(null)

  const [connectedDialogOpen, setConnectedDialogOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipReden, setSkipReden] = useState<BankSkipReden | null>(null)

  useEffect(() => {
    setConnected(result === 'connected')
    setShowResultError(result === 'error')
  }, [result])

  useEffect(() => {
    if (connected) return
    let cancelled = false
    void (async () => {
      const options = await fetchTargetOptions()
      if (cancelled) return
      if (!options) {
        setSelection({ kind: 'new' })
        setLoadError('Je rekeningen konden niet worden geladen.')
      } else {
        setAccounts(options.accounts)
        setAssets(options.assets)
        setSelection(preselectTarget(options.accounts, options.assets))
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [connected])

  async function handleConnect() {
    if (!bank || selection.kind === 'none' || connecting) return
    setConnecting(true)
    setConnectError(null)
    const started = await startBankConnect({ provider: bank, selection, enableBudgetTracking })
    if (!started.ok) {
      // Beta (ADR 0157): nog geen Connected-keuze → eerst de popup, daarna
      // opnieuw koppelen via `onActivated`.
      if (started.code === CONNECTED_REQUIRED_CODE && BETA_SELF_SERVE_ADDONS) {
        setConnectedDialogOpen(true)
        setConnecting(false)
        return
      }
      setConnectError(started.error)
      setConnecting(false)
      return
    }
    if (started.launch === 'window') {
      setWaitingFor(started.connectionId)
      setConnecting(false)
    }
    // 'same-tab': deze pagina wordt verlaten; de callback brengt de gebruiker terug.
  }

  function retry() {
    setShowResultError(false)
    setConnectError(null)
    setWaitingFor(null)
    setBank(null)
    setStap('rekening')
  }

  function closeSkip() {
    setSkipOpen(false)
    setSkipReden(null)
  }

  const factsPanel = (
    <FactsPanel
      stat="180 dagen"
      sub="Zo lang blijft een koppeling uiterlijk geldig (PSD2). Daarna verbind je met één klik opnieuw."
      source="PSD2-rekeninginformatie via TrueLayer"
    />
  )

  const skipLink = (
    <div className="mt-2 flex justify-center">
      <button type="button" onClick={() => setSkipOpen(true)} className={TEXT_LINK}>
        Ik doe dit later
      </button>
    </div>
  )

  const skipOverlay = (
    <ShellOverlay
      open={skipOpen}
      onClose={closeSkip}
      kind="confirm"
      title="Bank later koppelen?"
      footer={
        <ModalFooter
          align="end"
          primary={{ label: 'Toch koppelen', onClick: closeSkip }}
          secondary={{
            label: 'Later doen',
            onClick: () => {
              if (skipReden) onSkipped(skipReden)
            },
            disabled: !skipReden,
          }}
        />
      }
    >
      <div className="space-y-4 p-6 font-sans text-sm leading-relaxed text-[var(--ink-2)]">
        <p>Zonder koppeling vul je je uitgaven zelf in of importeer je een bankbestand.</p>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-[var(--ink)]">Waarom later?</legend>
          {BANK_SKIP_REDENEN.map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="onboarding-bank-later"
                value={r}
                checked={skipReden === r}
                onChange={() => setSkipReden(r)}
                className="h-3.5 w-3.5 shrink-0 accent-kern-600"
              />
              <span>{SKIP_LABELS[r]}</span>
            </label>
          ))}
        </fieldset>
        {skipReden === 'bank_ontbreekt' && (
          <p className="flex items-start gap-2 text-xs text-[var(--ink-2)]">
            <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
            Je kunt later een CSV- of MT940-bestand van je bank importeren, via Overzicht → Budget →
            Transacties.
          </p>
        )}
      </div>
    </ShellOverlay>
  )

  // ── Gekoppeld ──────────────────────────────────────────────────────────────
  if (connected) {
    return (
      <OnboardingShell
        kicker="Bank koppelen"
        title="Je bank is gekoppeld"
        deck="Je saldo en transacties komen voortaan vanzelf binnen."
        factsPanel={factsPanel}
        currentStep={currentStep}
        totalSteps={totalSteps}
        footer={
          <button type="button" onClick={onDone} className={PRIMARY_BUTTON}>
            Verder
          </button>
        }
      >
        <div role="status" className="flex items-center gap-3 text-sm text-[var(--ink)]">
          <CheckCircle2 aria-hidden className="h-6 w-6 shrink-0 text-positive" />
          <span>Je bank is gekoppeld.</span>
        </div>
        {/* Terugkeer via de callback (dus niet het wachtscherm) in een browser:
            op Android landt die terugkeer vanuit de geïnstalleerde app in Chrome,
            terwijl het app-venster zelf al verder is (B-051). Dat tabblad is niet
            door ons geopend, dus sluiten kan alleen de gebruiker. */}
        {result === 'connected' && !isInstalledApp() && (
          <p className="mt-4 text-xs leading-relaxed text-[var(--ink-3)]">
            Ben je begonnen in de TriFinity-app op je telefoon? Dan kun je dit tabblad sluiten en in de app
            verdergaan — daar staat de koppeling ook al klaar.
          </p>
        )}
      </OnboardingShell>
    )
  }

  // ── Wachten op de bank (geïnstalleerde app, apart venster) ─────────────────
  if (waitingFor) {
    return (
      <OnboardingShell
        kicker="Bank koppelen"
        title="Rond het koppelen af bij je bank"
        deck={BANK_CONNECT_SAFETY_SHORT}
        factsPanel={factsPanel}
        currentStep={currentStep}
        totalSteps={totalSteps}
        footer={skipLink}
      >
        <BankAuthWaiting
          connectionId={waitingFor}
          showAccountsLink={false}
          onCancel={() => setWaitingFor(null)}
          onSuccess={() => {
            setWaitingFor(null)
            setConnected(true)
          }}
        />
        {skipOverlay}
      </OnboardingShell>
    )
  }

  const errorBox = (message: string) => (
    <div className="border border-negative/30 bg-negative-bg px-4 py-3" role="alert">
      <p className="text-sm font-medium text-negative">{message}</p>
    </div>
  )

  // ── Mislukt na terugkeer ───────────────────────────────────────────────────
  if (showResultError) {
    return (
      <OnboardingShell
        kicker="Bank koppelen"
        title="Het koppelen is niet gelukt"
        deck="De koppeling is afgebroken of niet afgerond. Er is niets gekoppeld en er staat niets dubbel — probeer het opnieuw, of doe het later."
        factsPanel={factsPanel}
        currentStep={currentStep}
        totalSteps={totalSteps}
        footer={
          <>
            <button type="button" onClick={retry} className={PRIMARY_BUTTON}>
              Opnieuw proberen
            </button>
            {skipLink}
          </>
        }
      >
        {errorBox('Je bank is nog niet gekoppeld.')}
        {skipOverlay}
      </OnboardingShell>
    )
  }

  // ── Stap A: welke rekening ─────────────────────────────────────────────────
  if (stap === 'rekening') {
    return (
      <OnboardingShell
        kicker="Bank koppelen"
        title="Welke rekening koppel je?"
        deck="Kies je bestaande rekening, dan wordt die bijgewerkt in plaats van dat je hem dubbel ziet."
        factsPanel={factsPanel}
        currentStep={currentStep}
        totalSteps={totalSteps}
        footer={
          <>
            <button
              type="button"
              onClick={() => setStap('bank')}
              disabled={loading || selection.kind === 'none'}
              className={PRIMARY_BUTTON}
            >
              Verder
            </button>
            {skipLink}
          </>
        }
      >
        <TargetAccountChoice
          accounts={accounts}
          assets={assets}
          loading={loading}
          loadError={loadError}
          selection={selection}
          onSelect={(next) => {
            setSelection(next)
            // Per rekening voorgevinkt: een eerdere "nee" mag niet doorwerken.
            setEnableBudgetTracking(true)
          }}
          enableBudgetTracking={enableBudgetTracking}
          onToggleBudgetTracking={setEnableBudgetTracking}
          providerName="Je bank"
        />
        {skipOverlay}
      </OnboardingShell>
    )
  }

  // ── Stap B: welke bank ─────────────────────────────────────────────────────
  return (
    <OnboardingShell
      kicker="Bank koppelen"
      title="Kies je bank"
      deck={BANK_CONNECT_SAFETY_SHORT}
      factsPanel={factsPanel}
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={() => {
        setConnectError(null)
        setStap('rekening')
      }}
      footer={
        <>
          <button
            type="button"
            onClick={handleConnect}
            disabled={!bank || selection.kind === 'none' || connecting}
            className={PRIMARY_BUTTON}
          >
            {connecting ? 'Verbinden…' : 'Koppel mijn bank'}
          </button>
          {skipLink}
        </>
      }
    >
      <div className="space-y-4">
        {connectError && errorBox(connectError)}
        {bank ? (
          <div className="flex items-center gap-4 border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            {bank.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bank.logo} alt="" className="h-10 w-10 rounded-lg object-contain" />
            ) : (
              <Building2 aria-hidden className="h-6 w-6 text-[var(--ink-3)]" />
            )}
            <p className="flex-1 font-semibold text-[var(--ink)]">{bank.name}</p>
            <button
              type="button"
              onClick={() => setBank(null)}
              disabled={connecting}
              className={TEXT_LINK}
            >
              Andere bank
            </button>
          </div>
        ) : (
          <BankSelector onSelect={setBank} />
        )}
      </div>
      <BetaAddonDialog
        tier="connected"
        source="onboarding"
        open={connectedDialogOpen}
        onClose={() => setConnectedDialogOpen(false)}
        onActivated={() => void handleConnect()}
      />
      {skipOverlay}
    </OnboardingShell>
  )
}
