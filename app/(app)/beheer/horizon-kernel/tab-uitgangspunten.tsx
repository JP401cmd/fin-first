'use client'

/**
 * Deel 1 — Uitgangspunten vanuit TriFinity: de RUWE invoer zoals die uit de app/DB
 * komt, met per veld de bron (tabel.kolom of instelling).
 */

import { formatCurrency } from '@/lib/format'
import { FieldTable, SectionCard, Kicker } from './ui'
import type { RawInputSummary } from './types'

function eur(n: number): string {
  return formatCurrency(Math.round(n))
}
function pct(n: number): string {
  return `${n.toFixed(1).replace('.', ',')}%`
}

export default function TabUitgangspunten({ raw }: { raw: RawInputSummary }) {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl font-serif text-sm italic text-[var(--ink-3)]">
        Dit is de ruwe invoer zoals TriFinity die van jouw account kent — nog vóór de
        adapter er rekenwaarden van maakt. Elke regel toont de herkomst, zodat je kunt
        nagaan wáár het model zijn getal vandaan haalt.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard>
          <Kicker>Persoon</Kicker>
          <div className="mt-3">
            <FieldTable rows={raw.persoon} />
          </div>
        </SectionCard>
        <SectionCard>
          <Kicker>Inkomen & uitgaven</Kicker>
          <div className="mt-3">
            <FieldTable rows={raw.inkomenUitgaven} />
          </div>
        </SectionCard>
        <SectionCard>
          <Kicker>Rekenparameters</Kicker>
          <div className="mt-3">
            <FieldTable rows={raw.parameters} />
          </div>
        </SectionCard>
        <SectionCard>
          <Kicker>Strategie</Kicker>
          <div className="mt-3">
            <FieldTable rows={raw.strategie} />
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <Kicker>Bezittingen · bron: assets</Kicker>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                <th scope="col" className="py-2 pr-4 text-left font-medium">Naam</th>
                <th scope="col" className="py-2 pr-4 text-left font-medium">Type</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Waarde</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Rendement</th>
                <th scope="col" className="py-2 text-right font-medium">Maandinleg</th>
              </tr>
            </thead>
            <tbody>
              {raw.assets.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-[var(--ink-3)]">Geen actieve bezittingen.</td>
                </tr>
              )}
              {raw.assets.map((a, i) => (
                <tr key={i} className="border-t border-[var(--border-ed)]">
                  <td className="py-2 pr-4 text-[var(--ink)]">{a.naam}</td>
                  <td className="py-2 pr-4 text-[var(--ink-3)]">{a.type}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink)]">{eur(a.waarde)}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink-2)]">{pct(a.rendementPct)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-[var(--ink-2)]">{eur(a.maandinleg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] font-mono text-[var(--ink-4)]">
          bron: assets.current_value / .expected_return / .monthly_contribution
        </p>
      </SectionCard>

      <SectionCard>
        <Kicker>Schulden · bron: debts</Kicker>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                <th scope="col" className="py-2 pr-4 text-left font-medium">Naam</th>
                <th scope="col" className="py-2 pr-4 text-left font-medium">Type</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Saldo</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Rente</th>
                <th scope="col" className="py-2 text-right font-medium">Maandlast</th>
              </tr>
            </thead>
            <tbody>
              {raw.debts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-[var(--ink-3)]">Geen actieve schulden.</td>
                </tr>
              )}
              {raw.debts.map((d, i) => (
                <tr key={i} className="border-t border-[var(--border-ed)]">
                  <td className="py-2 pr-4 text-[var(--ink)]">{d.naam}</td>
                  <td className="py-2 pr-4 text-[var(--ink-3)]">{d.type}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink)]">{eur(d.saldo)}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink-2)]">{pct(d.rentePct)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-[var(--ink-2)]">{eur(d.maandlast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] font-mono text-[var(--ink-4)]">
          bron: debts.current_balance / .interest_rate / .monthly_payment
        </p>
      </SectionCard>

      <SectionCard>
        <Kicker>Levensgebeurtenissen · bron: life_events</Kicker>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                <th scope="col" className="py-2 pr-4 text-left font-medium">Naam</th>
                <th scope="col" className="py-2 pr-4 text-left font-medium">Type</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Leeftijd</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Eenmalig</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Maandkost</th>
                <th scope="col" className="py-2 text-right font-medium">Maandinkomen</th>
              </tr>
            </thead>
            <tbody>
              {raw.events.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-[var(--ink-3)]">Geen actieve gebeurtenissen.</td>
                </tr>
              )}
              {raw.events.map((e, i) => (
                <tr key={i} className="border-t border-[var(--border-ed)]">
                  <td className="py-2 pr-4 text-[var(--ink)]">{e.naam}</td>
                  <td className="py-2 pr-4 text-[var(--ink-3)]">{e.type}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink-2)]">{e.leeftijd ?? '—'}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink-2)]">{eur(e.eenmaligBedrag)}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink-2)]">{eur(e.maandKost)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-[var(--ink-2)]">{eur(e.maandInkomen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] font-mono text-[var(--ink-4)]">
          bron: life_events (is_active = true) · AOW-tabel: {raw.aowRegels} regels uit aow_leeftijd
        </p>
      </SectionCard>
    </div>
  )
}
