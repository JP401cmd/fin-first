import { Sigma, CalendarCheck, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import {
  FISCALE_KERNGETALLEN,
  FISCALE_DRIFT_PUNTEN,
  FISCAL_DOMAINS,
  buildJaarChecklist,
  type FiscaalKerngetal,
} from '@/lib/fiscale-kerngetallen'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'

export const metadata = {
  title: 'Fiscale kerngetallen — Beheer',
}

const FREQ_LABEL: Record<FiscaalKerngetal['updateFrequency'], string> = {
  jaarlijks: 'Jaarlijks bijwerken',
  meerjaarlijks: 'Meerjaarlijks',
  zelden: 'Zelden (aanname)',
}

function formatVerified(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Zet valuesByYear om naar een rij-per-label matrix met een kolom per jaar
 * (en 'Vast' voor jaaronafhankelijke waarden), zodat jaren naast elkaar
 * vergelijkbaar zijn.
 */
function buildMatrix(k: FiscaalKerngetal): { columns: string[]; rows: { label: string; cells: (string | null)[] }[] } {
  const columns = k.valuesByYear.map((v) => (v.year != null ? String(v.year) : 'Vast'))
  const labels: string[] = []
  for (const row of k.valuesByYear) {
    for (const v of row.values) {
      if (!labels.includes(v.label)) labels.push(v.label)
    }
  }
  const rows = labels.map((label) => ({
    label,
    cells: k.valuesByYear.map((row) => row.values.find((v) => v.label === label)?.value ?? null),
  }))
  return { columns, rows }
}

export default function FiscaleKerngetallenPage() {
  const checklist = buildJaarChecklist()
  const openDrift = FISCALE_DRIFT_PUNTEN.filter((d) => d.status === 'open')
  const jaargelaagd = FISCALE_KERNGETALLEN.filter((k) => k.jaargelaagd)
  const openChecklist = checklist.items.filter((i) => !i.hasTargetYear)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Sigma className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Fiscale kerngetallen</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Read-only inventaris van de jaargebonden fiscale en financiële constanten in de rekenmotoren:
          waarde(n) per jaar, bronbestand, bron-instantie, update-frequentie en verificatiestatus.
          Waarden worden live uit de code gelezen — dit scherm kan dus niet driften. Actief belastingjaar: <strong>{CURRENT_TAX_YEAR}</strong>.
        </p>
      </div>

      {/* Samenvatting */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--ink)]">{FISCALE_KERNGETALLEN.length}</div>
          <div className="text-xs text-[var(--ink-3)]">Kerngetallen</div>
        </div>
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--ink)]">{jaargelaagd.length}</div>
          <div className="text-xs text-[var(--ink-3)]">Jaargelaagd</div>
        </div>
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
          <div className={`text-2xl font-bold ${openChecklist.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {openChecklist.length}
          </div>
          <div className="text-xs text-[var(--ink-3)]">Te verifiëren voor {checklist.targetYear}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
          <div className={`text-2xl font-bold ${openDrift.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {openDrift.length}
          </div>
          <div className="text-xs text-[var(--ink-3)]">Drift-punten open</div>
        </div>
      </div>

      {/* Jaar-checklist */}
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-amber-700" />
          <h3 className="text-sm font-semibold text-amber-900">Jaar-checklist {checklist.targetYear}</h3>
        </div>
        <p className="mt-1 text-xs text-amber-800">
          Alle jaarlijks bij te werken kerngetallen. Een jaargelaagde bron is klaar zodra de {checklist.targetYear}-laag
          is toegevoegd; losse constanten vereisen altijd een handmatige verificatie tegen de bron.
        </p>
        <ul className="mt-3 space-y-1.5">
          {checklist.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              {item.hasTargetYear ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              )}
              <span className="text-amber-900">
                <span className="font-medium">{item.title}</span>
                <span className="text-amber-800/80"> — {item.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Drift-punten */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          Drift-punten (dubbelingen in de code)
        </h3>
        {FISCALE_DRIFT_PUNTEN.map((d) => (
          <div key={d.id} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-sm font-semibold text-[var(--ink)]">{d.title}</h4>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  d.status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                }`}
              >
                {d.status === 'open' ? 'Open' : 'Opgelost'}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--ink-2)]">{d.description}</p>
            <p className="mt-2 font-mono text-xs text-[var(--ink-4)]">{d.files.join(' · ')}</p>
          </div>
        ))}
        <p className="text-xs text-[var(--ink-4)]">
          Het structureel wegnemen van de open punten (DB-override-laag met historie en resolver) is bewust een
          vervolgkaart (Fase 2) — dit scherm is de read-only inventaris.
        </p>
      </section>

      {/* Catalogus per domein */}
      {FISCAL_DOMAINS.map((domain) => {
        const items = FISCALE_KERNGETALLEN.filter((k) => k.domain === domain)
        if (items.length === 0) return null
        return (
          <section key={domain} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-3)]">{domain}</h3>
            {items.map((k) => {
              const matrix = buildMatrix(k)
              return (
                <div key={k.id} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
                  <div className="border-b border-[var(--border-ed)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-[var(--ink)]">{k.title}</h4>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          k.jaargelaagd ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {k.jaargelaagd ? `Jaargelaagd (${k.years.join(', ')})` : 'Losse constante'}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-[var(--subtle)] px-2 py-0.5 text-xs font-medium text-[var(--ink-3)]">
                        {FREQ_LABEL[k.updateFrequency]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--ink-3)]">{k.summary}</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--subtle)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ink-3)]">
                          <th className="px-4 py-2">Onderdeel</th>
                          {matrix.columns.map((c) => (
                            <th key={c} className="px-4 py-2">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-ed)]">
                        {matrix.rows.map((row) => (
                          <tr key={row.label}>
                            <td className="px-4 py-2 text-[var(--ink-2)]">{row.label}</td>
                            {row.cells.map((cell, i) => (
                              <td key={i} className="px-4 py-2 font-medium tabular-nums text-[var(--ink)]">
                                {cell ?? '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border-ed)] px-4 py-3 text-xs text-[var(--ink-4)]">
                    <span>
                      Bron: <span className="font-medium text-[var(--ink-3)]">{k.source}</span>
                      {k.sourceUrl && (
                        <a
                          href={k.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 inline-flex items-center gap-0.5 underline hover:text-[var(--ink-2)]"
                        >
                          verifiëren <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </span>
                    <span className="font-mono">{k.file} · {k.exportName}</span>
                    <span>Laatst geverifieerd: {formatVerified(k.lastVerified)}</span>
                  </div>

                  {k.note && (
                    <div className="border-t border-[var(--border-ed)] px-4 py-3 text-xs text-[var(--ink-3)]">
                      {k.note}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
