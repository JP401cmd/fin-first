/**
 * Een levensgebeurtenis op de tijdas verplaatsen (sleep op de grafiek of de tijdlijn)
 * en eerlijk zeggen of dat lukte.
 *
 * De update loopt via de anon-client onder RLS: "Users can update own life events"
 * (`auth.uid() = user_id`). Een gebeurtenis die niet van jou is, zoals een gedeelde
 * gebeurtenis die je partner toevoegde, geeft daarom geen fout maar raakt stil nul
 * rijen. Zonder `.select('id')` is dat niet te zien, en meldde de sleep "verplaatst"
 * terwijl er niets was opgeslagen. De uitkomst telt dus de geraakte rijen: alleen
 * precies één is "verplaatst".
 *
 * Bewust nog een client-write (geen API-route): die verhuizing is een aparte kaart.
 */

import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { LifeEvent } from '@/lib/horizon-data'
import type { ChartEventKind } from '@/lib/chart-event-overlay'
import type { Toast } from '@/components/app/toast-provider'
import { GEBEURTENIS_NIET_VERPLAATST } from '@/lib/horizon/katern-copy'

export interface LevensgebeurtenisVerplaatsing {
  target_age: number | null
  target_date?: string | null
}

/** `verplaatst` = precies één rij geraakt; `niet-geraakt` = nul (niet van jou of weg). */
export type VerplaatsUitkomst = 'verplaatst' | 'niet-geraakt' | 'fout'

export async function verplaatsLevensgebeurtenis(
  eventId: string,
  patch: LevensgebeurtenisVerplaatsing,
): Promise<VerplaatsUitkomst> {
  const { data, error } = await createClient()
    .from('life_events')
    .update(patch)
    .eq('id', eventId)
    .select('id')
  if (error) {
    console.error('[levensgebeurtenis] verplaatsen faalde:', error)
    return 'fout'
  }
  return data?.length === 1 ? 'verplaatst' : 'niet-geraakt'
}

/** Bovengrens van een sleep op de grafiek (jaren). */
const MAX_SLEEPLEEFTIJD = 120
/** Ondergrens als de huidige leeftijd onbekend is (jaren). */
const MIN_SLEEPLEEFTIJD = 18

/**
 * De leeftijd die een sleep op de grafiek oplevert: een heel jaar (`target_age` is een
 * integer-kolom), niet vóór de huidige leeftijd en niet na 120.
 */
function sleepLeeftijd(newAge: number, currentAge: number | null): number {
  return Math.max(Math.ceil(currentAge ?? MIN_SLEEPLEEFTIJD), Math.min(MAX_SLEEPLEEFTIJD, Math.round(newAge)))
}

/** De opgeslagen plek van een gebeurtenis van vóór de sleep. */
interface VoorSleep {
  id: string
  target_age: number | null
  target_date: string | null
}

export interface GebeurtenisSleepInvoer {
  events: LifeEvent[]
  setEvents: Dispatch<SetStateAction<LifeEvent[]>>
  currentAge: number | null
  /** Ververst de server-bundel na een geslaagde write (props-als-bron). */
  loadData: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
}

/**
 * Het slepen van een levensgebeurtenis, op de grafiek en op de tijdlijn.
 *
 * Op de grafiek (F-1/F-5) zet `grafiekMove` de leeftijd al tijdens het slepen in de
 * lokale lijst, zodat de vermogenslijn live meebeweegt. Daarom mag `grafiekEnd` niet
 * tegen die lijst vergelijken: dan is de nieuwe leeftijd altijd "al zo" en wordt er
 * nooit opgeslagen, en draait een mislukte write terug naar de gesleepte leeftijd.
 * De eerste move legt daarom de opgeslagen plek vast (`voorSleep`); het einde
 * vergelijkt en draait terug tegen die plek. De tijdlijn kent geen move, maar leest
 * dezelfde plek als een grafieksleep op die gebeurtenis nog openstaat.
 */
export function useGebeurtenisSleep({ events, setEvents, currentAge, loadData, addToast }: GebeurtenisSleepInvoer) {
  const voorSleepRef = useRef<VoorSleep | null>(null)

  const zetTerug = useCallback(
    (voor: VoorSleep) => {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === voor.id ? { ...e, target_age: voor.target_age, target_date: voor.target_date } : e,
        ),
      )
    },
    [setEvents],
  )

  /** De plek van vóór de sleep: de vastgelegde, anders de huidige; daarna vrijgegeven. */
  const neemVoorSleep = useCallback(
    (eventId: string): VoorSleep | null => {
      const vastgelegd = voorSleepRef.current
      voorSleepRef.current = null
      if (vastgelegd?.id === eventId) return vastgelegd
      const ev = events.find((e) => e.id === eventId)
      return ev ? { id: ev.id, target_age: ev.target_age, target_date: ev.target_date } : null
    },
    [events],
  )

  const meldNietVerplaatst = useCallback(() => {
    addToast({
      type: 'info',
      title: GEBEURTENIS_NIET_VERPLAATST.titel,
      message: GEBEURTENIS_NIET_VERPLAATST.uitleg,
      duration: 5000,
    })
  }, [addToast])

  const grafiekMove = useCallback(
    (id: string, sourceId: string | undefined, newAge: number, kind: ChartEventKind) => {
      if (kind !== 'life_event') return
      // Voor life_events is sourceId === id (zie chartEventOverlay-build).
      const eventId = sourceId ?? id
      if (!eventId) return
      if (voorSleepRef.current?.id !== eventId) {
        // Een afgebroken sleep (pointercancel) op een ándere gebeurtenis liet die
        // lokaal verschoven maar onopgeslagen achter: eerst terugzetten.
        if (voorSleepRef.current) zetTerug(voorSleepRef.current)
        const ev = events.find((e) => e.id === eventId)
        if (!ev) return
        voorSleepRef.current = { id: ev.id, target_age: ev.target_age, target_date: ev.target_date }
      }
      const leeftijd = sleepLeeftijd(newAge, currentAge)
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId && e.target_age !== leeftijd ? { ...e, target_age: leeftijd, target_date: null } : e,
        ),
      )
    },
    [currentAge, events, setEvents, zetTerug],
  )

  const grafiekEnd = useCallback(
    async (id: string, sourceId: string | undefined, newAge: number, kind: ChartEventKind) => {
      if (kind !== 'life_event') return
      const eventId = sourceId ?? id
      if (!eventId) return
      const voor = neemVoorSleep(eventId)
      if (!voor) return
      const leeftijd = sleepLeeftijd(newAge, currentAge)
      if (voor.target_age === leeftijd) {
        // Heen en terug: niets op te slaan; zet ook een door de move gewiste datum terug.
        zetTerug(voor)
        return
      }

      // Optimistisch vóór de write, zodat de marker niet terugspringt tussen loslaten
      // en antwoord.
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, target_age: leeftijd, target_date: null } : e)),
      )
      const uitkomst = await verplaatsLevensgebeurtenis(eventId, { target_age: leeftijd, target_date: null })
      if (uitkomst !== 'verplaatst') {
        // Bij een fout én bij nul geraakte rijen (niet jouw gebeurtenis) is er niets
        // opgeslagen: terug naar de plek van vóór de sleep.
        zetTerug(voor)
        if (uitkomst === 'niet-geraakt') meldNietVerplaatst()
        return
      }
      // Props-als-bron (fase 1 stap 3): na de write de server-bundel verversen, zodat
      // `initialData.events` niet achterloopt op de optimistische lokale lijst.
      loadData()
    },
    [currentAge, neemVoorSleep, zetTerug, setEvents, meldNietVerplaatst, loadData],
  )

  /** Sleep op de tijdlijn (EventsTimeline): alleen een einde, met ongedaan maken. */
  const tijdlijnEnd = useCallback(
    async (eventId: string, newAge: number) => {
      const voor = neemVoorSleep(eventId)
      const ev = events.find((e) => e.id === eventId)
      // target_age is een integer-kolom; drag-posities kunnen fractioneel zijn
      // (bv. 59.5) → afronden, anders weigert Postgres de update ("invalid input
      // syntax for type integer").
      const roundedAge = Math.round(newAge)
      if (!voor || !ev || voor.target_age === roundedAge) return
      const originalAge = voor.target_age

      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, target_age: roundedAge } : e)))
      const uitkomst = await verplaatsLevensgebeurtenis(eventId, { target_age: roundedAge })
      if (uitkomst !== 'verplaatst') {
        // Terug naar de plek van vóór de sleep — bij een fout én bij nul geraakte rijen
        // (niet jouw gebeurtenis): er is niets opgeslagen, dus ook geen "verplaatst".
        zetTerug(voor)
        if (uitkomst === 'niet-geraakt') meldNietVerplaatst()
        return
      }

      // Ongedaan maken na een geslaagde sleep. De leeftijd is wat er is opgeslagen
      // (afgerond), niet de fractionele sleeppositie.
      addToast({
        type: 'info',
        title: `${ev.name} verplaatst naar ${roundedAge}j`,
        message: `Was ${originalAge}j`,
        duration: 5000,
        action: {
          label: 'Ongedaan maken',
          onClick: async () => {
            setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, target_age: originalAge } : e)))
            const undoUitkomst = await verplaatsLevensgebeurtenis(eventId, { target_age: originalAge })
            if (undoUitkomst !== 'verplaatst') {
              // Ongedaan maken mislukt: de opgeslagen stand is de nieuwe leeftijd.
              setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, target_age: roundedAge } : e)))
              addToast({ type: 'error', title: 'Ongedaan maken mislukt', duration: 3000 })
              return
            }
            loadData()
            addToast({ type: 'success', title: `${ev.name} terug op ${originalAge}j`, duration: 3000 })
          },
        },
      })
      loadData()
    },
    [events, neemVoorSleep, zetTerug, setEvents, meldNietVerplaatst, addToast, loadData],
  )

  return { grafiekMove, grafiekEnd, tijdlijnEnd }
}
