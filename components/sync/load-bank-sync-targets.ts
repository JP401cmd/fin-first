'use client'

// De leesronde die de bankstap van de globale sync voedt.
//
// Meerdere oppervlakken starten diezelfde sync — de header-knop, de ⌘K-actie
// "Alles synchroniseren" en de knop in het sync-rapport — en allemaal moeten ze
// dezelfde vraag beantwoorden: welke bankkoppelingen zijn actief, en mag elk
// daarvan nu mee? Eén helper, zodat de foutafhandeling (niet-fataal) en de
// mapping op één plek staan.
//
// De eerste twee lopen inmiddels via `useGlobalSyncRunner`, dat deze leesronde
// combineert met de exchange-/wallet-lijst; het sync-rapport heeft de
// bankkoppelingen al in beeld en mapt ze rechtstreeks met `toBankSyncTargets`.

import { toBankSyncTargets } from '@/lib/sync/bank-sync-targets'
import type { BankSyncTarget } from '@/lib/sync/global-sync'
import type { LinkedAccountView } from '@/lib/truelayer/linked-account'

/**
 * Haal de actieve bankkoppelingen op als sync-doel.
 *
 * **Nooit fataal.** Faalt de route (Bank Connect uit, netwerk weg, 500), dan is
 * het antwoord een lege lijst en draait de sync-ronde precies zoals vóór de
 * bankstap. Een sync-knop die stukgaat omdat de bank-lijst niet laadt zou de
 * prijsverversing gijzelen aan een functie die de meeste gebruikers niet eens
 * gebruiken.
 *
 * @param attempts Laatste poging per koppeling in deze sessie (uit
 *   `useGlobalSync().bankAttempts`) — voedt de uur-rem, zodat een falende
 *   koppeling niet bij elke klik opnieuw een dagtik kost.
 */
export async function fetchBankSyncTargets(
  attempts: Record<string, string>,
): Promise<BankSyncTarget[]> {
  try {
    const res = await fetch('/api/bank-connect/linked-accounts', { cache: 'no-store' })
    if (!res.ok) return []
    const json = (await res.json()) as { accounts?: LinkedAccountView[] }
    const accounts = Array.isArray(json?.accounts) ? json.accounts : []
    return toBankSyncTargets(accounts, { attempts })
  } catch {
    return []
  }
}
