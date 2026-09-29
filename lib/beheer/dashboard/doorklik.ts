/**
 * Doorklikroutes van het beheerdashboard naar de bestaande beheerschermen.
 *
 * Eén plek, zodat het dashboard en het doelscherm dezelfde parameter- en
 * ankernamen gebruiken: een doorklik die een filter meegeeft dat het doelscherm
 * niet leest, belooft context die er niet is.
 *
 * De periode van het dashboard (7, 30 of 90 dagen) gaat mee waar het doelscherm
 * een periode kent. Kent het doelscherm een andere reeks, dan kiest de functie
 * de dichtstbijzijnde bestaande waarde en nooit een eigen.
 */

export const DASHBOARD_PERIODES = [7, 30, 90] as const
export type DashboardPeriode = (typeof DASHBOARD_PERIODES)[number]
export const DASHBOARD_STANDAARD_PERIODE: DashboardPeriode = 30

export const DASHBOARD_ONDERWERPEN = ['overzicht', 'betrouwbaarheid', 'ai', 'ingrepen'] as const
export type DashboardOnderwerp = (typeof DASHBOARD_ONDERWERPEN)[number]

export const ONDERWERP_LABEL: Record<DashboardOnderwerp, string> = {
  overzicht: 'Overzicht',
  betrouwbaarheid: 'Betrouwbaarheid',
  ai: 'Fin & AI',
  ingrepen: 'Ingrepen',
}

function eerste(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw
}

export function parsePeriode(raw: unknown): DashboardPeriode {
  const n = Number(eerste(raw))
  return (DASHBOARD_PERIODES as readonly number[]).includes(n)
    ? (n as DashboardPeriode)
    : DASHBOARD_STANDAARD_PERIODE
}

export function parseOnderwerp(raw: unknown): DashboardOnderwerp {
  const v = eerste(raw)
  return (DASHBOARD_ONDERWERPEN as readonly unknown[]).includes(v)
    ? (v as DashboardOnderwerp)
    : 'overzicht'
}

/** Het dashboard zelf; standaardwaarden blijven uit de URL. */
export function dashboardHref(
  onderwerp: DashboardOnderwerp = 'overzicht',
  dagen: DashboardPeriode = DASHBOARD_STANDAARD_PERIODE,
): string {
  const params = new URLSearchParams()
  if (onderwerp !== 'overzicht') params.set('onderwerp', onderwerp)
  if (dagen !== DASHBOARD_STANDAARD_PERIODE) params.set('dagen', String(dagen))
  const query = params.toString()
  return query ? `/beheer?${query}` : '/beheer'
}

// ── Achtergrondtaken ────────────────────────────────────────────────

/** Anker van de kaart van één taak op /beheer/jobs. */
export function taakAnker(jobKey: string): string {
  return `taak-${jobKey}`
}

export function taakHref(jobKey?: string): string {
  return jobKey ? `/beheer/jobs#${taakAnker(jobKey)}` : '/beheer/jobs'
}

// ── Foutmeldingen ───────────────────────────────────────────────────

/** Queryparameter waarmee /beheer/errors één foutsoort uitlicht. */
export const FOUT_SOORT_PARAM = 'soort'
/** Queryparameter waarmee /beheer/errors op een context-prefix filtert. */
export const FOUT_CONTEXT_PARAM = 'context'

export function foutenHref(filter: { soort?: string; context?: string } = {}): string {
  const params = new URLSearchParams()
  if (filter.soort) params.set(FOUT_SOORT_PARAM, filter.soort)
  if (filter.context) params.set(FOUT_CONTEXT_PARAM, filter.context)
  const query = params.toString()
  return query ? `/beheer/errors?${query}` : '/beheer/errors'
}

// ── Audit-trail ─────────────────────────────────────────────────────

/** Queryparameter waarmee /beheer/audit op één actie filtert. */
export const AUDIT_ACTIE_PARAM = 'actie'

export function auditHref(actie?: string): string {
  return actie ? `/beheer/audit?${AUDIT_ACTIE_PARAM}=${encodeURIComponent(actie)}` : '/beheer/audit'
}

// ── Schermen met een eigen periodefilter ────────────────────────────

/** /beheer/webprestaties kent 7, 28 en 90 dagen. */
const WEBPRESTATIES_PERIODE: Record<DashboardPeriode, number> = { 7: 7, 30: 28, 90: 90 }

export function webprestatiesPeriode(dagen: DashboardPeriode): number {
  return WEBPRESTATIES_PERIODE[dagen]
}

export function webprestatiesHref(dagen: DashboardPeriode, metric?: string): string {
  const params = new URLSearchParams({ dagen: String(webprestatiesPeriode(dagen)) })
  if (metric) params.set('metric', metric)
  return `/beheer/webprestaties?${params.toString()}`
}

/** /beheer/ai-verbruik kent dezelfde reeks als het dashboard. */
export function aiVerbruikHref(dagen: DashboardPeriode): string {
  return `/beheer/ai-verbruik?dagen=${dagen}`
}

/**
 * /beheer/gebruik werkt met banden die elkaar niet overlappen (ADR 0153); de
 * band "laatste 30 dagen" is de enige die tot vandaag loopt. Het dashboard
 * toont die band, dus daar komt de doorklik ook uit.
 */
export function gebruikHref(): string {
  return '/beheer/gebruik?dagen=30'
}
