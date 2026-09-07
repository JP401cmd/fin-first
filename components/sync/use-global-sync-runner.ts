'use client'

// De gedeelde sync-ronde: één leesronde, één trigger, twee oppervlakken.
//
// De header-knop (`global-sync-button.tsx`) en de ⌘K-actie "Alles
// synchroniseren" (`lib/command-palette/actions.ts#action:sync-prices`) horen
// exact dezelfde ronde te draaien. Dat was niet zo: het palet riep
// `triggerGlobalSync({ exchanges: [], wallets: [], pricesOnly: true })` aan en
// sloeg daarmee de bankstap, de exchanges én de wallets over — terwijl de
// gebruiker van de "algemene synchroniseren"-knop juist verwacht dat de
// bankgegevens meeliften. De rem daarop (hooguit één ronde per uur per
// koppeling, en drie verzoeken reserve op de 10/dag) blijft ongewijzigd waar hij
// hoort: `lib/sync/global-sync.ts#planBankSyncs`.
//
// Vandaar deze hook in plaats van een tweede kopie van de leesronde. Twee
// kopieën lopen binnen één release uiteen op precies de dingen die eraan toe
// doen: wélke doelen meegaan, en of `getBankAttempts()` wordt doorgegeven
// (zonder die stempels kost een falende koppeling bij élke klik opnieuw een tik
// van de dagrem).

import { useCallback, useState } from 'react'
import { useGlobalSync } from './global-sync-provider'
import { fetchBankSyncTargets } from './load-bank-sync-targets'
import { useOptionalToast } from '@/components/app/toast-provider'
import type { BankSyncTarget } from '@/lib/sync/global-sync'
import type {
  ConnectionsData,
  ExchangeConnectionRow,
  WalletAddressRow,
} from '@/lib/connections-data'

/** Alles wat één ronde nodig heeft — precies de vorm die `triggerGlobalSync` verwacht. */
export interface GlobalSyncTargets {
  exchanges: ExchangeConnectionRow[]
  wallets: WalletAddressRow[]
  banks: BankSyncTarget[]
  /** Geen enkele koppeling → kale prijzenronde. */
  pricesOnly: boolean
}

/**
 * Welke doelen mogen deze ronde mee?
 *
 * Parallel, want de bank-leesronde mag de exchange-/wallet-ronde niet vertragen.
 * De bank-lijst is NOOIT fataal (zie `fetchBankSyncTargets`): faalt hij, dan is
 * het antwoord een lege lijst en draait de ronde precies zoals vóór de bankstap.
 * De koppelingen-route is dat wél: zonder die lijst weten we niet wát er te
 * synchroniseren valt, en dan is stil doorgaan een leugen tegen de gebruiker.
 *
 * @param attempts Laatste poging per bankkoppeling in deze sessie, uit
 *   `useGlobalSync().getBankAttempts()`.
 */
export async function loadGlobalSyncTargets(
  attempts: Record<string, string>,
): Promise<GlobalSyncTargets> {
  const [res, banks] = await Promise.all([
    fetch('/api/integrations/connections', { cache: 'no-store' }),
    fetchBankSyncTargets(attempts),
  ])
  if (!res.ok) throw new Error('Kon koppelingen niet laden')
  const data = (await res.json()) as ConnectionsData
  return {
    exchanges: data.exchanges,
    wallets: data.wallets,
    banks,
    pricesOnly: data.exchanges.length + data.wallets.length + banks.length === 0,
  }
}

export interface GlobalSyncRunner {
  /** Start de volledige ronde: koersen, bankgegevens, exchanges en wallets. */
  runGlobalSync: () => Promise<void>
  /** Loopt de leesronde nog? Voedt de wacht-state van de knop. */
  loadingTargets: boolean
}

/**
 * De ronde zoals élk oppervlak hem start.
 *
 * Géén eigen dubbelklik-guard: `triggerGlobalSync` dedupliceert gelijktijdige
 * aanroepen al (`inFlightRef` in `global-sync-provider.tsx`). Een tweede rem
 * hier zou alleen een tweede plek zijn waar hij kan blijven hangen.
 *
 * `useOptionalToast` en niet `useToast`: het ⌘K-palet wordt ook zonder
 * ToastProvider gerenderd (component-tests). In de app zit die provider er
 * altijd omheen — zie `app/(app)/layout.tsx` — dus de terugkoppeling gaat in
 * productie niet verloren.
 */
export function useGlobalSyncRunner(): GlobalSyncRunner {
  const { triggerGlobalSync, getBankAttempts } = useGlobalSync()
  const { addToast } = useOptionalToast()
  const [loadingTargets, setLoadingTargets] = useState(false)

  const runGlobalSync = useCallback(async () => {
    setLoadingTargets(true)
    try {
      // De poging-stempels op het moment van klikken uitlezen, niet in een memo:
      // ze wonen in een ref en veranderen zonder render (zie `getBankAttempts`).
      const targets = await loadGlobalSyncTargets(getBankAttempts())
      await triggerGlobalSync(targets)
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Sync mislukt',
        message: err instanceof Error ? err.message : 'Onbekende fout',
      })
    } finally {
      setLoadingTargets(false)
    }
  }, [getBankAttempts, triggerGlobalSync, addToast])

  return { runGlobalSync, loadingTargets }
}
