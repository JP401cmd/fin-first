'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  useCashflowCardStatuses,
  NEUTRAL_CASHFLOW_STATUSES,
} from '@/lib/hooks/use-cashflow-card-statuses'
import { usePerspective } from '@/components/app/perspective-provider'
import type { CashflowCardStatuses } from '@/lib/cashflow-cards'

/**
 * CashflowStatusProvider — deelt de vier cashflow-kaartstatussen (Budget,
 * Transacties, Vaste lasten, Forecast) met de sidebar-status-dots onder
 * Cashflow, en is het ENIGE fetch-pad daarvoor.
 *
 * WAAROM EEN PROVIDER IN DE APP-LAYOUT (en niet gewoon een hook in de sidebar):
 * de dots leven in de Sidebar, de server-berekende statussen ontstaan in de
 * PAGINA — twee zustertakken. Een seed uit de pagina bereikt de sidebar alleen
 * via een gedeelde voorouder. Spiegel van `PageStatusProvider`
 * (components/app/page-status-provider.tsx): provider bezit de bron, een
 * `null`-renderend `<CashflowStatusSeed>` levert de server-waarde aan, en de
 * consumers zijn puur. Geen tweede mechanisme.
 *
 * SERVER-SEED (dedup): de cashflow-hub (/overzicht/cashflow) berekent de vier
 * kaarten toch al server-side (components/overview/cashflow-cards-loader.tsx) en
 * registreert de statussen hier. Daardoor doet de hub NUL status-fetches; de
 * sub-pagina's (die de kaarten niet hebben) fetchen `/api/overzicht/
 * cashflow-status` zoals voorheen. Het fetch-besluit staat bewust op de ROUTE en
 * niet op "is er al een seed?" — de seed komt uit een gestreamd blok en zou die
 * race verliezen; zie de kop van lib/hooks/use-cashflow-card-statuses.ts.
 *
 * PERSPECTIEF: de provider leest `usePerspective()` en geeft dat aan de hook mee,
 * zodat een perspectiefwissel de sub-pagina's opnieuw laat ophalen. Zonder dat
 * zouden de dots daar op het vorige perspectief blijven staan (een wissel doet
 * alleen `router.refresh()` — clientstate overleeft), terwijl de hub via zijn
 * seed wél zou meebewegen: precies de asymmetrie die dit voorkomt. Zolang het
 * perspectief nog niet opgelost is gaat er `null` in en wacht de eerste fetch —
 * anders betaalt elke huishoud-/partnergebruiker bij een harde load een tweede,
 * weggegooid verzoek.
 *
 * De seed blijft na een route-wissel staan. Ga je hub → sub → hub, dan tonen de
 * dots heel even de statussen van het vorige hub-bezoek tot het gestreamde blok
 * opnieuw seedt — dezelfde soort (en kortere) staleness als de TTL-cache achter
 * de route, en beter dan een neutrale flits. Naar een SUB-pagina lekt hij niet:
 * daar wint altijd de gefetchte waarde (die neutraal begint). Bij uitloggen
 * verdwijnt de (app)-layout en daarmee deze state, dus er lekt niets naar een
 * volgende gebruiker.
 */

const CashflowStatusContext = createContext<CashflowCardStatuses>(
  NEUTRAL_CASHFLOW_STATUSES,
)

/**
 * Kanaal waarmee een descendant `<CashflowStatusSeed>` de server-berekende
 * statussen bij de provider registreert. Bewust apart van de status-context
 * zodat de pure consumers (de dots) hun contract ongewijzigd houden.
 */
const CashflowStatusSeedContext = createContext<
  ((statuses: CashflowCardStatuses) => void) | null
>(null)

/**
 * Veilig buiten de provider: valt terug op neutrale statussen, zodat een
 * sidebar die per ongeluk zonder provider mount grijze dots toont i.p.v. crasht.
 */
export function useCashflowStatusContext(): CashflowCardStatuses {
  return useContext(CashflowStatusContext)
}

export function CashflowStatusProvider({ children }: { children: React.ReactNode }) {
  // `useState`-setter: stabiele identiteit, dus het effect in de seed vuurt
  // alleen op een echte waardewijziging.
  const [seed, setSeed] = useState<CashflowCardStatuses | null>(null)
  // Het perspectief hoort bij de statussen: een wissel doet slechts een zachte
  // `router.refresh()`, die de sub-pagina's niet opnieuw laat fetchen zolang het
  // perspectief niet in de deps van de hook zit. Zie de kop van de hook.
  //
  // `loading` → `null`: de PerspectiveProvider begint op 'personal' en resolvet
  // het echte perspectief pas ná een roundtrip. Zonder deze gate zou een
  // huishoud-/partnergebruiker bij elke harde load op een sub-pagina TWEE
  // verzoeken doen — één speculatief op 'personal' dat de flip weggooit — en
  // beide zijn cache-misses. Eén roundtrip later dots is de betere ruil.
  const { perspective, loading: perspectiveLoading } = usePerspective()
  const statuses = useCashflowCardStatuses(seed, perspectiveLoading ? null : perspective)

  return (
    <CashflowStatusContext.Provider value={statuses}>
      <CashflowStatusSeedContext.Provider value={setSeed}>
        {children}
      </CashflowStatusSeedContext.Provider>
    </CashflowStatusContext.Provider>
  )
}

/**
 * CashflowStatusSeed — onzichtbaar (`null`-renderend) component dat de
 * cashflow-hub rendert om de reeds SERVER-BEREKENDE kaartstatussen
 * (`buildCashflowCards` → `cashflowCardStatuses`) aan de provider mee te geven.
 * Daardoor hoeven de sidebar-dots op de hub niets op te halen.
 *
 * Timing: dit mag laat komen. De provider fetcht op de hub sowieso niet, dus de
 * seed hoeft geen race te winnen — hij levert alleen de waarde, ook wanneer het
 * gestreamde blok pas ná de eerste paint hydrateert.
 */
export function CashflowStatusSeed({ statuses }: { statuses: CashflowCardStatuses }) {
  const register = useContext(CashflowStatusSeedContext)
  // Op de vier waarden depend'en i.p.v. op het props-object: een nieuw object met
  // gelijke inhoud mag geen re-registratie (en dus geen re-render) veroorzaken.
  const { budget, transacties, vasteLasten, forecast } = statuses

  useEffect(() => {
    register?.({ budget, transacties, vasteLasten, forecast })
  }, [register, budget, transacties, vasteLasten, forecast])

  return null
}
