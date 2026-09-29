'use client'

import { useEffect, useState } from 'react'
import { inflight } from '@/lib/inflight'

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
 *
 * ENTITLEMENT-GATE (perf fase 1): `/api/news?peek=1` zit áchter de AI-tier-gate
 * (`checkTierGate('ai')`) en geeft een gebruiker zónder AI-abonnement 403. De
 * client kent die entitlement al (FeatureAccessProvider) — de aanroeper geeft
 * daarom `enabled=false` door wanneer het recht ontbreekt, en we slaan de fetch
 * volledig over (0 calls, geen 403-lek). Default `true` voor backwards-compat.
 *
 * DEDUPE (perf fase 1): de peek+read-fetch loopt via `inflight('news-unread')`,
 * zodat meerdere gelijktijdige mounts van deze hook (de sidebar roept 'm per
 * "overige"-rij aan → ~4× per pageload) samen één netwerk-roundtrip delen i.p.v.
 * evenzoveel losse 403/200-calls.
 */
// TIJDLIJN (Krant 1C fase 2, B40): leest deze lezer de tijdlijn zonder AI, dan
// komt de stip uit `/api/krant/tijdlijn?peek=1` → `{ nieuw }` (een bericht
// nieuwer dan nieuwsprofiel.tijdlijn_gelezen_tot). Die route kent geen
// tier-poort; hij geeft 403 aan wie niet de tijdlijn leest — dan valt de hook
// terug op het AI-pad hieronder, maar alleen als het AI-recht er is (`enabled`).
// Een 403 op de tijdlijn wordt per sessie onthouden, net als die op /api/news.
let tijdlijnPeekForbidden = false

async function fetchTijdlijnUnread(): Promise<boolean | null> {
  const res = await fetch('/api/krant/tijdlijn?peek=1')
  if (res.status === 403) {
    tijdlijnPeekForbidden = true
    return null
  }
  if (!res.ok) return false
  const data = (await res.json()) as { nieuw?: boolean }
  return data.nieuw === true
}

// Module-scoped: krijgt dit account een 403 (abonnement-gating), dan is elke
// volgende mount-fetch deze sessie zinloos — zonder guard hamert de hook bij
// elke navigatie opnieuw op het endpoint (8× 403 gezien in de spotcheck).
let newsPeekForbidden = false

async function fetchNewsUnread(): Promise<boolean> {
  const [newsRes, readRes] = await Promise.all([
    fetch('/api/news?peek=1'),
    fetch('/api/news/read'),
  ])
  if (newsRes.status === 403 || readRes.status === 403) {
    newsPeekForbidden = true
    return false
  }
  if (!newsRes.ok || !readRes.ok) return false
  const newsData = (await newsRes.json()) as { ids?: Array<string | undefined> }
  const readData = (await readRes.json()) as { readIds?: string[] }
  const ids = newsData.ids ?? []
  const readIds = readData.readIds ?? []
  return ids.some((id) => id != null && !readIds.includes(id))
}

export function useNewsUnread(enabled = true): boolean {
  const [hasUnread, setHasUnread] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Eerst de tijdlijn (geen tier-poort). null = deze lezer leest de AI-Krant.
        if (!tijdlijnPeekForbidden) {
          const tijdlijn = await inflight('news-unread-tijdlijn', fetchTijdlijnUnread)
          if (tijdlijn !== null) {
            if (!cancelled) setHasUnread(tijdlijn)
            return
          }
        }
        // Recht ontbreekt (geen AI-abonnement) → nooit de 403-gate raken.
        if (!enabled || newsPeekForbidden) return
        // Gelijktijdige mounts delen één fetch (zie inflight).
        const unread = await inflight('news-unread', fetchNewsUnread)
        if (!cancelled) setHasUnread(unread)
      } catch {
        // Stil falen — dot blijft grijs (progressive enhancement).
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return hasUnread
}

/** Alleen voor tests: de per-sessie onthouden 403's vergeten. */
export function __resetNewsUnread(): void {
  tijdlijnPeekForbidden = false
  newsPeekForbidden = false
}
