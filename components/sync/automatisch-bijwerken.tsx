'use client'

/**
 * automatisch-bijwerken — werkt bank- en brokerkoppelingen bij zodra iemand
 * /overzicht opent en ze langer dan twaalf uur stilstaan (W-018, ADR 0182).
 *
 * WAAROM ZO EN NIET MET EEN CRON. De gebruiker is er op dit moment bij. Dat
 * maakt het een gewone, "attended" ophaal: dezelfde sessie, dezelfde routes,
 * dezelfde dagrem als de knop — geen service-role, geen onbewaakt PSD2-verzoek,
 * geen nieuw pad naar de bank. Een nachtelijke cron (optie B) staat bewust
 * buiten deze stap.
 *
 * WAAROM ALS COMPONENT OP DE PAGINA. Hij rendert niets en start pas ná de eerste
 * paint, met dezelfde wachttijd als de eerste ophaal van ADR 0158: de pagina
 * blokkeert nooit op een bank die traag antwoordt. De uitvoering gaat via
 * `triggerGlobalSync`, dus de voortgangsstrip, de meldingen per koppeling en de
 * `router.refresh()` die het scherm bijwerkt, komen gratis mee.
 *
 * DRIE REMMEN TEGEN DUBBEL WERK
 *  1. Module-scope `laatsteRondeMs`: binnen één tabblad hooguit één ronde per
 *     `AUTO_SYNC_CLAIM_MS`, ook als de gebruiker heen en weer navigeert.
 *  2. De apparaatclaim in `localStorage` (`claimAutoSync`), genomen binnen een
 *     Web Lock (`navigator.locks`, waar beschikbaar) zodat claimen en starten
 *     over tabbladen heen atomair is: vijf herstelde tabbladen starten één
 *     ronde, niet vijf. Dat telt extra voor brokers — twee gelijktijdige
 *     broker-syncs kunnen een positie dubbel wegschrijven (ADR 0182, restrisico).
 *  3. Het serverfeit: elke ronde leest `last_synced_at` vers
 *     (`/api/bank-connect/linked-accounts`), en de bank-route bewaakt de dagrem
 *     atomair in de database. `triggerGlobalSync` dedupliceert bovendien
 *     gelijktijdige aanroepen in hetzelfde tabblad.
 */

import { useEffect, useState } from 'react'
import { useAttentionQuiet } from '@/lib/hooks/use-attention-quiet'
import { useGlobalSync } from './global-sync-provider'
import { fetchBankSyncTargets } from './load-bank-sync-targets'
import {
  AUTO_SYNC_CLAIM_MS,
  claimAutoSync,
  releaseAutoSyncClaim,
  selectStaleBanks,
  selectStaleBrokers,
  type BrokerAutoSyncCandidate,
  type ClaimStorage,
} from '@/lib/sync/auto-sync'

/**
 * Wachttijd vóór de eerste blik. Bewust láter dan de eerste ophaal van ADR 0158
 * (2 s): die gaat voor, want `triggerGlobalSync` laat maar één ronde tegelijk
 * toe en een verloren eerste ophaal komt pas na een herlaad terug. Daarnaast
 * claimt de rondleiding de aandacht op ~400 ms, en hoort de pagina eerst haar
 * eigen cijfers te tonen.
 */
const START_VERTRAGING_MS = 4000

/** Naam van het Web Lock dat claimen en starten over tabbladen heen serialiseert. */
const LOCK_PREFIX = 'trifinity-auto-sync'

/**
 * Draai `fn` alleen als geen ander tabblad van dit account het slot houdt.
 * Zonder Web Locks (oude browser, test) draait `fn` gewoon: de claim en de
 * server-remmen blijven dan de vangrail.
 */
async function metTabbladSlot(userId: string, fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks?.request) return fn()
  await locks.request(`${LOCK_PREFIX}:${userId}`, { ifAvailable: true }, async (lock) => {
    if (lock) await fn()
  })
}

/** Wanneer dit tabblad voor het laatst een automatische ronde overwoog. */
let laatsteRondeMs = 0

/** Alleen voor tests — geeft de tabblad-rem weer vrij. */
export function __resetAutomatischBijwerken() {
  laatsteRondeMs = 0
}

function browserStorage(): ClaimStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export interface AutomatischBijwerkenProps {
  /**
   * De schakelaar "Automatisch bijwerken" (`profiles.auto_sync_enabled`).
   * Alleen een expliciete `true` zet dit component aan — zie de loader.
   */
  enabled: boolean
  /** Eigen user-id: scoped de apparaatclaim, zodat A op een gedeelde browser B niet remt. */
  userId: string
  /** Eigen brokerkoppelingen, server-geladen met alleen publieke kolommen. */
  brokers: BrokerAutoSyncCandidate[]
}

export function AutomatischBijwerken({ enabled, userId, brokers }: AutomatischBijwerkenProps) {
  const quiet = useAttentionQuiet()
  const { state, triggerGlobalSync, getBankAttempts } = useGlobalSync()
  // Loopt er al een ronde (knop, eerste ophaal)? Dan wachten tot hij klaar is;
  // het effect draait opnieuw zodra de fase terugvalt.
  const bezig = state.phase === 'syncing'
  const [rijp, setRijp] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => setRijp(true), START_VERTRAGING_MS)
    return () => clearTimeout(t)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !rijp || quiet || bezig) return
    const nowMs = Date.now()
    if (laatsteRondeMs > 0 && nowMs - laatsteRondeMs < AUTO_SYNC_CLAIM_MS) return
    laatsteRondeMs = nowMs

    void (async () => {
      // Brokers eerst lokaal beoordelen: kost geen verzoek.
      const staleBrokers = selectStaleBrokers(brokers, nowMs)
      // De bank-leesronde is nooit fataal (lege lijst bij een fout) en leest
      // `last_synced_at` vers — ook als een ander tabblad net klaar is.
      const staleBanks = selectStaleBanks(await fetchBankSyncTargets(getBankAttempts()), nowMs)
      if (staleBanks.length + staleBrokers.length === 0) return

      await metTabbladSlot(userId, async () => {
        // Pas claimen als er echt iets te doen is: een vers apparaat mag een
        // ander tabblad niet een uur lang blokkeren voor niets.
        const storage = browserStorage()
        const claimedAt = Date.now()
        if (!claimAutoSync(storage, userId, claimedAt)) return

        const result = await triggerGlobalSync({
          exchanges: [],
          wallets: [],
          banks: staleBanks,
          brokers: staleBrokers,
          includePrices: false,
        })
        // `null` = er liep al een ronde en deze kwam er niet door. Geef claim en
        // tabblad-rem terug, zodat het effect het opnieuw probeert zodra die
        // andere ronde klaar is.
        if (result === null) {
          releaseAutoSyncClaim(storage, userId, claimedAt)
          laatsteRondeMs = 0
        }
      })
    })().catch(() => {
      // Stil falen: dit is een ronde die de gebruiker niet zelf startte, en de
      // knop staat er nog gewoon. Fouten ín een sync komen wél in beeld —
      // `triggerGlobalSync` meldt die per koppeling.
    })
  }, [enabled, rijp, quiet, bezig, userId, brokers, getBankAttempts, triggerGlobalSync])

  return null
}
