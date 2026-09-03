import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ReportActions } from './report-actions'

/**
 * /beheer/calculator-reports — admin-inbox voor gebruikersmeldingen op
 * gepubliceerde rekenhulpen.
 *
 * Toegang: admin-check gebeurt al in `app/(app)/beheer/layout.tsx`
 * via `isSuperAdmin(supabase)`. Hier dus géén extra redirect — alleen
 * de page-render.
 *
 * Dat die check slaagt geeft nog geen LEESRECHT: de query hieronder draait
 * op de anon RLS-client met de sessie van de beheerder. De lijst hangt dus
 * aan de policy `calculator_reports select own or superadmin`
 * (migratie `20260903110000`). Vóór die migratie bestond alleen een
 * eigen-rij SELECT en zag de beheerder uitsluitend zijn eigen meldingen —
 * een lege inbox die als "geen openstaande meldingen" werd gerenderd.
 * Vervang `createClient()` hier dus niet door een service-role-client, en
 * verwijder de policy niet: dan is de inbox weer stil leeg.
 *
 * Lijst: alle `calculator_reports` met status='open', oudste eerst is
 * niet logisch voor moderatie — we sorteren `created_at DESC` zodat
 * nieuwe meldingen bovenaan staan. De `idx_calculator_reports_open`
 * partial index dekt deze query (status='open' + created_at DESC).
 *
 * Acties (per item):
 *  - "Markeer als beoordeeld"  → status='reviewed'
 *  - "Verberg calculator"      → custom_calculators.is_public=false
 *                                 én publication-status='reviewed'
 *
 * Beide acties zijn server-actions (`<ReportActions>` is een client-
 * wrapper rond `'use server'`-functies in deze map). Reden voor server-
 * actions i.p.v. een nieuwe API-route: dit is een admin-only flow met
 * een tightly-coupled UI; een aparte REST-route zou meer ceremonie
 * toevoegen zonder bredere reuse.
 */
export default async function CalculatorReportsPage() {
  const supabase = await createClient()

  // JOIN handmatig: Supabase REST-client biedt foreign-key embed via de
  // automatische FK-detectie aan; we vragen `calculator_id`-FK naar
  // `custom_calculators` op (id, name, is_public) en reporter-naam uit
  // `profiles`.
  const { data: reports, error } = await supabase
    .from('calculator_reports')
    .select(
      `
      id,
      reason,
      status,
      created_at,
      calculator:custom_calculators!calculator_id (
        id,
        name,
        is_public
      ),
      reporter:profiles!reporter_id (
        id,
        full_name,
        marketplace_display_name
      )
    `,
    )
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div>
        <PageHeader />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Kon meldingen niet laden: {error.message}
        </div>
      </div>
    )
  }

  const rows = reports ?? []

  return (
    <div>
      <PageHeader />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 text-center text-sm text-[var(--ink-3)]">
          Geen openstaande meldingen.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            // Supabase typt FK-joins als array-of-rows OR single (afh. van
            // unique). Voor robuustheid normaliseren we naar de eerste rij.
            const calculator = normalizeJoin(row.calculator)
            const reporter = normalizeJoin(row.reporter)
            const reporterName =
              reporter?.marketplace_display_name ||
              reporter?.full_name ||
              'Anonieme melder'
            return (
              <li
                key={row.id}
                className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4"
              >
                <header className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                      Rekenhulp-melding
                    </div>
                    <h3 className="font-semibold text-sm text-[var(--ink)] mt-0.5 truncate">
                      {calculator?.name ?? '(verwijderde calculator)'}
                    </h3>
                    <div className="text-[11px] text-[var(--ink-3)] mt-0.5">
                      Door <span className="text-[var(--ink-2)]">{reporterName}</span>
                      {' · '}
                      <time dateTime={row.created_at}>{formatDate(row.created_at)}</time>
                      {calculator && !calculator.is_public && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700">
                          al verborgen
                        </span>
                      )}
                    </div>
                  </div>
                </header>

                <blockquote className="text-xs text-[var(--ink-2)] leading-relaxed border-l-2 border-[var(--border-ed)] pl-3 whitespace-pre-wrap break-words">
                  {row.reason}
                </blockquote>

                <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                  {calculator && (
                    <Link
                      href={`/toekomst/bibliotheek/${calculator.id}`}
                      className="text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] underline underline-offset-2"
                    >
                      Bekijk in bibliotheek →
                    </Link>
                  )}
                  <ReportActions
                    reportId={row.id}
                    calculatorId={calculator?.id ?? null}
                    canHide={Boolean(calculator?.is_public)}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function PageHeader() {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-[var(--ink)]">Rekenhulp-meldingen</h2>
      <p className="mt-1 text-sm text-[var(--ink-3)]">
        Inbox van gebruikers die een publieke rekenhulp hebben gemeld.
        Markeer een melding als beoordeeld nadat je er een beslissing op hebt
        genomen, of verberg de calculator wanneer hij echt niet kan blijven
        staan.
      </p>
    </div>
  )
}

/**
 * Korte NL-datum: "29 mei 14:32". Bewust kort; de exacte ISO staat
 * al in het `datetime`-attribuut voor toegankelijkheid.
 */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/**
 * Normaliseer een Supabase FK-join (kan single-row of array zijn,
 * afhankelijk van of de FK uniek is) naar één rij of null.
 */
function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
