'use client'

/**
 * Props-als-bron voor /toekomst (ADR 0179 fase 1 stap 3).
 *
 * WAAROM: de horizon-client seedde zijn projectie-invoer (`input`, `fireParams`,
 * `fireStrategy`, `kernelRawProfile`, …) met `useState(initialData.x)`. Een
 * `router.refresh()` levert wél een nieuwe `initialData`, maar `useState` negeert
 * een nieuwe beginwaarde: de grafiek bleef op de oude invoer rekenen tot een eigen
 * client-herlading (`loadData`, 15 Supabase-reads + 3 fetches) of een volle
 * paginalading. Zo ververste de grafiek na de plan-review-wizard níet, terwijl die
 * wél `router.refresh()` deed.
 *
 * NU: alle invoer volgt `initialData`. De server-bundel is de enige bron; een
 * mutatie ververst hem met `router.refresh()`.
 *
 * Twee regels:
 *  - Referentie-stabiel. Een refresh levert altijd nieuwe objecten, ook als de data
 *    gelijk bleef (bv. na een perspectief-wissel). Die zijn deps van de kernel-memo in
 *    `useHorizonFireSim`; een nieuwe referentie is een nieuwe volledige solve. Daarom
 *    houdt `useStructurallyStable` de vorige referentie vast zolang de inhoud gelijk is.
 *  - `events` blijft lokale state. De tijdlijn- en grafiek-drag schrijven optimistisch
 *    in de lijst vóór de DB-write landt. Komt er een nieuwe server-lijst binnen, dan
 *    wint die (in dezelfde render, zonder tussenframe met oude events).
 */

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import type { LifeEvent } from '@/lib/horizon-data'
import { lookupAowAge, type AowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { WITHDRAWAL_DEFAULTS, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import { deepEqual } from '@/lib/horizon/kernel-context-sync'

/** Vaste terugval, zodat een ontbrekende tabel geen nieuwe array per render oplevert. */
const GEEN_AOW_RIJEN: AowLeeftijdRow[] = []

/**
 * Geeft `value` terug, maar behoudt de vorige referentie zolang de nieuwe waarde er
 * structureel gelijk aan is. Werkt met "state aanpassen tijdens render" (React-docs:
 * "Adjusting some state when a prop changes"), dus zonder effect en zonder tussenframe.
 *
 * Voorwaarde: `value` is referentie-stabiel zolang de bron niet verandert (een prop,
 * of een constante terugval). Een per render nieuw object zou elke render opnieuw
 * vergelijken en state zetten.
 */
export function useStructurallyStable<T>(value: T): T {
  const [bron, setBron] = useState<{ gezien: T; stabiel: T }>({ gezien: value, stabiel: value })
  if (bron.gezien !== value) {
    const stabiel = deepEqual(bron.stabiel, value) ? bron.stabiel : value
    setBron({ gezien: value, stabiel })
    return stabiel
  }
  return bron.stabiel
}

export interface HorizonBron {
  input: HorizonPageData['effectiveInput'] | null
  fireParams: HorizonPageData['fireParams']
  withdrawalStrategyConfig: WithdrawalStrategyConfig
  fireStrategy: HorizonPageData['fireStrategy'] | undefined
  kernelRawProfile: HorizonPageData['rawProfile']
  aowRows: AowLeeftijdRow[]
  userAowAge: AowAge
  debts: HorizonPageData['debts']
  avgIncome6m: number | null
  avgExpenses6m: number | null
  retirementMethod: RetirementExpenseMethod
  events: LifeEvent[]
  setEvents: Dispatch<SetStateAction<LifeEvent[]>>
}

export function useHorizonBron(initialData: HorizonPageData): HorizonBron {
  const input = useStructurallyStable<HorizonPageData['effectiveInput'] | null>(initialData.effectiveInput)
  const fireParams = useStructurallyStable(initialData.fireParams)
  const withdrawalStrategyConfig = useStructurallyStable<WithdrawalStrategyConfig>(
    initialData?.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
  )
  const fireStrategy = useStructurallyStable<HorizonPageData['fireStrategy'] | undefined>(
    initialData?.fireStrategy ?? undefined,
  )
  const kernelRawProfile = useStructurallyStable(initialData.rawProfile ?? null)
  const aowRows = useStructurallyStable(initialData.aowRows ?? GEEN_AOW_RIJEN)
  const debts = useStructurallyStable(initialData.debts)

  /**
   * AOW-leeftijd uit de server-voorgeladen wettelijke tabel, niet de 67-terugval
   * (bevinding C1): in pensioen-modus tóónt de hero deze leeftijd als kernantwoord.
   * `lookupAowAge` geeft zelf de 67-terugval als de tabel leeg is.
   */
  const dateOfBirth = initialData.effectiveInput?.dateOfBirth ?? null
  const userAowAge = useMemo(() => lookupAowAge(aowRows, dateOfBirth), [aowRows, dateOfBirth])

  const serverEvents = useStructurallyStable(initialData.events)
  const [events, setEvents] = useState<LifeEvent[]>(serverEvents)
  const [eventsBron, setEventsBron] = useState(serverEvents)
  if (eventsBron !== serverEvents) {
    setEventsBron(serverEvents)
    setEvents(serverEvents)
  }

  return {
    input,
    fireParams,
    withdrawalStrategyConfig,
    fireStrategy,
    kernelRawProfile,
    aowRows,
    userAowAge,
    debts,
    avgIncome6m: initialData.avgIncome6m,
    avgExpenses6m: initialData.avgExpenses6m,
    retirementMethod: initialData.retirementExpenseMethod ?? 'essential_budgets',
    // Zelfde render als een nieuwe server-lijst: geef die meteen terug, niet de oude state.
    events: eventsBron !== serverEvents ? serverEvents : events,
    setEvents,
  }
}
