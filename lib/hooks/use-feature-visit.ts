'use client'

import { useEffect } from 'react'

/**
 * useFeatureVisit — leg vast dát de gebruiker een functie heeft bekeken.
 *
 * WAAROM. Ongeveer de helft van de welkomstgids bestaat uit "heb je hier al
 * gekeken"-stappen (bekijk je grafiek, je vaste lasten, het nieuws). Die zijn
 * per definitie niet uit financiële data af te leiden — er moet een bezoek-
 * register zijn. Dat register bestáát (`user_feature_visits`, met unieke sleutel
 * en eigen-rij-RLS) en heeft een werkende `POST /api/feature-visits`; wat
 * ontbrak was een schrijver, sinds de discover-carrousel is verwijderd.
 *
 * SCHRIJFDISCIPLINE. Het register beantwoordt voor de gids één vraag: "ooit
 * bekeken?". Eén POST per slug per browsersessie is daarvoor ruim genoeg, dus
 * een sessionStorage-vlag houdt navigatie heen-en-weer buiten de database. Zo
 * kost de tracking geen extra server-read op élke route (het alternatief — de
 * bezochte slugs meesturen vanaf de server — zou de shell-layout op iedere
 * route een query duurder maken voor een schrijfactie die hooguit één keer per
 * sessie nodig is).
 *
 * Faalt de POST, dan gebeurt er niets zichtbaars: de gidsstap blijft gewoon
 * handmatig afvinkbaar.
 */

const SESSION_PREFIX = 'feature_visit:'

function alreadyRecordedThisSession(slug: string): boolean {
  try {
    return sessionStorage.getItem(`${SESSION_PREFIX}${slug}`) === '1'
  } catch {
    // sessionStorage geblokkeerd (private mode/embed): dan maar één POST per
    // navigatie — de route is idempotent (upsert op de unieke sleutel).
    return false
  }
}

function markRecordedThisSession(slug: string): void {
  try {
    sessionStorage.setItem(`${SESSION_PREFIX}${slug}`, '1')
  } catch {
    /* no-op */
  }
}

/** Registreer één of meer feature-slugs als bezocht. Lege lijst = geen effect. */
export function useFeatureVisit(slugs: readonly string[]): void {
  // De array-identiteit wisselt per render; de INHOUD is wat telt.
  const key = slugs.join(',')

  useEffect(() => {
    const todo = key
      .split(',')
      .filter((s) => s.length > 0 && !alreadyRecordedThisSession(s))
    if (todo.length === 0) return

    let cancelled = false
    for (const slug of todo) {
      // Optimistisch markeren: een tweede render in dezelfde sessie mag niet
      // opnieuw posten, ook niet terwijl deze fetch nog loopt.
      markRecordedThisSession(slug)
      fetch('/api/feature-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_slug: slug }),
        keepalive: true,
      }).catch(() => {
        if (!cancelled) {
          // Mislukt → de vlag weer weg, zodat een volgende navigatie het
          // opnieuw probeert.
          try {
            sessionStorage.removeItem(`${SESSION_PREFIX}${slug}`)
          } catch {
            /* no-op */
          }
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [key])
}
