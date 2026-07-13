'use client'

import { useEffect, useState } from 'react'

/**
 * Bepaalt of er in de huidige nieuws-editie minstens één ongelezen artikel
 * staat — voedt de freshness-dot op de "Nieuws"-rij in de sidebar.
 *
 * Eénmalige fetch op mount (geen polling): `/api/news?peek=1` retourneert in
 * cache-only-modus ALLEEN de id's van de huidige editie (`{ ids, peek }`) —
 * de volledige payload wordt hier niet opgehaald om egress te beperken. De
 * `/api/news/read`-endpoint levert de set gelezen ids. Onbekend = ongelezen →
 * dot groen zodra er een id is dat niet in `readIds` voorkomt.
 *
 * Egress/kosten-keuze: de Nieuws-rij rendert op élke app-pagina, dus deze hook
 * vuurt overal. Daarom de `peek=1`-modus — de gewone `GET /api/news` start bij
 * een koude cache een fire-and-forget AI-generatie (token-kosten + egress); de
 * peek-modus is puur leeswerk, retourneert enkel id's, en triggert dat NOOIT.
 * Geen polling. Defensief: bij loading/fout retourneert hij `false` zodat de
 * dot grijs blijft i.p.v. ten onrechte groen.
 */
// Module-scoped: krijgt dit account een 403 (abonnement-gating), dan is elke
// volgende mount-fetch deze sessie zinloos — zonder guard hamert de hook bij
// elke navigatie opnieuw op het endpoint (8× 403 gezien in de spotcheck).
let newsPeekForbidden = false

export function useNewsUnread(): boolean {
  const [hasUnread, setHasUnread] = useState(false)

  useEffect(() => {
    if (newsPeekForbidden) return
    let cancelled = false
    ;(async () => {
      try {
        const [newsRes, readRes] = await Promise.all([
          fetch('/api/news?peek=1'),
          fetch('/api/news/read'),
        ])
        if (newsRes.status === 403 || readRes.status === 403) {
          newsPeekForbidden = true
          return
        }
        if (!newsRes.ok || !readRes.ok) return
        const newsData = (await newsRes.json()) as { ids?: Array<string | undefined> }
        const readData = (await readRes.json()) as { readIds?: string[] }
        const ids = newsData.ids ?? []
        const readIds = readData.readIds ?? []
        const unread = ids.some((id) => id != null && !readIds.includes(id))
        if (!cancelled) setHasUnread(unread)
      } catch {
        // Stil falen — dot blijft grijs (progressive enhancement).
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return hasUnread
}
