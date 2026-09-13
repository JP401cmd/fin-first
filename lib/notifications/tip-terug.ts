/**
 * "Je uitgestelde tip is terug" — één bericht per aanbeveling waarvan de
 * uitsteltermijn verstreken is.
 *
 * Vervangt de teller op Fins bubbel in de nav-pill (sep 2026). Die teller was
 * een getal zonder inhoud: je zag dát er iets klaarstond, niet wát, en hij
 * leefde buiten het berichtencentrum. Nu komt elke tip die terug is als eigen
 * bericht binnen, met de tip-titel erin.
 *
 * Pure producent, gewired in `app/api/notifications/route.ts`. Het oordeel "is
 * de wachttijd voorbij?" komt uit `lib/recommendation-status.ts` — dezelfde bron
 * die de tips-pagina gebruikt. Zo verschijnt het bericht nooit eerder (of later)
 * dan de tip zelf weer op /overzicht/tips staat.
 *
 * Dedupe zit in de id: `postponed_tip_<id>_<postponed_until>`. Stelt de
 * gebruiker dezelfde tip opnieuw uit en verloopt die termijn ook, dan is dat een
 * nieuw moment en dus een nieuw bericht; een poll binnen hetzelfde moment levert
 * steeds dezelfde id op, en de read-state en historie doen de rest.
 *
 * Intrekken ({@link retractStaleTipTerug}): een bericht blijft alleen staan
 * zolang het nog waar is. Wordt de tip geaccepteerd, genegeerd of opnieuw
 * uitgesteld, dan hoort "je wachttijd is voorbij" niet meer in het
 * berichtencentrum — ook niet in de 30-daagse historie. Omdat de termijn in de
 * id zit, is "nog geldig" exact: de id staat in de set van deze poll.
 */

import {
  isRecommendationOpen,
  type RecommendationOpenState,
} from '@/lib/recommendation-status'

/** De kolommen die de route ophaalt — smal gehouden, zie de select in de route. */
export const TIP_TERUG_COLUMNS = 'id, title, status, postponed_until'

/**
 * Hoe ver terug een verlopen termijn nog een bericht oplevert. Gelijk aan de
 * bewaartermijn van de meldingen-historie (30 dagen): ouder zou bij de eerste
 * poll na livegang een stapel berichten opleveren over tips die al weken
 * zichtbaar op de tips-pagina staan.
 */
export const TIP_TERUG_LOOKBACK_DAYS = 30

/**
 * Veiligheidsgrens op de query. Bewust GEEN inhoudelijke cap in de producent:
 * de set van deze poll is ook de geldigheidsset voor het intrekken, dus een
 * geldige tip die buiten een cap viel zou elke poll uit de historie verdwijnen.
 * Het 30-dagenvenster en het handmatige uitstellen houden de aantallen klein;
 * de bundeling in het berichtencentrum vouwt er meerdere tot één regel.
 */
export const TIP_TERUG_QUERY_LIMIT = 100

export type TipTerugRow = RecommendationOpenState & {
  id: string
  title: string | null
}

export interface TipTerugNotification {
  id: string
  type: 'postponed_tip'
  priority: number
  title: string
  description: string
  icon: string
  color: string
  actionUrl: string
  aiContext: string
}

/** `YYYY-MM-DD` van `days` dagen vóór `today` (beide datum-strings, UTC-rekenkunde). */
export function tipTerugLookbackStart(today: string, days = TIP_TERUG_LOOKBACK_DAYS): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * De berichten voor deze poll, meest recent verlopen eerst.
 *
 * @param rows  aanbevelingen van de gebruiker (de route filtert al grof op
 *              `status = 'postponed'`; hier volgt het fijne oordeel)
 * @param today `YYYY-MM-DD`, expliciet zodat de functie puur blijft
 */
export function buildTipTerugNotifications(
  rows: readonly TipTerugRow[],
  today: string,
): TipTerugNotification[] {
  const from = tipTerugLookbackStart(today)

  return rows
    .filter(
      (r) =>
        r.status === 'postponed' &&
        isRecommendationOpen(r, today) &&
        r.postponed_until != null &&
        r.postponed_until >= from,
    )
    .sort((a, b) => (b.postponed_until ?? '').localeCompare(a.postponed_until ?? ''))
    .map((r) => {
      const title = r.title?.trim() || 'Een tip van Fin'
      return {
        id: `postponed_tip_${r.id}_${r.postponed_until}`,
        type: 'postponed_tip',
        priority: 3,
        title: 'Uitgestelde tip is terug',
        description: `"${title}": je wachttijd is voorbij. Kijk of hij nu wel past.`,
        icon: 'Lightbulb',
        color: 'teal',
        // De tips-pagina, waar een teruggekeerde tip bovenaan zijn groep staat
        // en je er meteen over beslist (Doe nu / Later / Negeren).
        actionUrl: '/overzicht/tips',
        aiContext: `Ik had de tip "${title}" uitgesteld en de wachttijd is voorbij. Past hij nu bij mijn situatie?`,
      }
    })
}

/**
 * Haalt tip-terug-berichten uit een lijst (live of historie) die niet meer in de
 * geldige set van deze poll staan. Andere meldingstypen blijven onaangeroerd.
 *
 * Roep dit alleen aan met een set uit een GESLAAGDE query: een lege set na een
 * databasefout zou anders elk tip-bericht uit de historie vegen.
 */
export function retractStaleTipTerug<T extends { id: string; type: string }>(
  items: readonly T[],
  validIds: ReadonlySet<string>,
): T[] {
  return items.filter((n) => n.type !== 'postponed_tip' || validIds.has(n.id))
}
