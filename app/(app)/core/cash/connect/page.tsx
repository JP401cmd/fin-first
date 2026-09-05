'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, ExternalLink, Shield, Clock, AlertTriangle } from 'lucide-react'
import { BANK_CONNECT_SAFETY_SHORT } from '@/lib/bank-connect-copy'
import { BankSelector } from '@/components/app/bank-connect/bank-selector'
import {
  CashflowAccountsExit,
  OccupiedAccountExit,
  TargetAccountChoice,
  type TargetSelection,
} from '@/components/app/bank-connect/target-account-choice'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { getPageInfo } from '@/lib/page-info-content'
import {
  occupiedTargetAccountMessage,
  type TargetAccountOption,
} from '@/lib/truelayer/target-account'

type Provider = {
  id: string
  name: string
  logo: string
}

/**
 * Drie stappen, en dat blijven het er drie (regressie-eis R3, gepind op de
 * stap-**ids** in `lib/regression-tests/suites/kern-bank-connect-flow.ts`). De
 * doelrekening-keuze uit fase 4 landt daarom BINNEN `confirm` — die stap heet
 * sindsdien "Rekening & bevestigen" — en niet als vierde stap: de keuze en de
 * bevestiging gaan over hetzelfde besluit (besluit 6, optie A).
 */
type Step = 'select' | 'confirm' | 'redirect'

/**
 * De generieke uitkomst wanneer een consent nergens kon landen omdat de
 * beoogde rekening(en) al een andere bankkoppeling dragen (fase 6, FR5).
 *
 * Twee callback-uitgangen vallen hierop terug: `geen_koppeling` (welke rekening
 * het was, is niet vast te stellen) en `drager_bezet` waarvan de drager niet in
 * onze eigen kandidatenlijst te vinden is. Bewust dezelfde tekst — een halve
 * melding met een lege plek waar de banknaam had moeten staan is erger dan één
 * eerlijke algemene regel.
 */
const GEEN_KOPPELING_MESSAGE =
  'Deze bank kon aan geen enkele rekening gekoppeld worden — er zit al een andere bankkoppeling op. Verbreek die eerst bij de rekening en probeer het opnieuw.'

export default function ConnectBankPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  /**
   * `?error=drager_bezet&drager=<bank_accounts.id>` — de callback wijst hier de
   * TriFinity-rekening aan die de koppeling had moeten dragen maar al bezet was
   * (het scenario dat fase 6 aan fase 7 doorgaf: bank A op X → verbreken → bank
   * B op X → A herverbinden; schakel 1 sneuvelt dan op de partiële unieke
   * index). De banknaam en de uitweg komen uit de kandidatenlijst die deze
   * pagina toch al ophaalt — geen extra read, geen tweede bron.
   */
  const occupiedCarrierParam = error === 'drager_bezet' ? searchParams.get('drager') : null

  const [step, setStep] = useState<Step>('select')
  const [selectedBank, setSelectedBank] = useState<Provider | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(
    error === 'missing_reference' ? 'Ontbrekende referentie in callback'
    : error === 'requisition_not_found' ? 'Verbindingsverzoek niet gevonden'
    : error === 'not_authorized' ? 'Bankautorizatie niet voltooid'
    : error === 'callback_failed' ? 'Callback verwerking mislukt'
    // Zonder deze twee landde de gebruiker op een ogenschijnlijk normale pagina
    // zonder enige uitleg over waarom het koppelen niet doorging.
    : error === 'connection_not_found' ? 'Deze koppelpoging is verlopen of al afgerond. Kies je bank en probeer het opnieuw.'
    : error === 'missing_code' ? 'Je bank stuurde geen bevestiging terug. Kies je bank en probeer het opnieuw.'
    // Fase 6: de rekening die deze bank moet dragen draagt al een andere
    // koppeling, dus er is geen rij die kan synchroniseren. Zonder deze melding
    // landde de gebruiker op een succespagina zonder rekeningen — "ik heb
    // opnieuw verbonden en er gebeurt niets".
    : error === 'geen_koppeling' ? GEEN_KOPPELING_MESSAGE
    // Fase 7: dezelfde toestand, maar de callback weet wélke rekening bezet was.
    // Start op de generieke tekst en verbijzonder zodra de kandidatenlijst binnen
    // is — zo staat er nooit een lege plek waar een banknaam hoort.
    : error === 'drager_bezet' ? GEEN_KOPPELING_MESSAGE
    : null
  )
  /**
   * De UITWEG die bij de melding hoort — en er is er altijd één.
   *
   *  - `account`: we hebben de bezette rekening teruggevonden, dus we wijzen hém
   *    aan (mét banknaam in de melding);
   *  - `accounts`: we weten dát een rekening bezet was maar niet welke — dan de
   *    rekeningenlijst, met exact de tekst die de success-pagina ook gebruikt.
   *    Dit is het gat dat de review vond: zonder deze val-terug las de gebruiker
   *    "verbreek die eerst bij de rekening" over een rekening die nergens te
   *    vinden was (een drager wiens cash-bezit gedeactiveerd is valt uit de
   *    kandidatenlijst — `isEligibleTargetAccount`, SC-13).
   *  - `null`: geen uitweg te tonen (andere fout, of nog aan het uitzoeken).
   *
   * Er is niets te resolven wanneer er geen drager te noemen ís — `geen_koppeling`
   * weet 'm per definitie niet, en `drager_bezet` zónder `drager`-parameter
   * evenmin. Dan staat de generieke uitweg er meteen. Mét een drager wachten we op
   * de kandidatenlijst (zie `carrierUnresolved`), zodat de link niet eerst
   * generiek en een tik later specifiek wordt.
   */
  const [exitTarget, setExitTarget] = useState<
    { kind: 'account'; accountId: string } | { kind: 'accounts' } | null
  >(
    (error === 'geen_koppeling' || error === 'drager_bezet') && !occupiedCarrierParam
      ? { kind: 'accounts' }
      : null,
  )
  /**
   * Heeft de gebruiker de URL-melding achter zich gelaten (bank gekozen, of zelf
   * opnieuw op verbinden geklikt)? Dan blijft ook de bijbehorende uitweg weg —
   * óók als de kandidatenlijst pas dáárna binnenkomt. Zonder deze grens kon een
   * laat binnenkomende lijst een uitweg onder een verse, ongerelateerde melding
   * schuiven.
   */
  const [urlErrorDismissed, setUrlErrorDismissed] = useState(false)

  // ── Doelrekening (fase 4) ───────────────────────────────────────────────────
  // De lijst komt via `GET /api/bank-connect/accounts`, niet via een directe
  // Supabase-read: deze pagina staat niet op de grandfather-allowlist in
  // `scripts/check-client-data-reads.mjs` en dat hoort zo te blijven (ADR 0058).
  const [accounts, setAccounts] = useState<TargetAccountOption[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountsLoaded, setAccountsLoaded] = useState(false)
  const [accountsError, setAccountsError] = useState<string | null>(null)
  /**
   * `none` = nog niets gekozen. Bewust géén stille voorselectie zolang er iets te
   * kiezen is: dat de app zelf een rekening uitkoos is precies wat dit plan
   * repareert. Is er niets te kiezen (verse gebruiker, SC-25) of kon de lijst niet
   * geladen worden, dan staat `new` voorgeselecteerd en loopt de wizard niet dood.
   *
   * Start óók op `none` — niet op `new`: tussen "bank gekozen" en "lijst binnen"
   * mag één snelle klik geen koppeling op een nieuwe rekening opleveren terwijl de
   * gebruiker de keuze nog niet heeft gezien.
   */
  const [selection, setSelection] = useState<TargetSelection>({ kind: 'none' })
  /** Voorgevinkt (B2); alleen van toepassing op een bestaande rekening zónder tracking. */
  const [enableBudgetTracking, setEnableBudgetTracking] = useState(true)

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    setAccountsError(null)
    try {
      const res = await fetch('/api/bank-connect/accounts')
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        console.error('Doelrekeningen laden mislukt', { status: res.status, error: data?.error })
        setAccounts([])
        setSelection({ kind: 'new' })
        setAccountsError('Je rekeningen konden niet worden geladen.')
        return
      }

      const list: TargetAccountOption[] = Array.isArray(data?.accounts) ? data.accounts : []
      setAccounts(list)
      setSelection(list.length > 0 ? { kind: 'none' } : { kind: 'new' })
      setAccountsLoaded(true)
    } catch (err) {
      console.error('Doelrekeningen verzoek mislukt', err)
      setAccounts([])
      setSelection({ kind: 'new' })
      setAccountsError('Je rekeningen konden niet worden geladen.')
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  /**
   * Bij `?error=drager_bezet` de lijst al op stap 1 laden — niet pas bij het
   * kiezen van een bank. De melding moet de banknaam en de uitweg kunnen noemen
   * op het moment dat de gebruiker hem leest, en `handleSelectBank` wist de
   * melding juist. `accountsLoaded` voorkomt dat er straks een tweede keer
   * geladen wordt.
   */
  useEffect(() => {
    if (!occupiedCarrierParam || accountsLoaded || accountsLoading) return
    void loadAccounts()
  }, [occupiedCarrierParam, accountsLoaded, accountsLoading, loadAccounts])

  /**
   * De bezette drager uit de eigen kandidatenlijst; `null` als hij er niet in
   * staat — óf er wél in staat maar niet bezet is.
   *
   * Die tweede voorwaarde is een echte grens en geen dubbelop. `?drager=` is
   * gebruikersinvoer: een gedeelde of geknutselde link
   * `?error=drager_bezet&drager=<een eigen, VRIJE rekening>` leverde anders
   * "Deze rekening is al gekoppeld aan …. Verbreek die koppeling eerst" over een
   * rekening waar niets op zit — een onware melding die de gebruiker naar het
   * verbreken van een wérkende koppeling duwt. `linked_provider_name` IS het
   * bezet-feit (zie `isSelectableTargetOption`), dus dat is waar we op toetsen.
   * Alleen eigen data, dus geen leak; wél een dwingende melding die niet klopt.
   */
  const occupiedCarrier = useMemo(() => {
    if (!occupiedCarrierParam) return null
    const match = accounts.find((a) => a.id === occupiedCarrierParam) ?? null
    return match?.linked_provider_name ? match : null
  }, [occupiedCarrierParam, accounts])

  /**
   * Is de vraag "wie is de drager?" nog open? Dan nog géén uitweg tonen: eerst de
   * generieke en een tik later de specifieke zou de link onder de cursor van de
   * gebruiker weg laten springen. `accountsLoaded` (geslaagd) en `accountsError`
   * (mislukt) zijn samen het volledige antwoord "we zijn klaar met zoeken".
   */
  const carrierUnresolved =
    occupiedCarrierParam !== null && !accountsLoaded && accountsError === null

  /**
   * Verbijzonder de melding zodra de drager bekend is. De tekst komt uit
   * `occupiedTargetAccountMessage` — dezelfde bron als de 409 van
   * `auth-link`/`relink` en als de uitleg onder de uitgeschakelde wizard-optie.
   * Eén melding, vier oppervlakken.
   *
   * Is de drager NIET aanwijsbaar en zijn we klaar met zoeken, dan blijft de
   * generieke melding staan en komt de generieke uitweg eronder.
   */
  useEffect(() => {
    if (urlErrorDismissed) return
    if (occupiedCarrier) {
      setConnectError(occupiedTargetAccountMessage(occupiedCarrier.linked_provider_name))
      setExitTarget({ kind: 'account', accountId: occupiedCarrier.id })
      return
    }
    if (occupiedCarrierParam && !carrierUnresolved) setExitTarget({ kind: 'accounts' })
  }, [occupiedCarrier, occupiedCarrierParam, carrierUnresolved, urlErrorDismissed])

  function handleSelectBank(provider: Provider) {
    setSelectedBank(provider)
    setStep('confirm')
    setConnectError(null)
    setExitTarget(null)
    setUrlErrorDismissed(true)
    // Pas laden wanneer de stap ook echt in beeld komt, en niet opnieuw bij
    // "Andere bank" — de lijst hangt niet van de gekozen bank af.
    if (!accountsLoaded) void loadAccounts()
  }

  function handleSelectTarget(next: TargetSelection) {
    setSelection(next)
    // Het vinkje is per rekening voorgevinkt: een eerdere "nee" bij rekening A
    // mag niet stil doorwerken op rekening B.
    setEnableBudgetTracking(true)
  }

  async function handleConnect() {
    if (!selectedBank) return
    if (selection.kind === 'none') return
    setConnecting(true)
    setConnectError(null)
    setExitTarget(null)
    setUrlErrorDismissed(true)

    // Vaste NL-fallback: de UI toont nooit een rauwe fetch-/SDK-/database-string.
    const GENERIC_ERROR = 'Verbinding maken is niet gelukt — probeer het later opnieuw.'

    try {
      const res = await fetch('/api/bank-connect/auth-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: selectedBank.id,
          provider_name: selectedBank.name,
          provider_logo: selectedBank.logo,
          // Alleen bij een bestaande rekening iets meesturen: "nieuw" is de
          // afwezigheid van een voorkeur, precies zoals de callback het al deed.
          ...(selection.kind === 'existing'
            ? {
                target_bank_account_id: selection.id,
                enable_budget_tracking: enableBudgetTracking,
              }
            : {}),
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.auth_url) {
        // De server levert al een NL-melding (zie toDutchAuthLinkError); die tonen
        // we, met de vaste NL-fallback als er geen bruikbare tekst is. Technische
        // details blijven in de console.
        console.error('Bank-connect auth-link mislukt', { status: res.status, error: data?.error })
        setConnectError(typeof data?.error === 'string' ? data.error : GENERIC_ERROR)
        setConnecting(false)
        return
      }

      // Redirect to bank authorization
      setStep('redirect')
      window.location.href = data.auth_url
    } catch (err) {
      // Netwerk-/parse-fouten (bv. "Failed to fetch") nooit rauw tonen.
      console.error('Bank-connect verzoek mislukt', err)
      setConnectError(GENERIC_ERROR)
      setConnecting(false)
    }
  }

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Bank koppelen" />
      {/* "Wat zie ik hier?" — de koppelpagina had als enige uitnodigings-
          oppervlak geen info-knop, terwijl juist hier de vertrouwensvraag
          speelt (UR3-15). Vaste plek: absolute child rechtsboven. */}
      <PageInfoButton
        content={getPageInfo('/core/cash/connect')}
        className="absolute right-4 top-4 sm:right-6"
      />
      {/* Editorial header — blueprint Type 7 (Wizard) */}
      <header className="mb-8 space-y-2 pr-10">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Cash · automatisch synchroniseren
        </div>
        <h1
          className="font-bold text-2xl sm:text-3xl tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Bank{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            koppelen
          </em>
        </h1>
        <p
          className="italic text-[14px] leading-snug text-[var(--ink-2)] pl-4"
          style={{
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            borderLeft: '2px solid var(--module-active-500)',
          }}
        >
          Koppel je bankrekening om transacties automatisch te synchroniseren.
        </p>
        {/* Stap 1 (bank kiezen) noemde alleen het gemak; de veiligheidsuitleg
            stond pas op de bevestigstap. Nu draagt ook het kies-moment de
            canonieke zin (UR3-15). De drie blokken op stap 2 blijven — dáár
            wordt beslist, dus daar mag het uitgebreider. */}
        <p className="mt-2 pl-4 text-[12px] leading-snug text-[var(--ink-3)]">
          {BANK_CONNECT_SAFETY_SHORT}
        </p>
      </header>

      {/* Error message. Bij een bezette drager (fase 7) staat de UITWEG eronder als
          echte link — "verbreek die koppeling eerst" zonder pad was in fase 6 een
          🔴 van de ux-review. Kunnen we de drager AANWIJZEN, dan hergebruikt dit
          `OccupiedAccountExit` (zelfde bestemming en woorden als de uitgeschakelde
          optie in de keuzelijst); kunnen we dat niet, dan de generieke uitweg naar
          de rekeningenlijst — zelfde tekst als op de success-pagina. Eén tekst per
          uitweg, drie oppervlakken. */}
      {connectError && (
        <div role="alert" className="mb-6 rounded-lg border border-negative/30 bg-negative-bg">
          <div className="flex items-start gap-2 px-4 py-3 text-sm text-negative">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{connectError}</span>
          </div>
          {exitTarget?.kind === 'account' && <OccupiedAccountExit accountId={exitTarget.accountId} />}
          {exitTarget?.kind === 'accounts' && (
            <div className="border-t border-[var(--border-ed)] px-3 py-2">
              <CashflowAccountsExit />
            </div>
          )}
        </div>
      )}

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {(['select', 'confirm', 'redirect'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {/* Tokens, geen Tailwind-standaardgrijs: `zinc-*` staat buiten de
                inkt-op-papier-ladder en verkleurt niet mee met het thema. */}
            {i > 0 && <div className="h-px w-8 bg-[var(--border-ed)]" />}
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              step === s
                ? 'bg-kern-500 text-white'
                : i < ['select', 'confirm', 'redirect'].indexOf(step)
                  ? 'bg-kern-100 text-kern-700'
                  : 'bg-[var(--subtle)] text-[var(--ink-3)]'
            }`}>
              {i + 1}
            </div>
            {/* Op klein scherm alleen het label van de huidige stap ZICHTBAAR:
                "Rekening & bevestigen" is te lang om naast twee andere labels op
                360px te passen. `sr-only` en niet `hidden`, zodat de inactieve
                stappen hun toegankelijke naam houden — anders hoort een
                screenreader-gebruiker op mobiel alleen kale cijfers. */}
            <span className={`text-xs font-medium ${
              step === s ? 'text-[var(--ink)]' : 'sr-only text-[var(--ink-3)] sm:not-sr-only sm:inline'
            }`}>
              {s === 'select' ? 'Kies bank' : s === 'confirm' ? 'Rekening & bevestigen' : 'Autoriseer'}
            </span>
          </div>
        ))}
      </div>

      {/* Step: Select bank */}
      {step === 'select' && (
        <BankSelector onSelect={handleSelectBank} />
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && selectedBank && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 rounded-[var(--r-lg)] border border-kern-200 bg-kern-50 p-4">
            {selectedBank.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedBank.logo} alt={selectedBank.name} className="h-12 w-12 rounded-lg object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-kern-100">
                <Building2 className="h-6 w-6 text-kern-600" />
              </div>
            )}
            <div>
              <p className="font-semibold text-[var(--ink)]">{selectedBank.name}</p>
              <p className="text-sm text-[var(--ink-3)]">Je wordt doorgestuurd om in te loggen</p>
            </div>
          </div>

          {/* Doelrekening kiezen — bovenaan, want dit is het besluit; de drie
              blokken erna zijn de voorwaarden waaronder het gebeurt. */}
          <TargetAccountChoice
            accounts={accounts}
            loading={accountsLoading}
            loadError={accountsError}
            selection={selection}
            onSelect={handleSelectTarget}
            enableBudgetTracking={enableBudgetTracking}
            onToggleBudgetTracking={setEnableBudgetTracking}
            providerName={selectedBank.name}
            disabled={connecting}
          />

          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-[var(--subtle)] p-3">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
              <div>
                <p className="text-sm font-medium text-[var(--ink-2)]">Veilige verbinding</p>
                <p className="text-xs text-[var(--ink-3)]">
                  Je inloggegevens worden nooit met ons gedeeld. De verbinding loopt via TrueLayer, een gereguleerde betaaldienstverlener met een PSD2-vergunning voor rekeninginformatie.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-[var(--subtle)] p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
              <div>
                <p className="text-sm font-medium text-[var(--ink-2)]">90 dagen geldig</p>
                <p className="text-xs text-[var(--ink-3)]">
                  De autorisatie is 90 dagen geldig. Daarna kun je eenvoudig opnieuw verbinden.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-[var(--subtle)] p-3">
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
              <div>
                <p className="text-sm font-medium text-[var(--ink-2)]">Alleen lezen</p>
                <p className="text-xs text-[var(--ink-3)]">
                  Wij kunnen alleen transacties en saldo&apos;s bekijken. Geen overboekingen of wijzigingen.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setStep('select'); setSelectedBank(null) }}
                className="rounded-lg border border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Andere bank
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting || accountsLoading || selection.kind === 'none'}
                className="flex-1 rounded-lg bg-kern-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
              >
                {connecting ? 'Verbinden…' : `Verbind met ${selectedBank.name}`}
              </button>
            </div>
            {/* Geen stille voorselectie, dus wél zeggen waarom de knop wacht. Niet
                tijdens het laden: dan wacht de knop op de lijst, niet op de gebruiker. */}
            {/* `--ink-2` en niet `--ink-3`: op 12px haalt `--ink-3` 3,65:1 en dus
                geen AA, en dit is de énige verklaring waarom de knop uit staat. */}
            {!accountsLoading && selection.kind === 'none' && (
              <p className="text-xs text-[var(--ink-2)]">
                Kies eerst waar de data terechtkomt.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step: Redirect */}
      {step === 'redirect' && (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-[var(--ink-2)]">
            Je wordt doorgestuurd naar je bank…
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Dit kan een moment duren. Sluit dit venster niet.
          </p>
        </div>
      )}
    </div>
  )
}
