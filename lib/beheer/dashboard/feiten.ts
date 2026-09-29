import type { AiHealthSnapshot } from '@/lib/ai/ai-health-loader'
import type { BeheerInboxCounts } from '@/lib/beheer-inbox-counts'
import type { KoppelingTellingen } from '@/lib/beheer/koppelingen-tellingen'
import type { JobStand } from '@/lib/job-health-loader'
import type { ScheduleDrift } from '@/lib/job-health'
import type { JobKey } from '@/lib/job-runs'
import type { BronKlasse } from '@/lib/news-bron-gezondheid'
import type { RuntimeEnvironment } from '@/lib/observability/runtime-environment'
import type { PlatformStatus } from '@/lib/platform-status'
import type { WebVitalMetric } from '@/lib/web-vitals/config'
import type { FoutsoortBeeld, Voorval } from './fouten'
import type { Bron, Impact } from './status'

/**
 * De feiten waarop het beheerdashboard zijn oordeel baseert.
 *
 * Scheiding die hier vastligt: de loader (`loader.ts`) LEEST, de afleidingen
 * (`signalen.ts`, `onderdelen.ts`) OORDELEN. De afleidingen krijgen alleen deze
 * vormen en zijn daardoor zonder database te testen.
 *
 * Elke bron die kan falen is een `Bron<T>`: een leesfout is geen lege uitkomst.
 */

export interface PlatformFeit {
  status: PlatformStatus
  /** Laatste wijziging van de instelling; `null` als die nooit is opgeslagen. */
  gewijzigdOp: string | null
}

export interface TakenFeit {
  standen: JobStand[]
  cronSecret: boolean
  pushKanaal: boolean
  drift: ScheduleDrift
}

export interface FoutenFeit {
  soorten: FoutsoortBeeld[]
  /** Telgegevens per foutregel. Dragen een volgnummer per gebruiker, geen id. */
  voorvallen: Voorval[]
  /** Er staan meer regels in de tabel dan het leesvenster bevat. */
  afgekapt: boolean
  /** Oudste regel in het leesvenster. */
  vensterVanaf: string | null
  vensterGrootte: number
}

/** Uitkomst van de laatste bereikbaarheidsmeting van externe diensten. */
export interface ProbeFeit {
  gemetenOp: string
  /** Diensten die van buitenaf te meten zijn: bereikbaar plus onbereikbaar. */
  gemeten: number
  bereikbaar: number
  onbereikbaar: string[]
  begrensd: number
  /**
   * Diensten zonder publiek meetpunt (ze vragen inloggegevens). Tellen niet mee
   * in `gemeten`: van deze diensten is de bereikbaarheid onbekend, niet slecht.
   */
  nietMeetbaar: number
}

/** Banksynchronisaties van de laatste dagen, per gebruiker samengevat. */
export interface BankSyncFeit {
  dagen: number
  pogingen: number
  mislukt: number
  /** Gebruikers met minstens één synchronisatie in de periode. */
  gebruikers: number
  /** Gebruikers van wie de LAATSTE synchronisatie in de periode mislukte. */
  gebruikersLaatsteMislukt: number
  /**
   * De leesactie raakte haar bovengrens: oudere pogingen in de periode zijn niet
   * gelezen. De tellingen zijn dan een ondergrens.
   */
  afgekapt: boolean
}

export interface KoppelingenFeit {
  tellingen: KoppelingTellingen
  /** `null` = nog nooit gemeten, of de uitkomst had een onverwachte vorm. */
  probe: ProbeFeit | null
  banksync: Bron<BankSyncFeit>
}

export interface MailFeit {
  ingericht: boolean
  dagen: number
  verzonden: number
  mislukt: number
  overgeslagen: number
  laatstePoging: string | null
}

export interface VitalsFeit {
  dagen: number
  omgeving: 'production'
  metrics: { metric: WebVitalMetric; p75: number; metingen: number }[]
}

/** Meldingen die gebruikers via de meldmodus instuurden (ADR 0096). */
export interface MeldingenFeit {
  dagen: number
  nieuw: number
  /** Nog niet in de werkqueue, de herstel-cron probeert het opnieuw. */
  wachtend: number
  /** Het maximale aantal pogingen is op; de cron pakt ze niet meer. */
  vastgelopen: number
  maxPogingen: number
}

export interface KrantFeit {
  bronnen: {
    gecontroleerdOp: string
    totaal: number
    nietGoed: { label: string; klasse: BronKlasse; oorzaak: string }[]
  } | null
  /**
   * Artikelen die na de laatste ophaalronde op duiding wachtten, zoals die
   * ronde het zelf vastlegde. `null` = de ronde droeg geen telling.
   */
  wachtrij: number | null
}

export interface FiscaalFeit {
  doeljaar: number
  /** Kerngetallen zonder jaarlaag voor het doeljaar. */
  open: number
  driftOpen: number
}

export interface DashboardFeiten {
  /** Moment van meten (ISO). */
  gemetenOp: string
  /**
   * De omgeving waarop dit scherm draait. De GEGEVENS komen uit de gekoppelde
   * database; de INSTELLINGEN uit de omgeving (CRON_SECRET, e-mailprovider,
   * meldkanaal) zijn die van deze ene server. Buiten productie zeggen die
   * instellingen niets over productie en worden ze niet beoordeeld.
   */
  omgeving: RuntimeEnvironment
  platform: Bron<PlatformFeit>
  ai: AiHealthSnapshot
  taken: Bron<TakenFeit>
  fouten: Bron<FoutenFeit>
  koppelingen: Bron<KoppelingenFeit>
  mail: Bron<MailFeit>
  vitals: Bron<VitalsFeit>
  meldingen: Bron<MeldingenFeit>
  krant: Bron<KrantFeit>
  inbakken: BeheerInboxCounts
  fiscaal: FiscaalFeit
}

/** Worden de instellingen uit de omgeving beoordeeld? Alleen op productie. */
export function omgevingTelt(feiten: Pick<DashboardFeiten, 'omgeving'>): boolean {
  return feiten.omgeving === 'production'
}

/**
 * Wat gebruikers merken als een achtergrondtaak niet (goed) draait.
 *
 * Gecureerd, net als de taakcatalogus zelf: de feiten (draaide hij, slaagde
 * hij) komen uit `job_runs`, de betekenis staat hier. Een `Record<JobKey, …>`,
 * zodat een nieuwe taak rood compileert tot zijn gevolg hier is benoemd.
 */
export const TAAK_GEVOLG: Record<JobKey, Impact> = {
  'holdings-prices': {
    soort: 'iedereen',
    toelichting: 'Koersen en saldi van beleggingen en crypto lopen achter; het vermogen op het overzicht ook.',
  },
  snapshots: {
    soort: 'iedereen',
    toelichting: 'De maandelijkse vermogenssnapshot ontbreekt; de historie in grafieken mist die maand.',
  },
  'news-ingest': {
    soort: 'iedereen',
    toelichting: 'Er komen geen nieuwe artikelen in de Krant.',
  },
  'briefing-email': {
    soort: 'onbekend',
    toelichting: 'Wie de wekelijkse briefing per e-mail aan heeft staan, krijgt hem niet.',
  },
  'user-reports-notion-sync': {
    soort: 'onbekend',
    toelichting: 'Meldingen van gebruikers die niet direct doorkwamen, bereiken de werkqueue niet.',
  },
  'integraties-health': {
    soort: 'geen-direct',
    toelichting: 'Gebruikers merken niets; de bereikbaarheid van externe diensten is dan niet gemeten.',
  },
  'web-vitals-retention': {
    soort: 'geen-direct',
    toelichting: 'Gebruikers merken niets; metingen blijven langer staan dan de bewaartermijn.',
  },
  retention: {
    soort: 'geen-direct',
    toelichting: 'Gebruikers merken niets; logregels blijven langer staan dan de vastgelegde bewaartermijn (AVG).',
  },
  'alerts-sweep': {
    soort: 'geen-direct',
    toelichting: 'Gebruikers merken niets; nieuwe fouten en stille taken worden niet gemeld.',
  },
  'krant-weekmeting': {
    soort: 'geen-direct',
    toelichting: 'Gebruikers merken niets; de weekmaat van de Krant ontbreekt of vraagt een blik.',
  },
  'krant-editie': {
    soort: 'geen-direct',
    toelichting: 'Gebruikers merken niets; de weekeditie wordt in de schaduw opgebouwd.',
  },
  'krant-tijdlijn': {
    soort: 'onbekend',
    toelichting:
      'Wie de bèta van de tijdlijn aan heeft, krijgt geen nieuwe berichten in zijn tijdlijn. Hoeveel lezers dat zijn, legt de taak niet vast.',
  },
  'krant-ochtend': {
    soort: 'geen-direct',
    toelichting: 'Gebruikers merken niets; na 48 uur neemt de nieuws-ingest het duiden zelf over.',
  },
}
