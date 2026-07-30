/**
 * DE GEZONDHEID VAN EEN BANKKOPPELING — één afleiding voor alle oppervlakken.
 *
 * ## Waarom dit bestand bestaat
 *
 * Er zijn **vier** signalen die samen bepalen of een rekening vandaag door de
 * bank gevoed wordt:
 *
 *  1. `bank_connection_accounts.is_active` — heeft de gebruiker de koppeling zelf
 *     verbroken? (zachte ontkoppeling, `POST /api/bank-connect/disconnect`)
 *  2. `bank_connections.status` — `active` / `expired` / `revoked` / `pending`
 *  3. `bank_connections.token_expires_at` — de 90-dagen-autorisatie
 *  4. `bank_connection_accounts.last_synced_at` — wanneer er voor het laatst
 *     transacties binnenkwamen
 *
 * en **drie** oppervlakken die er iets over zeggen: het herkomst-symbool op de
 * rekeningkaart (`components/core/account-source-icon.tsx`), de bankverbindings-
 * sectie op de rekeningdetail (`connected-account-card.tsx`) en de status-badge
 * (`sync-status-badge.tsx`). Elk leidde het zelf af, elk uit een andere
 * combinatie. Zonder één afleiding drift "wat de kaart zegt" van "wat de
 * detailpagina zegt" — en dat is precies het soort drift dat de bundel-conventie
 * in `CLAUDE.md` verbiedt.
 *
 * Puur en zonder Supabase-import, zodat élke afnemer (server-loader, route,
 * component) dezelfde functie kan aanroepen. Het lezen van de rijen hoort in
 * `lib/bank-link-loader.ts`; de teksten horen in de components.
 *
 * Zie `specs/bank-connect-doelrekening/plan.md`, fase 7 (B6, SC-12/SC-13).
 */

/**
 * De toestand van een rekening, zoals de gebruiker haar op de kaart ziet.
 *
 *  - `linked` — wordt automatisch gevoed door een bankkoppeling;
 *  - `linked-broken` — was gekoppeld, kan nu niet meer ophalen: **verbinding
 *    kwijt**. Dit is de enige van de drie die om een handeling vraagt;
 *  - `manual` — geen (actieve) bankkoppeling. Handmatig of via import
 *    bijgehouden; dat is de normale toestand en géén afwijking.
 *
 * **`expired` en `revoked` zijn hier bewust ÉÉN toestand** (§0 van het plan).
 * Geen enkel codepad in deze app schrijft ooit `'revoked'` — dat onderscheid
 * bestaat alleen in het vocabulaire van de kolom, niet in het gedrag. Een
 * toestand die niet kan optreden wordt nooit getest en gaat dus stil rotten; en
 * de copy zou een verschil suggereren dat de app niet kent.
 */
export type BankLinkState = 'linked' | 'linked-broken' | 'manual'

/**
 * De vier rauwe signalen van één koppelrij. `null`/`undefined` als geheel =
 * er is géén koppelrij, en dan is het antwoord `manual`.
 */
export type BankLinkSignals = {
  /**
   * `bank_connection_accounts.is_active`.
   *
   * **`false` is gebruikersintentie, geen storing.** De zachte ontkoppeling
   * (`disconnect`) laat de rij staan zodat een latere reconnect haar hergebruikt
   * in plaats van dupliceert. Zo'n rekening is dus `manual` en NIET
   * `linked-broken`: de gebruiker heeft dit zelf gedaan en hoeft niets te
   * herstellen. Deze regel staat bewust vóór de statuscontrole — anders zou een
   * bewust verbroken koppeling waarvan de autorisatie daarna verliep alsnog om
   * aandacht gaan vragen.
   */
  linkIsActive: boolean
  /** `bank_connections.status`. */
  connectionStatus: string | null
  /** `bank_connections.token_expires_at` (ISO-string). */
  tokenExpiresAt: string | null
  /**
   * `bank_connection_accounts.last_synced_at`.
   *
   * Bewust GEEN onderdeel van het verdict: een verse koppeling die nog nooit
   * gesynchroniseerd heeft is gezond, en een koppeling die lang niet gedraaid
   * heeft is niet kapot — synchroniseren is een handmatige actie. Het signaal
   * reist wél mee in {@link BankLinkHealth}, zodat de detailpagina en de badge
   * hun versheidstekst uit hetzelfde object lezen in plaats van een eigen
   * leesronde te doen.
   */
  lastSyncedAt: string | null
}

/**
 * Hoeveel dagen vóór het verlopen van de autorisatie de vooraankondiging
 * spreekt. Spiegelt de drempel die `sync-status-badge.tsx` al hanteerde.
 */
export const BANK_LINK_EXPIRY_WARNING_DAYS = 14

/**
 * Het volledige oordeel over één koppeling.
 *
 * `state` is wat de rekeningkaart toont; `expiringSoon`/`daysUntilExpiry` zijn
 * de nuance die **bewust niet** op de kaart hoort (zie {@link deriveBankLinkHealth}).
 */
export type BankLinkHealth = {
  state: BankLinkState
  /**
   * Dagen tot de autorisatie verloopt (negatief = al verlopen), of `null` als er
   * geen einddatum bekend is. Zelfde afronding als de badge altijd deed
   * (`Math.ceil` op hele dagen), zodat de bestaande tekst niet verspringt.
   */
  daysUntilExpiry: number | null
  /**
   * De 90-dagen-vooraankondiging: de koppeling werkt nog, maar verloopt binnen
   * {@link BANK_LINK_EXPIRY_WARNING_DAYS} dagen.
   *
   * **Deze vlag hoort NIET op het kaart-icoon.** De autorisatie verloopt elk
   * kwartaal, dus het icoon zou elk kwartaal twee weken lang om aandacht vragen
   * zonder dat er iets stuk is — en dan leert de gebruiker het te negeren, ook
   * op het moment dat het wél stuk is. Het icoon spreekt pas als de verbinding
   * daadwerkelijk kwijt is.
   *
   * **Waar de vooraankondiging vandaag WÉL leeft: alleen op de rekeningdetail**
   * (`connected-account-card.tsx`), dus alleen als de gebruiker er zelf naartoe
   * navigeert. Een proactief kanaal — een notificatie of een regel in de briefing —
   * bestaat nog niet; `app/api/notifications` waarschuwt op sync-VERSHEID
   * (`last_synced_at`), niet op een aflopende autorisatie. Dat is een bewust
   * openstaand punt (fase 7, restpunt), geen bestaande voorziening: bouw er geen
   * redenering op alsof de gebruiker het al te zien krijgt.
   */
  expiringSoon: boolean
  /** Doorgegeven signaal 4 — zie {@link BankLinkSignals.lastSyncedAt}. */
  lastSyncedAt: string | null
}

/** Statuswaarden van `bank_connections.status` die "kan niet meer ophalen" betekenen. */
const BROKEN_CONNECTION_STATUSES = new Set(['expired', 'revoked'])

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Dagen tot `tokenExpiresAt`, of `null` bij een ontbrekende of onleesbare datum.
 *
 * Een onleesbare datum levert bewust `null` en niet "verlopen": een rekening
 * kapot verklaren op grond van een kolom die we niet konden parsen is erger dan
 * hem gezond noemen — de statuskolom en de eerstvolgende mislukte refresh vangen
 * een echte expiratie alsnog.
 */
function daysUntil(tokenExpiresAt: string | null, now: Date): number | null {
  if (!tokenExpiresAt) return null
  const expiry = new Date(tokenExpiresAt)
  const time = expiry.getTime()
  if (!Number.isFinite(time)) return null
  return Math.ceil((time - now.getTime()) / MS_PER_DAY)
}

/**
 * Het volledige oordeel over één koppeling — de ENIGE plek waar de vier signalen
 * tot een toestand worden samengevoegd.
 *
 * De volgorde van de regels is het contract:
 *
 *  1. **geen koppelrij** → `manual`.
 *  2. **`is_active = false`** → `manual`. Gebruikersintentie wint van alles wat
 *     erna komt (zie {@link BankLinkSignals.linkIsActive}).
 *  3. **status `expired`/`revoked`** → `linked-broken`.
 *  4. **autorisatie verstreken** (`token_expires_at` in het verleden) →
 *     `linked-broken`. Nodig náást (3): de status wordt pas op `expired` gezet
 *     door een mislukte token-refresh, en die draait alleen als er iemand
 *     synchroniseert. Tot dat moment is de datum het enige eerlijke signaal.
 *  5. anders → `linked`.
 *
 * `pending` is bewust géén vierde uitkomst. De callback zet de verbinding op
 * `active` vóórdat hij koppelrijen schrijft, dus een actieve koppelrij op een
 * `pending`-verbinding kan niet ontstaan — en een toestand die niet kan
 * optreden, wordt nooit getest.
 *
 * @param now Injecteerbaar voor tests; standaard de systeemtijd.
 */
export function deriveBankLinkHealth(
  signals: BankLinkSignals | null | undefined,
  now: Date = new Date(),
): BankLinkHealth {
  if (!signals || !signals.linkIsActive) {
    return { state: 'manual', daysUntilExpiry: null, expiringSoon: false, lastSyncedAt: null }
  }

  const daysUntilExpiry = daysUntil(signals.tokenExpiresAt, now)
  const statusBroken = !!signals.connectionStatus && BROKEN_CONNECTION_STATUSES.has(signals.connectionStatus)
  const tokenElapsed = daysUntilExpiry !== null && daysUntilExpiry < 0

  const state: BankLinkState = statusBroken || tokenElapsed ? 'linked-broken' : 'linked'

  return {
    state,
    daysUntilExpiry,
    expiringSoon:
      state === 'linked' &&
      daysUntilExpiry !== null &&
      daysUntilExpiry >= 0 &&
      daysUntilExpiry <= BANK_LINK_EXPIRY_WARNING_DAYS,
    lastSyncedAt: signals.lastSyncedAt,
  }
}

/** Kortste vorm: alleen de kaart-toestand. Dunne wrapper, géén tweede regel. */
export function deriveBankLinkState(
  signals: BankLinkSignals | null | undefined,
  now: Date = new Date(),
): BankLinkState {
  return deriveBankLinkHealth(signals, now).state
}

// ─────────────────────────────────────────────────────────────────────────────
// De loader-vorm die de cash-oppervlakken consumeren
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wat de server-loader per TriFinity-bankrekening oplevert: de koppelstatus plus
 * het minimum dat de herstelactie nodig heeft.
 *
 * **Dit is het ene loader-veld waar `cash-overview.tsx` en `cash-account-view.tsx`
 * beide uit lezen.** Vóór fase 7 leidden ze de koppelstatus élk zelf af uit een
 * eigen client-directe read op `bank_connection_accounts` — twee afleidingen, twee
 * kansen op drift, en een derde erbij zou de latere ADR-0058-slice strikt
 * moeilijker maken. Woont in dit pure bestand (en niet in de loader) omdat een
 * `'use client'`-component het type moet kunnen importeren zonder de
 * Supabase-server-module mee te trekken.
 */
export type CashBankLink = {
  /** `bank_accounts.id` — de sleutel voor `cash-account-view`. */
  bankAccountId: string
  /**
   * `assets.id` van het gekoppelde cash-bezit, of `null` als de rekening er geen
   * heeft. De sleutel voor de rekeningkaarten op cashflow, die op bezittingen
   * itereren.
   */
  assetId: string | null
  /** Het oordeel uit {@link deriveBankLinkState}. */
  state: BankLinkState
  /**
   * `bank_connection_accounts.id` van de koppeling waar dit oordeel over gaat, of
   * `null` bij `manual`. De herstelactie heeft 'm nodig: `auth-link` leidt de
   * doelrekening hieruit af in plaats van 'm van de client aan te nemen.
   */
  connectionAccountId: string | null
  /** Banknaam, voor "verbinding met ING kwijt". `null` als die niet te lezen is. */
  providerName: string | null
}

/** De koppelstatus van één cash-bezitting. Onbekend bezit → `manual`. */
export function bankLinkForAsset(links: CashBankLink[], assetId: string): BankLinkState {
  return links.find((l) => l.assetId === assetId)?.state ?? 'manual'
}

/** De volledige koppelrij van één cash-bezitting, of `null`. */
export function bankLinkRowForAsset(links: CashBankLink[], assetId: string): CashBankLink | null {
  return links.find((l) => l.assetId === assetId) ?? null
}

/** De volledige koppelrij van één bankrekening, of `null`. */
export function bankLinkRowForAccount(
  links: CashBankLink[],
  bankAccountId: string,
): CashBankLink | null {
  return links.find((l) => l.bankAccountId === bankAccountId) ?? null
}
