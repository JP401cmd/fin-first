'use client'

/**
 * eerste-sync-na-onboarding — haalt de transacties op zodra iemand na de
 * onboarding op zijn homescherm landt, als hij daar een bank heeft gekoppeld.
 *
 * WAAROM DIT BESTAAT. De onboarding eindigt sinds ADR 0156 met een bankstap,
 * maar de koppeling levert op dat moment alleen een saldo: `POST
 * /api/bank-connect/sync` is de enige route die transacties ophaalt, en die
 * werd uitsluitend door een knop gestart. Een nieuwe gebruiker kwam dus met
 * een gekoppelde bank én een leeg budget de app binnen — precies de stap die
 * zijn budget betekenis geeft, ontbrak.
 *
 * WAAROM HIER EN NIET IN DE ONBOARDING. De onboarding leeft in de route-group
 * `(onboarding)`, buiten de `GlobalSyncProvider`. Belangrijker: ze sluit af met
 * een HARDE `window.location.assign('/dashboard')`, die een lopende fetch
 * afkapt. Een ophaal die daar start zou dus stil halverwege sneuvelen. Op het
 * homescherm draait de sync in de context die er al voor gebouwd is, mét de
 * bestaande rem, de toasts en de `router.refresh()` die het scherm bijwerkt.
 *
 * WAAROM HET DE RONDLEIDING LAAT VOORGAAN. De tour van ADR 0130 start ~400 ms
 * na binnenkomst en claimt het aandachtsregister (ADR 0134). Een banksync
 * eindigt met toasts en een `router.refresh()`; die zouden middenin de
 * spotlight vallen, waarvan de stappen op `data-tour`-selectors mikken. Deze
 * trigger wacht daarom tot het stil is. Dat kost niets: de tour legt de
 * schermen uit, niet de cijfers, en wie 'm overslaat (één tik) krijgt de sync
 * meteen.
 *
 * WAAROM HIJ ZICHZELF DOOFT. Geen eigen "al gedaan"-vlag. Twee bestaande
 * feiten dragen dat al: de afrondingsmarkering verloopt na 24 uur
 * (`readOnboardingBankKoppelingen`) en een geslaagde sync zet `last_synced_at`,
 * waarmee de voorwaarde hieronder voorgoed onwaar wordt. Zie ADR 0158.
 *
 * WAT HIJ NIET DOET. Hij raakt uitsluitend de koppelingen die uit de
 * onboarding komen — niet elke koppeling van de gebruiker. Die grens hangt aan
 * de `koppelingen`-prop en is het hart van de veiligheid; zie de noot bij de
 * poort hieronder.
 */

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAttentionQuiet } from '@/lib/hooks/use-attention-quiet'
import { useGlobalSync } from './global-sync-provider'
import { loadGlobalSyncTargets } from './use-global-sync-runner'

/**
 * Wachttijd vóór de eerste poging. Spiegelt `COACHMARK_DELAY_MS` in
 * `euro-view-badge.tsx` en om dezelfde reden: de rondleiding claimt de
 * aandacht pas op ~400 ms, dus zonder deze pauze zou de trigger op t=0 een
 * stilte zien die er een fractie later niet meer is.
 */
const START_VERTRAGING_MS = 2000

/**
 * Module-scoped, niet een ref: de trigger mag per browsertab één keer vuren,
 * ook als React hem in StrictMode twee keer mount. `triggerGlobalSync` heeft
 * zijn eigen `inFlightRef`, maar die beschermt tegen gelijktijdigheid — niet
 * tegen een tweede ronde nadat de eerste klaar is.
 */
let gestart = false

/** Alleen voor tests — geeft de eenmaligheid per tab weer vrij. */
export function __resetEersteSync() {
  gestart = false
}

/**
 * De koppelwizard. Zolang de gebruiker hierin zit mag deze trigger NOOIT
 * vuren: op `/core/cash/connect/success` staat het correctiemoment van ADR
 * 0069 — de actie om een verkeerd gelande koppeling te verhangen — en dat
 * venster sluit onherroepelijk zodra er transacties zijn opgehaald.
 */
const KOPPELWIZARD = '/core/cash/connect'

export interface EersteSyncNaOnboardingProps {
  /**
   * De `bank_connection_accounts`-ids die uit een net afgeronde onboarding
   * komen — server-bepaald, uit de al geladen profielrij
   * (`readOnboardingBankKoppelingen`). Leeg betekent: niets te doen, en dat is
   * verreweg de meeste renders.
   *
   * Dit is een LIJST en geen boolean omdat de grens aan de kóppeling hoort te
   * hangen, niet aan gebruikerstoestand. Zie de kop van dit bestand.
   */
  koppelingen: string[]
}

export function EersteSyncNaOnboarding({ koppelingen }: EersteSyncNaOnboardingProps) {
  const actief = koppelingen.length > 0
  const quiet = useAttentionQuiet()
  const pathname = usePathname()
  const { triggerGlobalSync, getBankAttempts } = useGlobalSync()
  const [rijp, setRijp] = useState(false)

  // Nooit vuren binnen de koppelwizard — daar leeft het correctiemoment.
  const inKoppelwizard = Boolean(pathname?.startsWith(KOPPELWIZARD))

  useEffect(() => {
    if (!actief) return
    const t = setTimeout(() => setRijp(true), START_VERTRAGING_MS)
    return () => clearTimeout(t)
  }, [actief])

  useEffect(() => {
    if (!actief || !rijp || quiet || inKoppelwizard || gestart) return
    gestart = true

    void (async () => {
      try {
        const targets = await loadGlobalSyncTargets(getBankAttempts())

        // De poort, en hij hangt aan de KOPPELING — niet aan gebruikerstoestand.
        //
        // `loadGlobalSyncTargets` levert élke actieve koppeling van de
        // gebruiker. Zouden we hier afgaan op "is er iets ongesynchroniseerds?",
        // dan sleept de ronde ook een koppeling mee die de gebruiker binnen
        // hetzelfde 24-uursvenster ergens ánders legde — en sluit daarmee stil
        // het correctiemoment van ADR 0069, dat alleen leeft zolang er nog geen
        // transacties zijn. Dat verlies is onherstelbaar: her-attributie van al
        // geïmporteerde transacties bestaat niet.
        //
        // Het faalpad is concreet, niet theoretisch. De bank-callback is een
        // SERVER-REDIRECT, dus een tweede koppeling geeft een volledige
        // pagina-load en daarmee een verse module-scope waarin `gestart` weer
        // vals staat. En een onboarding-koppeling die kapot of zonder drager
        // landt krijgt NOOIT een `last_synced_at` (`planBankSyncs` slaat 'm
        // over), dus een toestandspoort zou juist bij die gebruiker 24 uur
        // lang open blijven staan.
        //
        // Vandaar de expliciete lijst uit de afrondingsmarkering.
        const uitOnboarding = targets.banks.filter((bank) =>
          koppelingen.includes(bank.connectionAccountId),
        )
        if (!uitOnboarding.some((bank) => !bank.lastSyncedAt)) return

        await triggerGlobalSync({ ...targets, banks: uitOnboarding })
      } catch {
        // Stil falen naar de gebruiker toe. Dit is een automatische ronde: een
        // foutmelding voor iets wat hij niet aanvroeg is verwarrend, en de
        // handmatige syncknop staat er nog gewoon. Fouten ín de banksync zelf
        // komen wél in beeld — `triggerGlobalSync` toast die per koppeling.
        //
        // Maar de vlag gaat WÉL terug. Valt `/api/integrations/connections`
        // één keer om, dan gooit `loadGlobalSyncTargets` vóórdat er ook maar
        // één koppeling is aangeraakt. Zonder deze reset zou die ene hapering
        // de eerste ophaal voor de hele browsersessie afkappen — en juist die
        // gebruiker komt daarna met een leeg budget binnen.
        gestart = false
      }
    })()
  }, [actief, rijp, quiet, inKoppelwizard, getBankAttempts, triggerGlobalSync])

  return null
}
