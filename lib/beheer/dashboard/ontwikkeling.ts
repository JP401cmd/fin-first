import type { WebVitalMetric } from '@/lib/web-vitals/config'
import type { FoutMomenten, VitalsReeks } from './loader'
import { laatsteDagen, reeksLengteVoor, telPerDag, vergelijkPerioden, type DagPunt, type PeriodeVergelijking } from './reeksen'
import type { Bron } from './status'
import { amsterdamDag, dagenTotEnMet } from './tijd'

/**
 * Het verloop achter de kerncijfers van het dashboard: foutvoorvallen per dag
 * en de laadtijd per dag. (AI-aanroepen: `ai-reeks.ts`; gebruik per week:
 * `gebruik-trend.ts`.)
 *
 * Puur: geen IO.
 */

export interface FoutenVerloop {
  /** De dagen van de gekozen periode, vandaag inbegrepen. */
  reeks: DagPunt[]
  /** De volledige reeks over twee periodes, voor vóór/na-metingen. */
  volledig: DagPunt[]
  vergelijking: PeriodeVergelijking
  /** Oudste regel van een afgekapt leesvenster, anders `null`. */
  afgekaptVanaf: string | null
  vensterGrootte: number
}

export function bouwFoutenVerloop(
  momenten: FoutMomenten,
  welke: 'alle' | 'ai',
  opties: { nu: Date; dagen: number },
): FoutenVerloop {
  const volledig = telPerDag(momenten[welke], {
    nu: opties.nu,
    dagen: reeksLengteVoor(opties.dagen),
    afgekaptVanaf: momenten.afgekaptVanaf,
  })
  return {
    reeks: laatsteDagen(volledig, opties.dagen),
    volledig,
    vergelijking: vergelijkPerioden(volledig, opties),
    afgekaptVanaf: momenten.afgekaptVanaf,
    vensterGrootte: momenten.vensterGrootte,
  }
}

export interface VitalsDagPunt {
  dag: string
  /** p75 van die dag; `null` = die dag zijn er geen metingen binnengekomen. */
  p75: number | null
  metingen: number
  lopend: boolean
}

export interface VitalsVerloop {
  metric: WebVitalMetric
  dagen: number
  /** p75 over de hele periode; `null` = geen metingen. */
  p75: number | null
  metingen: number
  reeks: VitalsDagPunt[]
}

/**
 * De p75 per dag voor één maat. Een dag zonder metingen heeft geen p75: dat is
 * "niet gemeten", geen laadtijd van nul.
 */
export function bouwVitalsVerloop(
  reeks: VitalsReeks,
  metric: WebVitalMetric,
  nu: Date,
): VitalsVerloop {
  const vandaag = amsterdamDag(nu)
  const perDag = new Map(reeks.perDag.filter((r) => r.metric === metric).map((r) => [r.dag, r]))
  const som = reeks.samenvatting.find((s) => s.metric === metric)
  return {
    metric,
    dagen: reeks.dagen,
    p75: som && som.metingen > 0 ? som.p75 : null,
    metingen: som?.metingen ?? 0,
    reeks: dagenTotEnMet(vandaag, reeks.dagen).map((dag) => {
      const r = perDag.get(dag)
      return {
        dag,
        p75: r && r.metingen > 0 ? r.p75 : null,
        metingen: r?.metingen ?? 0,
        lopend: dag === vandaag,
      }
    }),
  }
}

/** Een bron die gelezen is, of de reden waarom niet. */
export function bronStatus<T>(bron: Bron<T>): 'ok' | 'meting-mislukt' | 'nvt' {
  return bron.soort === 'ok' ? 'ok' : bron.soort === 'niet-uitgerold' ? 'nvt' : 'meting-mislukt'
}
