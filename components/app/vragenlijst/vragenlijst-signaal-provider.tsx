'use client'

/**
 * VragenlijstSignaalProvider — ÉÉN bron voor "welke vragenlijsten staan er voor
 * mij klaar?" (ADR 0147, gerichte verspreiding van vragenlijsten — fase 1).
 *
 * WAAROM EEN PROVIDER. Tot nu toe haalde alleen het chatvenster de lijst op
 * (`useActieveVragenlijsten`, bij openen). Vanaf ADR 0147 hebben drie
 * oppervlakken hetzelfde antwoord nodig: het icoon in Fins chat-kop, de teller
 * op Fins bubbel en de uitnodigings-popup. Drie losse fetches zouden drie keer
 * hetzelfde vragen én uit de pas kunnen lopen (de popup toont een lijst die de
 * teller nog niet kent). Eén provider, één fetch, één waarheid.
 *
 * EGRESS. Bewust GEEN poll-interval. We halen op bij mount, bij het terugkeren
 * naar de tab (hoogstens één keer per 10 minuten) en op expliciete `herlaad()`
 * — die laatste gebruikt de chat bij openen en de popup na een keuze. Dezelfde
 * les als de meldingen-poll (60s → 10min): niets hier is realtime-kritisch.
 *
 * FAALT DE FETCH, DAN IS DE LIJST LEEG en is `geladen` tóch true. Een
 * vragenlijst is een uitnodiging, geen functie die de app mag blokkeren.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { UitnodigingStaat } from '@/lib/questionnaires/verspreiding'

/**
 * Eén vragenlijst met je eigen voortgang, zoals GET /api/questionnaires 'm
 * levert. De velden vanaf `created_at` zijn met ADR 0147 bijgekomen en staan
 * OPTIONEEL in het type: oudere aanroepers (en hun tests) leveren ze niet mee.
 */
export interface ActieveVragenlijst {
  id: string
  title: string
  description: string | null
  question_count: number
  answered_count: number
  has_open_session: boolean
  has_completed: boolean
  /** questionnaires.created_at — volgorde-fallback zonder uitnodigingsrij. */
  created_at?: string
  /** "Kun je 'm nu invullen?" — de N van de teller (ADR 0147). */
  open?: boolean
  /** `aan` = de beheerder zette de popup aan · `kandidaat` = mag nú verschijnen. */
  popup?: { aan: boolean; kandidaat: boolean }
  invitation?: UitnodigingStaat | null
}

export type VragenlijstSignaal = {
  lijsten: ActieveVragenlijst[]
  /** Aantal lijsten dat je nú kunt invullen — de teller op Fins bubbel. */
  openCount: number
  /** Hoogstens ÉÉN popup tegelijk; dit is de gekozen lijst (of null). */
  popupKandidaatId: string | null
  geladen: boolean
  /** Forceer een verse ophaal (slaat de rust-drempel over). */
  herlaad: () => void
}

interface SignaalResponse {
  questionnaires?: ActieveVragenlijst[]
  open_count?: number
  popup_kandidaat_id?: string | null
}

/** Rustdrempel voor de tab-terugkeer-ververs (egress-les: 10 minuten). */
const RUST_MS = 600_000

const VragenlijstSignaalContext = createContext<VragenlijstSignaal | null>(null)

const LEEG: ActieveVragenlijst[] = []

export function VragenlijstSignaalProvider({ children }: { children: ReactNode }) {
  const [lijsten, setLijsten] = useState<ActieveVragenlijst[]>(LEEG)
  const [openCount, setOpenCount] = useState(0)
  const [popupKandidaatId, setPopupKandidaatId] = useState<string | null>(null)
  const [geladen, setGeladen] = useState(false)
  const laatsteOphaalRef = useRef(0)
  // Volgnummer per ophaalronde: mount-fetch, `herlaad()` bij chat-open en de
  // herlaad na een popup-actie kunnen elkaar overlappen. Alleen het antwoord
  // van de LAATST gestarte ronde mag de staat zetten — anders wint een
  // verouderd antwoord en springt de badge terug (eindreview 15-09-2026, #4).
  const volgnummerRef = useRef(0)

  const haalOp = useCallback(async () => {
    laatsteOphaalRef.current = Date.now()
    const mijnVolgnummer = ++volgnummerRef.current
    const isActueel = () => mijnVolgnummer === volgnummerRef.current
    try {
      const res = await fetch('/api/questionnaires')
      if (!isActueel()) return
      if (!res.ok) {
        setLijsten(LEEG)
        setOpenCount(0)
        setPopupKandidaatId(null)
        return
      }
      const data = (await res.json()) as SignaalResponse | null
      if (!isActueel()) return
      const rijen = Array.isArray(data?.questionnaires) ? data.questionnaires : LEEG
      setLijsten(rijen)
      // `open_count` komt van de server (canonieke telling via `telOpen`). Valt
      // hij weg, dan tellen we de rijen die zichzelf `open` noemen — nooit een
      // eigen tweede definitie van "open".
      setOpenCount(
        typeof data?.open_count === 'number'
          ? data.open_count
          : rijen.filter((l) => l.open).length,
      )
      setPopupKandidaatId(
        typeof data?.popup_kandidaat_id === 'string' ? data.popup_kandidaat_id : null,
      )
    } catch {
      if (!isActueel()) return
      setLijsten(LEEG)
      setOpenCount(0)
      setPopupKandidaatId(null)
    } finally {
      if (isActueel()) setGeladen(true)
    }
  }, [])

  useEffect(() => {
    void haalOp()
    const onZichtbaar = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - laatsteOphaalRef.current < RUST_MS) return
      void haalOp()
    }
    document.addEventListener('visibilitychange', onZichtbaar)
    return () => document.removeEventListener('visibilitychange', onZichtbaar)
  }, [haalOp])

  const herlaad = useCallback(() => {
    void haalOp()
  }, [haalOp])

  const waarde = useMemo<VragenlijstSignaal>(
    () => ({ lijsten, openCount, popupKandidaatId, geladen, herlaad }),
    [lijsten, openCount, popupKandidaatId, geladen, herlaad],
  )

  return (
    <VragenlijstSignaalContext.Provider value={waarde}>
      {children}
    </VragenlijstSignaalContext.Provider>
  )
}

/** Binnen de provider. Gooit erbuiten — bedoeld voor de popup in de app-shell. */
export function useVragenlijstSignaal(): VragenlijstSignaal {
  const ctx = useContext(VragenlijstSignaalContext)
  if (!ctx) throw new Error('useVragenlijstSignaal must be used within VragenlijstSignaalProvider')
  return ctx
}

/**
 * Niet-gooiende variant: `null` buiten de provider. Voor leaf-componenten die
 * ook los renderen (Fins badge, unit-tests, shell-fragmenten) — die horen
 * stilletjes niets te tonen in plaats van hun boom te laten crashen.
 */
export function useVragenlijstSignaalOptional(): VragenlijstSignaal | null {
  return useContext(VragenlijstSignaalContext)
}
