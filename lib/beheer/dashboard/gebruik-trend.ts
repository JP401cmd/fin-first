import type { Cel } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import { amsterdamDag, verschuifDag, weekVanDag } from './tijd'

/**
 * Actieve gebruikers per week, voor het kerncijfer op het beheerdashboard.
 *
 * De cijfers komen uit de gebruiksanalyse van `/beheer/gebruik` (ADR 0153):
 * extern segment, band "laatste 30 dagen", al onderdrukt onder k = 5. Deze
 * module rekent niets uit over personen; zij kiest alleen welke twee weken
 * naast elkaar staan.
 *
 * ALLEEN VOLLE WEKEN TELLEN. De bron bouwt zijn weken uit de dagen binnen de
 * band. De lopende week is dus nog niet af, en de eerste week van de band is
 * aan de voorkant afgekapt zodra de band niet op een maandag begint. Een week
 * van vijf dagen naast een week van zeven verzint groei of krimp. Beide weken
 * staan in de reeks, gemarkeerd als onvolledig, en tellen niet mee in de
 * vergelijking.
 *
 * EEN ONDERDRUKTE WEEK HEEFT GEEN GETAL. Is een van beide weken "< 5" of
 * verborgen, dan is er geen verschil: het verschil tonen zou de onderdrukte
 * waarde prijsgeven.
 *
 * Puur: geen IO.
 */

export interface WeekPuntTrend {
  week: string
  actief: Cel
  nieuw: Cel
  /** De week van vandaag: nog niet afgelopen. */
  lopend: boolean
  /** De eerste week van de band, waarvan de eerste dagen buiten de band vallen. */
  afgekapt: boolean
}

export interface GebruikTrend {
  weken: WeekPuntTrend[]
  laatsteVolle: WeekPuntTrend | null
  daarvoor: WeekPuntTrend | null
  /** Verschil in actieve gebruikers; `null` als een van beide weken geen getal draagt. */
  verschil: number | null
}

export interface GebruikTrendOpties {
  nu: Date
  /** Lengte van de band in dagen, vandaag inbegrepen (de `vensterDagen` van de bron). */
  bandDagen: number
}

export function bouwGebruikTrend(
  weektrend: readonly { week: string; actief: Cel; nieuw: Cel }[],
  opties: GebruikTrendOpties,
): GebruikTrend {
  const vandaag = amsterdamDag(opties.nu)
  const dezeWeek = weekVanDag(vandaag)
  // De week waarin de band begint, is afgekapt tenzij de band op een maandag
  // begint: dan is ook de dag ervoor een andere week.
  const bandStart = verschuifDag(vandaag, -(opties.bandDagen - 1))
  const startWeek = weekVanDag(bandStart)
  const startWeekAfgekapt = weekVanDag(verschuifDag(bandStart, -1)) === startWeek

  const weken = [...weektrend]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((w) => ({
      ...w,
      lopend: w.week === dezeWeek,
      afgekapt: startWeekAfgekapt && w.week === startWeek && w.week !== dezeWeek,
    }))

  // Een week ná de lopende bestaat niet; zou de bron er toch één leveren, dan
  // telt die evenmin als volle week.
  const vol = weken.filter((w) => w.week < dezeWeek && !w.afgekapt)
  const laatsteVolle = vol[vol.length - 1] ?? null
  const daarvoor = vol[vol.length - 2] ?? null

  const verschil =
    laatsteVolle?.actief.soort === 'waarde' && daarvoor?.actief.soort === 'waarde'
      ? laatsteVolle.actief.n - daarvoor.actief.n
      : null

  return { weken, laatsteVolle, daarvoor, verschil }
}
