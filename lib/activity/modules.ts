/**
 * App-delen voor de gebruiksmeting per module (ADR 0147, fase 2).
 *
 * WAT HIER GEMETEN WORDT — EN WAT NIET. Eén rij per gebruiker, per Amsterdamse
 * kalenderdag, per app-deel: "op deze dag gebruikte je Toekomst". Geen route,
 * geen tijdstip, geen aantal kliks, geen tijd-op-pagina, geen inhoud. Dezelfde
 * grens als `user_activity_days` (ADR 0146), één niveau fijner — precies fijn
 * genoeg om vier waardestromen van elkaar te onderscheiden, en niet fijner.
 *
 * De sleutels zijn een GESLOTEN lijst: de database dwingt dezelfde lijst af met
 * een CHECK, zodat een client geen route-log kan wegschrijven via een vrije
 * tekstkolom. Een nieuwe sleutel = een migratie + deze lijst, in één PR.
 */

export const ACTIVITY_MODULES = [
  'overzicht',
  'bezittingen',
  'schulden',
  'budget',
  'belasting',
  'toekomst',
  'rapportages',
  'berichten',
  'nieuws',
  'mijn',
  'fin',
] as const

export type ActivityModule = (typeof ACTIVITY_MODULES)[number]

/** Leesbare naam per module, voor beheer (waardestromen samenstellen). */
export const MODULE_LABELS: Record<ActivityModule, string> = {
  overzicht: 'Overzicht',
  bezittingen: 'Bezittingen',
  schulden: 'Schulden',
  budget: 'Budget en transacties',
  belasting: 'Belasting',
  toekomst: 'Toekomst',
  rapportages: 'Rapportages',
  berichten: 'Berichten',
  nieuws: 'Nieuws',
  mijn: 'Mijn (instellingen)',
  fin: 'Fin (chat)',
}

export function isActivityModule(waarde: unknown): waarde is ActivityModule {
  return typeof waarde === 'string' && (ACTIVITY_MODULES as readonly string[]).includes(waarde)
}

/**
 * Voorvoegsel → module, langste eerst. De legacy-backingroutes (`/core/*`,
 * `/horizon/*`, `/dashboard`) tellen mee onder het app-deel waar ze voor de
 * gebruiker bij horen. `fin` heeft geen route: die meldt het chatvenster zelf.
 */
const VOORVOEGSELS: ReadonlyArray<readonly [string, ActivityModule]> = [
  ['/overzicht/bezittingen', 'bezittingen'],
  ['/overzicht/schulden', 'schulden'],
  ['/overzicht/budget', 'budget'],
  ['/overzicht/belasting', 'belasting'],
  ['/overzicht', 'overzicht'],
  ['/core/assets', 'bezittingen'],
  ['/core/debts', 'schulden'],
  ['/core/budgets', 'budget'],
  ['/core/cash', 'budget'],
  ['/core', 'overzicht'],
  ['/dashboard', 'overzicht'],
  ['/toekomst', 'toekomst'],
  ['/horizon', 'toekomst'],
  ['/rapportages', 'rapportages'],
  ['/berichten', 'berichten'],
  ['/nieuws', 'nieuws'],
  ['/mijn', 'mijn'],
]

/**
 * Het app-deel bij een pathname, of `null` als het pad niet meetelt (beheer,
 * onboarding, landing, onbekend). Matcht op hele padsegmenten: `/overzichten`
 * is géén `/overzicht`.
 */
export function moduleVanPad(pathname: string | null | undefined): ActivityModule | null {
  if (!pathname) return null
  const pad = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  for (const [voorvoegsel, module] of VOORVOEGSELS) {
    if (pad === voorvoegsel || pad.startsWith(`${voorvoegsel}/`)) return module
  }
  return null
}
