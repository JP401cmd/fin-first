'use client'

/**
 * Deel 2 — Geselecteerde uitgangspunten voor de berekening: de geresolvede
 * `KernelInput` ná de adapter (potten met rentes/categorieën/rollen, strategie-
 * parameters) + welke aannames/defaults zijn toegepast en waarom (cel-referentie).
 */

import { formatCurrency } from '@/lib/format'
import { SectionCard, Kicker, StatCard, FieldTable, Notice } from './ui'
import type { KernelInput, KernelNotice } from './types'

function eur(n: number): string {
  return formatCurrency(Math.round(n))
}
function pct(n: number): string {
  return `${(n * 100).toFixed(2).replace('.', ',')}%`
}
function jaNee(b: boolean): string {
  return b ? 'ja' : 'nee'
}

export default function TabGeselecteerd({
  kernelInput,
  notices,
}: {
  kernelInput: KernelInput
  notices: KernelNotice[]
}) {
  const k = kernelInput

  // Toegepaste aannames/defaults (uit de geresolvede invoer), met cel-ref + reden.
  const aannames: ReadonlyArray<{ label: string; waarde: string; bron: string }> = [
    { label: 'Rente tekort-lening', waarde: pct(k.tekortLeningRente), bron: 'P!B25 · Excel-default (geen app-veld)' },
    { label: 'Woning verkoopkosten', waarde: pct(k.woning.verkoopkostenPct), bron: 'P!B62 · Excel-default' },
    { label: 'Woning huur na verkoop', waarde: `${pct(k.woning.huurNaVerkoopPctWozPerJaar)} van WOZ/jr`, bron: 'P!B63 · app kent €-last, geen %/WOZ → default' },
    { label: 'Opeethypotheek rente', waarde: pct(k.woning.opeetRentePerJaar), bron: 'P!B66 · Excel-default' },
    { label: 'Fase-curve (go/slow/no-go)', waarde: `${k.onttrekkingsprofiel.factor1Pct}/${k.onttrekkingsprofiel.factor2Pct}/${k.onttrekkingsprofiel.factor3Pct}%`, bron: 'P!B72/B74/B75 · Excel-default (geen app-kolom)' },
    { label: 'Guardrail onder/boven-drempel', waarde: `${k.onttrekkingsprofiel.guardrailOnderdrempelRatio} / ${k.onttrekkingsprofiel.guardrailBovendrempelRatio}`, bron: 'P!B79/B80 · Excel-default' },
    { label: 'Heffingvrij inkomen p.p. (werkelijk-tak)', waarde: eur(k.box3.heffingvrijInkomenTotaal / Math.max(1, k.box3.personen)), bron: 'P!B91 · Excel-default (alleen bij werkelijk rendement)' },
  ]

  return (
    <div className="space-y-6">
      <p className="max-w-3xl font-serif text-sm italic text-[var(--ink-3)]">
        Dit is wat de adapter van de ruwe invoer heeft gemaakt: de statische
        <span className="font-mono"> KernelInput</span> die de rekenkern consumeert. Waar
        de app een veld mist, vult de adapter een gedocumenteerde Excel-default — die staan
        onderaan met celverwijzing.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Startleeftijd" value={String(k.startLeeftijd)} sub="P!B7" />
        <StatCard label="Inflatie" value={pct(k.inflatie)} sub="P!B14" />
        <StatCard label="Box 3-methode" value={k.box3.method} sub={`tarief ${pct(k.box3.tarief)}`} />
        <StatCard label="Fiscale personen" value={String(k.box3.personen)} sub="P!B19" />
      </div>

      {notices.length > 0 && (
        <SectionCard>
          <Kicker>Adapter-notices</Kicker>
          <p className="mt-1 mb-3 text-xs text-[var(--ink-3)]">
            Waar de app-data niet één-op-één in de kern past (capaciteit, keuze of overslaan).
          </p>
          <ul className="space-y-2">
            {notices.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide font-mono"
                  style={{
                    color: n.kind === 'skip' ? 'var(--color-kern-700)' : 'var(--color-horizon-700)',
                    backgroundColor:
                      n.kind === 'skip'
                        ? 'color-mix(in oklch, var(--color-kern-500) 14%, transparent)'
                        : 'color-mix(in oklch, var(--color-horizon-500) 12%, transparent)',
                  }}
                >
                  {n.kind}
                </span>
                <span className="text-[var(--ink-2)]">{n.message}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard>
        <Kicker>Bezitting-potten (bens rij 4–13)</Kicker>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                <th className="py-2 pr-3 text-left font-medium">Slot</th>
                <th className="py-2 pr-3 text-left font-medium">Naam</th>
                <th className="py-2 pr-3 text-left font-medium">Categorie</th>
                <th className="py-2 pr-3 text-left font-medium">Box 3-type</th>
                <th className="py-2 pr-3 text-right font-medium">Startwaarde</th>
                <th className="py-2 pr-3 text-right font-medium">Rendement</th>
                <th className="py-2 pr-3 text-center font-medium">Beleg.</th>
                <th className="py-2 text-left font-medium">Rol</th>
              </tr>
            </thead>
            <tbody>
              {k.assetPotten.map((p, i) => (
                <tr key={i} className="border-t border-[var(--border-ed)]">
                  <td className="py-2 pr-3 font-mono text-[var(--ink-3)]">{p.slot}</td>
                  <td className="py-2 pr-3 text-[var(--ink)]">{p.naam ?? '—'}</td>
                  <td className="py-2 pr-3 text-[var(--ink-2)]">{p.categorie}</td>
                  <td className="py-2 pr-3 text-[var(--ink-3)]">{p.box3Type}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--ink)]">{eur(p.startwaarde)}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--ink-2)]">{pct(p.rendement)}</td>
                  <td className="py-2 pr-3 text-center text-[var(--ink-3)]">{jaNee(p.investering)}</td>
                  <td className="py-2 text-[var(--ink-3)]">{p.rol ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard>
        <Kicker>Schuld-potten (bens rij 17–23)</Kicker>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                <th className="py-2 pr-3 text-left font-medium">Slot</th>
                <th className="py-2 pr-3 text-left font-medium">Naam</th>
                <th className="py-2 pr-3 text-left font-medium">Categorie</th>
                <th className="py-2 pr-3 text-right font-medium">Startsaldo</th>
                <th className="py-2 pr-3 text-right font-medium">Rente</th>
                <th className="py-2 pr-3 text-right font-medium">Aflossing</th>
                <th className="py-2 pr-3 text-center font-medium">In sparen na aflos.</th>
                <th className="py-2 text-left font-medium">Rol</th>
              </tr>
            </thead>
            <tbody>
              {k.schuldPotten.map((p, i) => (
                <tr key={i} className="border-t border-[var(--border-ed)]">
                  <td className="py-2 pr-3 font-mono text-[var(--ink-3)]">{p.slot}</td>
                  <td className="py-2 pr-3 text-[var(--ink)]">{p.naam ?? '—'}</td>
                  <td className="py-2 pr-3 text-[var(--ink-2)]">{p.categorie}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--ink)]">{eur(p.startwaarde)}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--ink-2)]">{pct(p.rente)}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {p.aflossingEur > 0 ? `${eur(p.aflossingEur)}/jr` : pct(p.aflossingPct)}
                  </td>
                  <td className="py-2 pr-3 text-center text-[var(--ink-3)]">{jaNee(p.inSparenNaAflossing)}</td>
                  <td className="py-2 text-[var(--ink-3)]">{p.rol ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-[var(--ink-4)]">
          De kolom &ldquo;in sparen na aflossing&rdquo; (bens!H) wordt door de adapter
          bewust geïnverteerd t.o.v. de app-vlag — zie het technisch rapport.
        </p>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard>
          <Kicker>Inkomen & uitgaven (nominale jaarbasis)</Kicker>
          <div className="mt-3">
            <FieldTable
              rows={[
                { label: 'Netto jaarinkomen', waarde: eur(k.inkomenUitgaven.nettoJaarinkomen), bron: 'P!B10' },
                { label: 'Netto jaaruitgaven', waarde: eur(k.inkomenUitgaven.nettoJaaruitgaven), bron: 'P!B11' },
                { label: 'Uitgave na pensioen / jaar', waarde: eur(k.inkomenUitgaven.uitgaveNaPensioenPerJaar), bron: 'P!B15' },
                { label: 'AOW-leeftijd', waarde: k.persoon.aowLeeftijd.toFixed(2).replace('.', ','), bron: 'P!B55 · aow_leeftijd' },
              ]}
            />
          </div>
        </SectionCard>
        <SectionCard>
          <Kicker>Eindstrategie & onttrekking</Kicker>
          <div className="mt-3">
            <FieldTable
              rows={[
                { label: 'Eindstrategie', waarde: k.eindstrategie.selector, bron: 'P!B48' },
                { label: 'Onttrekkingsprofiel', waarde: k.onttrekkingsprofiel.profiel, bron: 'P!B69' },
                { label: 'Toename-strategie', waarde: k.strategie.toename, bron: 'P!B28' },
                { label: 'Afname-strategie', waarde: k.strategie.afname, bron: 'P!B29' },
                { label: 'Onttrekking-strategie', waarde: k.strategie.onttrekking, bron: 'P!B30' },
                { label: 'Woningstrategie', waarde: k.woning.selector, bron: 'P!B57' },
              ]}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <Kicker>Toegepaste aannames & defaults</Kicker>
        <p className="mt-1 mb-3 text-xs text-[var(--ink-3)]">
          Velden die het Excel-model kent maar (nog) geen eigen app-kolom hebben — met de
          Excel-cel en de reden dat de default geldt.
        </p>
        <FieldTable rows={aannames} />
      </SectionCard>

      <details className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">
          Volledige KernelInput (JSON)
        </summary>
        <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg bg-[var(--subtle)] p-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
          {JSON.stringify(kernelInput, null, 2)}
        </pre>
      </details>
    </div>
  )
}
