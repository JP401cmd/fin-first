// Bijwerken bij openen (W-018, ADR 0182): welke koppelingen gaan vanzelf mee?
//
// /overzicht start bij het laden op de achtergrond de BESTAANDE sync-routes voor
// bank- en brokerkoppelingen die te lang niet zijn bijgewerkt. Dit bestand is de
// pure beslissing daarachter — geen fetch, geen React, klok injecteerbaar — zodat
// de grenzen testbaar zijn zonder klok-truc. De uitvoering woont in
// `components/sync/automatisch-bijwerken.tsx` en loopt via `triggerGlobalSync`,
// dus met dezelfde rem, dezelfde meldingen en dezelfde `router.refresh()` als de
// knop.
//
// WAT HIER BEWUST NIET MEEGAAT
//  • Een koppeling die nog NOOIT synchroniseerde. Het correctiemoment van ADR
//    0069 (een verkeerd gelande koppeling verhangen) leeft alleen zolang er geen
//    transacties zijn; een automatische ronde zou het stil sluiten. De eerste
//    ophaal is van ADR 0158 of van de gebruiker zelf.
//  • Een kapotte of dragerloze bankkoppeling, en een brokerkoppeling waarvan de
//    sleutel niet meer werkt (ongeldig of zonder leesrechten). Een automatische
//    poging heeft daar geen kans van slagen en zou bij élk bezoek dezelfde rode
//    melding geven (en bij de bank een dagtik kosten). De koppelingen-pagina toont
//    de fout en de uitweg. Een TIJDELIJKE brokerfout (rem, netwerk) blokkeert
//    niet: die gaat de volgende keer gewoon weer mee.
//  • Een bankkoppeling die vandaag al `AUTO_SYNC_MAX_DAILY_REQUESTS` verzoeken
//    kostte. `last_synced_at` beweegt niet bij een mislukte sync, en de
//    poging-stempel van de sessie is na een herlaad weg — de dagteller is het
//    enige duurzame teken dat er vandaag al geprobeerd is.
//  • Exchanges en wallets: die heeft de avond-cron al (`vercel.json`).

import { PERMANENT_BROKER_ERRORS } from '@/lib/integrations/broker-error-messages'
import {
  BANK_AUTO_SYNC_INTERVAL_MS,
  type BankSyncTarget,
  type BrokerSyncTarget,
} from '@/lib/sync/global-sync'

/**
 * Vanaf hoe oud een koppeling vanzelf wordt bijgewerkt: twaalf uur.
 *
 * Twee keer per dag is vers genoeg voor saldi en transacties (banken boeken in
 * batches), en houdt het verbruik op de bank-dagrem (10 per rekening) ruim onder
 * de reserve van de handmatige knop: hooguit twee automatische tikken per dag.
 */
export const AUTO_SYNC_STALE_MS = 12 * 60 * 60 * 1000

/**
 * Hoeveel verzoeken een bankkoppeling vandaag al mag hebben gekost om nog
 * automatisch mee te gaan. Met de twaalf-uursgrens is dat precies "hooguit twee
 * automatische tikken per dag" — óók als een sync telkens mislukt, en ver onder
 * de reserve die de globale knop voor handmatig vrijhoudt
 * (`BANK_AUTO_SYNC_HEADROOM`). Handmatige syncs van vandaag tellen mee: wie al
 * twee keer zelf synchroniseerde, heeft geen automatische ronde meer nodig.
 */
export const AUTO_SYNC_MAX_DAILY_REQUESTS = 2

/**
 * Hoe lang een apparaat de automatische ronde "claimt" nadat een tabblad hem
 * startte. Binnen dit venster kijken andere tabbladen (of een herlaad) niet
 * opnieuw — zo start een browser die vijf tabbladen herstelt één ronde, niet vijf.
 *
 * Gelijk aan de uur-rem van de globale sync: langer wachten wint niets (de
 * 12-uursgrens beslist toch), korter zou een falende bankkoppeling vaker een
 * dagtik laten kosten dan de knop zelf zou doen.
 */
export const AUTO_SYNC_CLAIM_MS = BANK_AUTO_SYNC_INTERVAL_MS

/** Epoch-ms van een ISO-stempel; `0` bij ontbrekend of onleesbaar. */
function toEpochMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : 0
}

/**
 * Is deze koppeling oud genoeg om vanzelf bij te werken?
 *
 * `null` (nooit gesynchroniseerd) is NIET oud maar "nog niet begonnen" — zie de
 * kop van dit bestand. Een stempel in de toekomst (klokverschil) telt als vers:
 * te vroeg remmen is hooguit lastig, te vaak syncen kost dagbudget.
 */
export function isStaleForAutoSync(lastSyncedAt: string | null | undefined, nowMs: number): boolean {
  const last = toEpochMs(lastSyncedAt)
  if (last === 0) return false
  return nowMs - last >= AUTO_SYNC_STALE_MS
}

/** De bankkoppelingen die deze automatische ronde meegaan. */
export function selectStaleBanks(banks: BankSyncTarget[], nowMs: number): BankSyncTarget[] {
  return banks.filter((bank) => {
    if (bank.linkBroken || !bank.bankAccountId) return false
    if ((bank.dailyRequests ?? 0) >= AUTO_SYNC_MAX_DAILY_REQUESTS) return false
    if (!isStaleForAutoSync(bank.lastSyncedAt, nowMs)) return false
    // In dit tabblad net geprobeerd (en mislukt, anders was lastSyncedAt vers)?
    // Dan niet nóg een tik; `planBankSyncs` zou hem met een melding overslaan.
    const attempted = toEpochMs(bank.lastAttemptedAt)
    if (attempted > 0 && nowMs - attempted < BANK_AUTO_SYNC_INTERVAL_MS) return false
    return true
  })
}

/** Een brokerkoppeling zoals de loader hem aanlevert voor de automatische ronde. */
export interface BrokerAutoSyncCandidate extends BrokerSyncTarget {
  lastSyncedAt: string | null
  lastSyncError: string | null
}

/** De brokerkoppelingen die deze automatische ronde meegaan. */
export function selectStaleBrokers(
  brokers: BrokerAutoSyncCandidate[],
  nowMs: number,
): BrokerSyncTarget[] {
  return brokers
    .filter(
      (b) =>
        !(b.lastSyncError && PERMANENT_BROKER_ERRORS.includes(b.lastSyncError)) &&
        isStaleForAutoSync(b.lastSyncedAt, nowMs),
    )
    .map(({ id, label }) => ({ id, label }))
}

/** Minimale opslag-interface — `localStorage` in de browser, een Map in tests. */
export interface ClaimStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Prefix van de apparaatclaim. Hier canoniek, want `lib/browser-account-storage.ts`
 * ruimt hem op bij een accountwissel: de sleutel draagt de user-id.
 */
export const AUTO_SYNC_CLAIM_KEY_PREFIX = 'trifinity_auto_sync_claim:'

/** Sleutel van de apparaatclaim, per account: op een gedeelde browser remt A B niet. */
export function autoSyncClaimKey(userId: string): string {
  return `${AUTO_SYNC_CLAIM_KEY_PREFIX}${userId}`
}

/**
 * Geef een claim terug die niet gebruikt is (de ronde kwam er niet door, bv.
 * omdat de eerste ophaal van ADR 0158 al liep). Alleen als het nog ónze claim
 * is — een ander tabblad dat inmiddels zelf claimde, blijft staan.
 */
export function releaseAutoSyncClaim(storage: ClaimStorage | null, userId: string, claimedAtMs: number): void {
  if (!storage) return
  const key = autoSyncClaimKey(userId)
  try {
    if (storage.getItem(key) === String(claimedAtMs)) storage.removeItem(key)
  } catch {
    // Gemaksrem: niet kunnen opruimen kost hooguit een uur wachten.
  }
}

/**
 * Probeer de automatische ronde voor dit apparaat te claimen.
 *
 * `true` = dit tabblad mag; de claim is dan gezet. `false` = een ander tabblad (of
 * een eerdere load) deed het binnen `AUTO_SYNC_CLAIM_MS`. Opslag die gooit
 * (privévenster, geblokkeerde sitedata) levert `true`: de claim is een
 * gemaksrem, geen beveiliging — de dagrem in de database en de 12-uursgrens op
 * het serverfeit `last_synced_at` blijven gelden.
 */
export function claimAutoSync(storage: ClaimStorage | null, userId: string, nowMs: number): boolean {
  if (!storage) return true
  const key = autoSyncClaimKey(userId)
  try {
    const previous = Number(storage.getItem(key))
    if (Number.isFinite(previous) && previous > 0 && nowMs - previous >= 0 && nowMs - previous < AUTO_SYNC_CLAIM_MS) {
      return false
    }
    storage.setItem(key, String(nowMs))
    return true
  } catch {
    return true
  }
}

/**
 * Staat "Automatisch bijwerken" aan voor deze profielrij?
 *
 * FAIL-CLOSED: alleen een expliciete `true` telt. Ontbreekt de kolom (migratie
 * nog niet toegepast), faalt de profiel-read of is de rij leeg, dan start er
 * niets vanzelf — een automatische externe aanroep hoort nooit uit een
 * ontbrekend antwoord te volgen. De database-default is `true` (ADR 0182), dus
 * na de migratie staat hij voor iedereen aan die hem niet uitzette.
 */
export function readAutoSyncEnabled(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false
  return (profile as { auto_sync_enabled?: unknown }).auto_sync_enabled === true
}
