// Van de wire-vorm van `GET /api/bank-connect/linked-accounts` naar de vorm die
// de sync-planner nodig heeft.
//
// Woont apart omdat twee oppervlakken hem aanroepen — de globale sync-knop in de
// header en de "Alles synchroniseren"-knop in het sync-rapport. Twee kopieën van
// deze mapping zouden binnen één release uiteenlopen op precies de dingen die
// eraan toe doen: het label dat de gebruiker in de melding leest, en de vraag of
// een koppeling nog mee mág (dagrem, kapotte verbinding).

import { effectiveDailyRequests } from '@/lib/bank-connection-status'
import type { LinkedAccountView } from '@/lib/truelayer/linked-account'
import type { BankSyncTarget } from '@/lib/sync/global-sync'

/**
 * Zoals de gebruiker deze rekening herkent: banknaam + IBAN-staartje.
 *
 * De banknaam alleen is niet genoeg zodra iemand twee rekeningen bij dezelfde
 * bank heeft — en dan gaat een melding "niet gesynchroniseerd" over een rekening
 * die je niet kunt aanwijzen. Het staartje is het enige stukje IBAN dat de
 * server nog uitgeeft (zie `LinkedAccountView.iban_tail`).
 */
export function bankSyncLabel(account: LinkedAccountView): string {
  const bank = account.provider_name?.trim() || account.carrier_name?.trim() || 'Bankrekening'
  const tail = account.iban_tail ?? account.carrier_iban_tail
  return tail ? `${bank} · ···· ${tail}` : bank
}

/**
 * Alle actieve bankkoppelingen als sync-doel.
 *
 * Zonder koppelingen levert dit een lege array en verandert er niets aan de
 * sync-ronde — dat is de regressie-eis: een gebruiker zonder bank merkt niets
 * van de bankstap.
 */
export function toBankSyncTargets(
  accounts: LinkedAccountView[],
  options: { attempts?: Record<string, string>; now?: Date } = {},
): BankSyncTarget[] {
  const { attempts = {}, now = new Date() } = options

  return accounts.map((account) => ({
    connectionAccountId: account.id,
    label: bankSyncLabel(account),
    bankAccountId: account.bank_account_id,
    lastSyncedAt: account.last_synced_at,
    lastAttemptedAt: attempts[account.id] ?? null,
    // Het OORDEEL komt van de server (`deriveBankLinkHealth`), niet uit een
    // eigen afleiding op `status`/`token_expires_at` — zie de noot bij
    // `LinkedAccountView.health`.
    linkBroken: account.health.state === 'linked-broken',
    // Dagteller via de gedeelde regel — alleen geldig als hij over vandaag gaat
    // (Europe/Amsterdam). Zie `effectiveDailyRequests`.
    dailyRequests: effectiveDailyRequests(account, now),
  }))
}
