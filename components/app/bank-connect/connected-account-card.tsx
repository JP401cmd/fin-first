'use client'

import { useState } from 'react'
import { RefreshCw, Unlink, Building2, AlertTriangle, Clock } from 'lucide-react'
import { SyncStatusBadge } from './sync-status-badge'
import type { LinkedAccountView } from '@/lib/truelayer/linked-account'
import { BANK_DAILY_REQUEST_LIMIT, effectiveDailyRequests } from '@/lib/bank-connection-status'
import { startBankRelink } from '@/lib/truelayer/start-relink'

/**
 * DE BANKVERBINDING op de rekeningdetail — status, synchroniseren, verbreken en
 * (sinds fase 7, B6/SC-12) het HERSTELPAD.
 *
 * ## Eén afleiding, drie oppervlakken — en sinds de kolom-drop server-side
 *
 * De toestand komt uit `deriveBankLinkHealth` (`lib/bank-connection-status.ts`),
 * net als op het herkomst-symbool en in de status-pil. Hier stond tot fase 7 een
 * eigen `status === 'expired' || 'revoked'`; die kopie is weg. Leid dus nergens
 * in dit bestand iets af uit `status`, `token_expires_at` of `is_active`.
 *
 * Sinds de voorbereiding op het droppen van de plaintext IBAN-kolommen draait die
 * afleiding niet eens meer in deze client: de kaart consumeert een
 * {@link LinkedAccountView} uit `GET /api/bank-connect/linked-accounts`, en die
 * route dráágt het oordeel al (`health`). De aanleiding was niet het oordeel maar
 * de IBAN — dit oppervlak las `bank_connection_accounts` client-direct en was
 * daarmee de laatste lezer van `bank_connection_accounts.iban`. Ontsleutelen kan
 * de browser niet (de sleutel is server-only), dus de enige uitweg was de hele
 * leesronde naar de server verplaatsen. Dat neemt en passant de client-directe
 * weergave-read weg die ADR 0058 verbiedt.
 *
 * Gevolg voor de identiteitsregel onder de banknaam: er komt nog maar een
 * IBAN-STAARTJE de server uit (`iban_tail`, vier tekens), geen volledige IBAN.
 * Zelfde afweging als op de success-pagina — genoeg om een rekening te herkennen,
 * één plek minder waar een volledige IBAN in een clientbundel of screenshot belandt.
 *
 * ## Dit is het ENIGE oppervlak met de 14-dagen-vooraankondiging
 *
 * De autorisatie verloopt elk kwartaal. Zou het kaart-icoon op cashflow die
 * vooraankondiging dragen, dan waarschuwt het vier keer per jaar twee weken lang
 * zonder dat er iets stuk is — en dan leert de gebruiker het te negeren op het
 * moment dat het wél stuk is. Daarom: het icoon spreekt pas bij `linked-broken`,
 * en de nuance "werkt nog, verloopt over N dagen" leeft alléén hier, als
 * vriendelijk aanbod in plaats van als alarm.
 *
 * "Alleen hier" is letterlijk te nemen: een proactief kanaal — een notificatie of
 * een regel in de briefing — bestaat niet. `app/api/notifications` waarschuwt op
 * sync-VERSHEID (`last_synced_at`), niet op een aflopende autorisatie. De
 * gebruiker ziet deze nuance dus uitsluitend als hij zelf naar de rekeningdetail
 * navigeert; bouw geen redenering op alsof hij gewaarschuwd ís.
 *
 * `expiringSoon` en `linked-broken` sluiten elkaar per constructie uit —
 * `deriveBankLinkHealth` zet `expiringSoon` alleen bij `state === 'linked'`.
 *
 * ## Herstel in twee klikken, niet de hele wizard opnieuw
 *
 * De knop postte tot fase 7 niets: hij deed `router.push('/core/cash/connect')`
 * via `onReauthorize`, dus de gebruiker kreeg de volledige koppelwizard —
 * inclusief een doelrekening-keuze die hij bij een herautorisatie niet kán
 * beantwoorden (de rekening staat al vast, en `external_account_id` claimt hem
 * bij de callback sowieso terug). Nu gaat er één `POST
 * /api/bank-connect/auth-link` met `relink_connection_account_id` uit en volgt de
 * redirect naar de bank. De server leidt de doelrekening ÉN `link_intent:
 * 'herautoriseren'` uit die koppeling af; deze client stuurt bewust géén
 * `target_bank_account_id` mee. `provider_id` moet er wél bij — dat eist het
 * zod-schema van die route op beide paden; zie de noot bij het veld.
 *
 * `onReauthorize` blijft bestaan als VAL-TERUG: mislukt de POST, dan is de
 * wizard nog altijd een werkende (langere) route, aangeboden als expliciete
 * tweede knop in de melding. Niet stil automatisch navigeren — dan verdwijnt de
 * uitleg waarom de korte weg niet lukte.
 *
 * ## Copy: neutraal, niet status-specifiek
 *
 * `bank_connections.status` kent `expired` én `revoked`, maar geen enkel codepad
 * schrijft ooit `revoked`. Dus "verbinding kwijt" / "verbind opnieuw", nooit
 * "ingetrokken door je bank" — dat zou een detectie suggereren die de app niet
 * heeft.
 *
 * Zie `specs/bank-connect-doelrekening/plan.md`, fase 7.
 */

type ConnectedAccountCardProps = {
  /**
   * De koppelrij zoals `GET /api/bank-connect/linked-accounts` haar levert —
   * inclusief het server-afgeleide `health`-oordeel en het IBAN-staartje. Bewust
   * dezelfde wire-vorm als de success-pagina consumeert: twee oppervlakken die
   * over één koppeling praten horen niet elk hun eigen vorm te hebben.
   */
  account: LinkedAccountView
  onSync: () => void
  onDisconnect: () => void
  /**
   * Val-terug wanneer de directe herkoppeling niet lukt: opent de volledige
   * koppelwizard. Bewust behouden — de korte weg is een gemak, geen enige weg.
   */
  onReauthorize: () => void
}

/** Vaste NL-meldingen. De UI toont nooit een rauwe fetch-/SDK-/driverstring. */
const SYNC_ERROR = 'Synchroniseren is niet gelukt — probeer het later opnieuw.'
const DISCONNECT_ERROR = 'Verbinding verbreken is niet gelukt — probeer het later opnieuw.'
// De herkoppel-melding woont in `lib/truelayer/start-relink.ts`, bij de fetch die
// haar nodig heeft — twee oppervlakken delen die actie én die tekst.

/**
 * Foutcodes uit de gedeelde envelope (ADR 0044) waarvan de tekst NIET voor de
 * gebruiker geschreven is: `validation_error` levert een veldpad
 * (`provider_id: …`) en `server_error` een generieke technische afhandeling. Voor
 * die twee wint onze eigen NL-melding; de curateerde teksten (409 "deze rekening
 * is al bezet", 400 "bestaat niet of is niet van jou", 503 "nog niet
 * ingeschakeld") mogen wél door — daar staat juist de uitweg in.
 */
const UNCURATED_ERROR_CODES = new Set(['validation_error', 'server_error'])

/**
 * De herstelknop: INKT OP PAPIER, geen `text-warning` op `--warning-bg`.
 *
 * Die combinatie haalt 4,48:1 (gemeten op de tokens in `app/globals.css`:
 * `--warning` → luminantie 0,1634, `--warning-bg` → 0,9063) en blijft daarmee
 * onder de 4,5:1 die AA voor tekst ≤18px eist. De warning-tint zit dus in de
 * BAND (rand, vlak, icoon — een grafisch element mag op 3:1) en de tekst staat op
 * inkt. `--ink-2` haalt 8,3:1 op datzelfde vlak.
 *
 * `min-h-[44px]`: raakteldoel. Zelfde klasse-set als de herstelknop op
 * `VermogenAssetCard`, zodat de twee oppervlakken één systeem vormen.
 */
const RECOVERY_BUTTON =
  'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 self-start bg-[var(--paper)] px-2.5 text-xs font-medium text-[var(--ink)] shadow-[var(--s0)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:opacity-50 sm:ml-auto sm:self-auto'

/**
 * Hetzelfde aanbod als tekstlink, voor de vooraankondiging: daar is niets stuk,
 * dus geen opgetilde knop. Wél 44px hoog (het was een kale ~16px tekstlink) en
 * `--ink` in plaats van `text-kern-700`: 12px op een gebruikersinstelbare
 * accentkleur is grensgeval-AA, en de gebruiker kan die kleur lichter zetten.
 * Zelfde argument dat `vermogen-asset-card.tsx` al maakt.
 */
const RECOVERY_TEXT_LINK =
  'inline-flex min-h-[44px] shrink-0 items-center self-start px-1 text-xs font-medium text-[var(--ink)] underline decoration-[var(--border-ed)] underline-offset-2 transition-colors hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:opacity-50 sm:ml-auto sm:self-auto'

function safeServerMessage(data: unknown, fallback: string): string {
  const envelope = data as { error?: unknown; code?: unknown } | null
  const message = envelope?.error
  const code = envelope?.code
  if (typeof message !== 'string' || message.trim().length === 0) return fallback
  if (typeof code === 'string' && UNCURATED_ERROR_CODES.has(code)) return fallback
  return message
}

/** "vandaag" / "over 1 dag" / "over 9 dagen" — nooit een kaal getal in een zin. */
function expiryPhrase(days: number | null): string {
  if (days === null) return 'binnenkort'
  if (days <= 0) return 'vandaag'
  if (days === 1) return 'over 1 dag'
  return `over ${days} dagen`
}

export function ConnectedAccountCard({ account, onSync, onDisconnect, onReauthorize }: ConnectedAccountCardProps) {
  const [syncing, setSyncing] = useState(false)
  /**
   * `alreadyKnown` vouwt beide dedup-lagen samen — exact zoals de success-pagina
   * het doet. Of een boeking op de hash (`duplicates`) of cross-bron
   * (`duplicates_cross_source`) is herkend, ze stond er al; die splitsing is
   * techniek. Zonder laag 2 telde deze kaart lager dan de success-pagina over
   * dezelfde sync.
   */
  const [syncResult, setSyncResult] = useState<{
    new: number
    alreadyKnown: number
    /** Nieuwe rijen die als eigen-rekening-verschuiving zijn geboekt (geen uitgave). */
    ownTransfers: number
  } | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [relinking, setRelinking] = useState(false)
  /**
   * Eén inline melding voor alle drie de acties — geen `alert()`: dat is geen
   * meldingpatroon dat deze app elders gebruikt, het is niet voorleesbaar en het
   * blokkeert de pagina.
   */
  const [actionError, setActionError] = useState<string | null>(null)
  /** Is de korte herkoppelweg gestrand? Dan pas de wizard aanbieden. */
  const [relinkFailed, setRelinkFailed] = useState(false)
  /**
   * Vroeg de server om opnieuw verbinden? `POST /api/bank-connect/sync` antwoordt
   * met 401 zodra de token-refresh niet lukt — en zet tegelijk
   * `bank_connections.status = 'expired'`. Dat is het meest voorkomende moment
   * waarop een verbinding kwijtraakt, en de props van deze kaart zijn dan nog de
   * oude (de statuskolom draaide net om, de pagina is nog niet herladen). Zonder
   * deze vlag las de gebruiker "verbind opnieuw" zonder dat er iets stond om op te
   * klikken: de melding komt dóór via `safeServerMessage`, maar `linked-broken` was
   * op dat moment nog niet uit de props af te leiden.
   */
  const [syncNeedsRelink, setSyncNeedsRelink] = useState(false)

  const health = account.health
  const linkLost = health.state === 'linked-broken'
  /**
   * De banknaam ontbreekt alleen als de embed van de verbinding niet meekwam;
   * "je bank" is dan eerlijker dan een lege plek midden in een zin.
   */
  const providerName = account.provider_name ?? 'je bank'
  /**
   * Staat het herstel-aanbod al bóven de melding? Dan niet nog een keer erin.
   * Beide banden (verbinding kwijt, vooraankondiging) dragen zelf een "Verbind
   * opnieuw"; de melding vult alleen de gaten die zij openlaten.
   */
  const relinkOfferedAbove = linkLost || health.expiringSoon

  // Teller weergeven, maar alleen als hij over vandáág gaat — de regel (inclusief
  // de Europe/Amsterdam-dagsleutel en het waarom daarvan) woont in
  // `effectiveDailyRequests`, naast de limiet zelf. Stond hier eerst met de hand;
  // de derde lezer had de controle vergeten en toonde de stand van gisteren.
  //
  // Vriendelijkheid, geen grens: de echte rem is de RPC. Deze kaart mag hooguit
  // te vroeg blokkeren, nooit iets doorlaten dat de server zou weigeren.
  const dailyRequests = effectiveDailyRequests(account)
  const canSync = dailyRequests < BANK_DAILY_REQUEST_LIMIT && !linkLost

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    setActionError(null)
    setSyncNeedsRelink(false)
    try {
      const res = await fetch('/api/bank-connect/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_account_id: account.id }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setSyncResult({
          new: data?.new ?? 0,
          alreadyKnown: (data?.duplicates ?? 0) + (data?.duplicates_cross_source ?? 0),
          ownTransfers: data?.own_account_transfers ?? 0,
        })
        onSync()
      } else {
        console.error('Bank-connect sync mislukt', { status: res.status, error: data?.error })
        setActionError(safeServerMessage(data, SYNC_ERROR))
        // 401 = de autorisatie is niet meer te verversen. De melding zegt "verbind
        // opnieuw"; dan moet die handeling er ook staan. Geen enkele toestand mag
        // om iets vragen dat je niet kunt doen.
        if (res.status === 401) setSyncNeedsRelink(true)
      }
    } catch (err) {
      console.error('Bank-connect sync-verzoek mislukt', err)
      setActionError(SYNC_ERROR)
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    setActionError(null)
    // Eén melding voor drie acties: dan mag er ook maar één uitweg-aanbod aan
    // hangen. Een herstelknop die bij een verbreek-fout blijft staan hoort bij de
    // vorige poging, niet bij deze melding.
    setSyncNeedsRelink(false)
    try {
      const res = await fetch('/api/bank-connect/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_account_id: account.id }),
      })
      if (res.ok) {
        onDisconnect()
      } else {
        const data = await res.json().catch(() => null)
        console.error('Bank-connect verbreken mislukt', { status: res.status, error: data?.error })
        setActionError(safeServerMessage(data, DISCONNECT_ERROR))
      }
    } catch (err) {
      console.error('Bank-connect verbreek-verzoek mislukt', err)
      setActionError(DISCONNECT_ERROR)
    } finally {
      setDisconnecting(false)
      setConfirmDisconnect(false)
    }
  }

  /**
   * De herstelactie: één POST, dan door naar de bank. Geen doelrekening in de
   * body — de server leidt die uit de koppeling af, precies zodat de gebruiker
   * hier geen keuze krijgt die hij niet kan maken.
   */
  async function handleRelink() {
    setRelinking(true)
    setActionError(null)
    setRelinkFailed(false)
    setSyncNeedsRelink(false)

    // De POST, de foutcuratie en de NL-fallback wonen in `startBankRelink`: de
    // rekeningkaart op cashflow start exact dezelfde herstelactie, en twee
    // fetch-blokken met elk hun eigen foutafhandeling lopen binnen één release
    // uiteen. Navigeren blijft hier — dat is de beslissing van dit oppervlak.
    const result = await startBankRelink(account.id)

    if (!result.ok) {
      setActionError(result.message)
      setRelinkFailed(true)
      setRelinking(false)
      return
    }

    // Volledige navigatie, geen router.push: we verlaten de app naar de bank.
    window.location.href = result.authUrl
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <div className="flex items-start justify-between gap-3">
        {/* `min-w-0` + `truncate` op de IBAN: de status-pil zegt sinds fase 7
            "Verbinding kwijt" in plaats van "Verlopen" (één woord per concept) en
            is daarmee breder. Op 360px moet de identiteit inschikken, niet de pil
            afbreken. */}
        <div className="flex min-w-0 items-center gap-3">
          {account.provider_logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={account.provider_logo}
              alt={providerName}
              className="h-10 w-10 object-contain"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center bg-[var(--subtle)]">
              <Building2 aria-hidden className="h-5 w-5 text-[var(--ink-3)]" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">{providerName}</p>
            {/* Staartje, geen volledige IBAN — de server geeft er niet meer dan
                vier tekens uit. Zelfde notatie als de success-pagina. */}
            {account.iban_tail && (
              <p className="truncate text-xs text-[var(--ink-3)]">···· {account.iban_tail}</p>
            )}
          </div>
        </div>

        <SyncStatusBadge health={health} dailyRequests={dailyRequests} />
      </div>

      {/* Verbinding kwijt — de énige toestand die om een handeling vraagt.
          `--warning` en niet `--negative`: de autorisatie verloopt elk kwartaal,
          dat is verwacht onderhoud, geen verlies. Zelfde tint als het
          herkomst-symbool voor dezelfde toestand. */}
      {linkLost && (
        <div className="mt-3 flex flex-col gap-2 border border-warning/30 bg-warning-bg px-3 py-2.5 sm:flex-row sm:items-center">
          {/* Tekst op inkt, tint in rand/vlak/icoon — zie de noot bij
              RECOVERY_BUTTON: `text-warning` op `--warning-bg` haalt 4,48:1 en
              blijft daarmee onder AA voor tekst op deze maat. */}
          <p className="flex min-w-0 items-start gap-2 text-xs text-[var(--ink-2)]">
            <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              Verbinding kwijt — we halen geen nieuwe transacties meer op bij{' '}
              {providerName}. Verbind opnieuw om weer bij te werken.
            </span>
          </p>
          <button
            type="button"
            onClick={handleRelink}
            disabled={relinking}
            aria-busy={relinking}
            className={RECOVERY_BUTTON}
          >
            {relinking ? 'Verbinden…' : 'Verbind opnieuw'}
          </button>
        </div>
      )}

      {/* De vooraankondiging: werkt nog, verloopt binnenkort. Rustig vlak, geen
          stoplicht — alleen de klok draagt de warning-tint. Het aanbod is een
          tekstknop, niet een opgetilde knop: er is niets stuk. */}
      {health.expiringSoon && (
        <div className="mt-3 flex flex-col gap-1.5 border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
          <p className="flex min-w-0 items-start gap-2 text-xs text-[var(--ink-2)]">
            <Clock aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              De verbinding met {providerName} werkt nog en verloopt{' '}
              {expiryPhrase(health.daysUntilExpiry)}. Je kunt nu al opnieuw verbinden.
            </span>
          </p>
          <button
            type="button"
            onClick={handleRelink}
            disabled={relinking}
            aria-busy={relinking}
            className={RECOVERY_TEXT_LINK}
          >
            {relinking ? 'Verbinden…' : 'Verbind opnieuw'}
          </button>
        </div>
      )}

      {/* Eén inline melding voor sync, verbreken en herkoppelen. `--negative`:
          hier gíng iets mis, anders dan een verlopen autorisatie. */}
      {actionError && (
        <div
          role="alert"
          className="mt-3 flex flex-col gap-2 border border-negative/30 bg-negative-bg px-3 py-2.5 sm:flex-row sm:items-center"
        >
          <p className="flex min-w-0 items-start gap-2 text-xs text-negative">
            <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{actionError}</span>
          </p>
          {/* Twee uitwegen, in volgorde van kortste weg:
              (1) strandde de directe herkoppeling, dan de volledige koppelwizard —
                  en alléén dan, anders is het een tweede knop zonder aanleiding;
              (2) vroeg de sync om opnieuw verbinden (401), dan de directe
                  herkoppeling, want die is nog niet geprobeerd.
              `relinkOfferedAbove` voorkomt een tweede "Verbind opnieuw" naast de
              band die 'm al draagt — twee identieke knoppen in één kaart is geen
              keuze maar een raadsel. */}
          {relinkFailed ? (
            <button type="button" onClick={onReauthorize} className={RECOVERY_BUTTON}>
              Open de koppelwizard
            </button>
          ) : syncNeedsRelink && !relinkOfferedAbove ? (
            <button
              type="button"
              onClick={handleRelink}
              disabled={relinking}
              aria-busy={relinking}
              className={RECOVERY_BUTTON}
            >
              {relinking ? 'Verbinden…' : 'Verbind opnieuw'}
            </button>
          ) : null}
        </div>
      )}

      {/* Sync result. "Al bekend" is één begrip voor de gebruiker — dezelfde
          woorden als op de success-pagina, inclusief dedup-laag 2. */}
      {syncResult && (
        <div className="mt-3 bg-positive-bg px-3 py-2 text-xs text-positive" aria-live="polite">
          {syncResult.new} nieuwe transacties, {syncResult.alreadyKnown} al bekend
          {/* Verschuivingen tussen je eigen rekeningen tellen niet als uitgave.
              Alleen tonen als het gebeurd is — een "0" zou ruis zijn. */}
          {syncResult.ownTransfers > 0 && (
            <>
              {', '}
              {syncResult.ownTransfers === 1
                ? 'waarvan 1 overboeking tussen eigen rekeningen'
                : `waarvan ${syncResult.ownTransfers} overboekingen tussen eigen rekeningen`}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={!canSync || syncing}
          className="inline-flex items-center gap-1.5 bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchroniseren…' : 'Synchroniseer'}
        </button>

        {confirmDisconnect ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-negative">Zeker weten?</span>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="bg-negative px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Ja, verbreken
            </button>
            <button
              onClick={() => setConfirmDisconnect(false)}
              className="px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Annuleer
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDisconnect(true)}
            className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            <Unlink aria-hidden className="h-3.5 w-3.5" />
            Verbreken
          </button>
        )}

        <span className="ml-auto text-xs text-[var(--ink-3)]">
          {dailyRequests}/10 verzoeken vandaag
        </span>
      </div>
    </div>
  )
}
