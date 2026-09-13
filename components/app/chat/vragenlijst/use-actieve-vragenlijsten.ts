'use client'

import { useCallback, useEffect, useState } from 'react'

/** Eén actieve vragenlijst met je eigen voortgang, zoals GET /api/questionnaires 'm levert. */
export interface ActieveVragenlijst {
  id: string
  title: string
  description: string | null
  question_count: number
  answered_count: number
  has_open_session: boolean
  has_completed: boolean
}

/**
 * Welke vragenlijsten staan er open voor deze gebruiker? Opgehaald zodra het
 * chatvenster opengaat — niet bij elke paginawissel — zodat een vragenlijst die
 * de beheerder net live zette bij de volgende opening verschijnt.
 *
 * Faalt het ophalen, dan is de lijst leeg en verschijnt het icoon niet: een
 * vragenlijst is een uitnodiging, geen functie die de chat mag blokkeren.
 */
export function useActieveVragenlijsten(ingeschakeld: boolean) {
  const [lijsten, setLijsten] = useState<ActieveVragenlijst[]>([])
  const [geladen, setGeladen] = useState(false)
  const [versie, setVersie] = useState(0)

  useEffect(() => {
    if (!ingeschakeld) return
    let afgebroken = false
    fetch('/api/questionnaires')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { questionnaires?: ActieveVragenlijst[] } | null) => {
        if (afgebroken) return
        setLijsten(Array.isArray(data?.questionnaires) ? data.questionnaires : [])
        setGeladen(true)
      })
      .catch(() => {
        if (afgebroken) return
        setLijsten([])
        setGeladen(true)
      })
    return () => {
      afgebroken = true
    }
  }, [ingeschakeld, versie])

  const herlaad = useCallback(() => setVersie((v) => v + 1), [])

  return { lijsten, geladen, herlaad }
}
