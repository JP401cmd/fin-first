'use client'

/**
 * Deel 4 — Technisch rapport: architectuur van de kern (modulekaart), de
 * rekenprincipes, de solver + de vier statussen, en de bewuste afwijkingen/besluiten
 * met eigenaar-akkoord + de bron-Excel-herkomst.
 */

import { SectionCard, Kicker } from './ui'
import type { VerifReport } from './types'

const MODULES: ReadonlyArray<{ pad: string; rol: string }> = [
  { pad: 'lib/horizon-kernel/types.ts', rol: 'Het volledige, domein-vrije invoer-contract (KernelInput) + maandindex/potten-typen.' },
  { pad: 'lib/horizon-kernel/tables/*', rol: 'Elf pure maandtabellen (CF, Bel, Ont, Af, Toename/afname, Verdeling, Bez, S, Prognose, Werk, PT) — elk oracle-bewezen.' },
  { pad: 'lib/horizon-kernel/engine.ts', rol: 'De integrale forward-recursie: voedt de tabellen uit eigen m/m−1-toestand tot één projectie.' },
  { pad: 'lib/horizon-kernel/solver.ts', rol: 'BepaalFIRE — de maand-bisectie die de FIRE-leeftijd zoekt + het P-statusblok.' },
  { pad: 'lib/horizon-kernel/gap.ts', rol: 'Het gedeelde doelblok (P!B35–B38): eindleeftijd, doelbedrag, modelwaarde, gap.' },
  { pad: 'lib/horizon-kernel/wrappers/*', rol: 'Onzekerheidslagen: scenarioband, deterministische Monte-Carlo, historische backtest.' },
  { pad: 'lib/horizon-kernel/adapter/*', rol: 'Vertaalt echte app-data (profiel, bezittingen, schulden, strategieën) naar KernelInput.' },
  { pad: 'lib/horizon-kernel/oracle/*', rol: 'Fixture-loader + pure comparator (compareGrid, €0,01) — de parity-toets.' },
]

const PRINCIPES: ReadonlyArray<{ titel: string; tekst: string }> = [
  { titel: 'Maandbasis, tot leeftijd 100', tekst: 'De projectie loopt over 1200 maanden (index 0..1199). Voorbij leeftijd 100 leegt het model de rekenkolommen (horizon-guard).' },
  { titel: 'Nominaal rekenen', tekst: 'Reële invoer van nu wordt vooraf geïndexeerd met (1 + inflatie)^(m/12): elk bedrag wordt het feitelijke bedrag in dat toekomstige jaar.' },
  { titel: 'Structurele één-maand-lag', tekst: 'Sommige waarden (met name de Box 3-heffing) worden bewust met een maand vertraging doorgegeven — exact zoals het Excel-model rekent.' },
  { titel: 'Forward-recursie', tekst: 'Elke maand wordt in een vaste intra-maand-volgorde berekend uit de volledige toestand van de vorige maand; geen vooruitkijken.' },
  { titel: 'FIRE-leeftijd als parameter', tekst: 'De engine krijgt de FIRE-leeftijd als invoer; de solver zoekt hem via maand-bisectie en draait de engine per kandidaat opnieuw.' },
  { titel: 'Parity ≤ €0,01', tekst: 'Elke geporte tabel is cel-voor-cel binnen één eurocent van het Excel-oracle bewezen — over alle fixtures × 1200 maanden (ADR 0032).' },
]

const STATUSSEN: ReadonlyArray<{ code: string; titel: string; tekst: string }> = [
  { code: 'reached_now', titel: 'Nu al bereikt', tekst: 'Het netto-liquide vermogen haalt het doelbedrag al op maand 0 — FIRE is direct haalbaar.' },
  { code: 'reached_at', titel: 'Bereikt op leeftijd', tekst: 'De bisectie vond de kleinste maand waarop de gap ≥ 0 is: dát is de FIRE-leeftijd.' },
  { code: 'unreachable_within_horizon', titel: 'Niet haalbaar binnen horizon', tekst: 'Zelfs op leeftijd 100 blijft de gap negatief. Het model parkeert FIRE op de horizon en geeft een €/maand-extra-sparen-hint.' },
  { code: 'pension_shortfall', titel: 'Pensioen-tekort', tekst: 'Bij de eindstrategie "Pensioenleeftijd" springt de tekort-lening aan vóór de eindleeftijd — het plan komt niet rond zonder bijsturen.' },
  { code: 'stop_now_shortfall', titel: 'Stop-nu-tekort', tekst: 'Bij de eindstrategie "Nu stoppen" (FIRE op maand 0, ADR 0127) springt de tekort-lening aan vóór de eigen eindleeftijd — het vermogen reikt niet tot daar. Buiten het Excel-oracle.' },
]

const AFWIJKINGEN: ReadonlyArray<{ titel: string; tekst: string; akkoord: string }> = [
  {
    titel: 'bens!H-inversie ("in sparen na aflossing")',
    tekst:
      'De adapter mapt de app-vlag geïnverteerd naar de kern-kolom bens!H, zodat de rente-vrijval bij het aflossen van een schuld consistent is met ADR 0020 (alleen het rente-deel valt vrij, geen dubbeltelling van de aflossing).',
    akkoord: 'Eigenaar-akkoord · ADR 0020',
  },
  {
    titel: 'B99-ruisclamp op de tekort-lening',
    tekst:
      'De solver clampt een tekort-lening-saldo onder een halve eurocent naar 0. Zonder deze clamp zou sub-cent float-ruis een vals "pension_shortfall" kunnen geven (de messcherpe B99 > 0-conditie).',
    akkoord: 'Eigenaar-akkoord · gedocumenteerd in solver.ts',
  },
  {
    titel: 'V16 — erfenis-behandeling',
    tekst:
      'De erfenis-gebeurtenis volgt de Excel-domeinlogica (vrijstelling/tarief o.b.v. relatie) i.p.v. een eigen app-berekening; bewust gekozen om binnen het oracle-domein te blijven.',
    akkoord: 'Eigenaar-akkoord · horizon-excel-oracle-plan §V16',
  },
  {
    titel: 'V11 — backtest op app-reeksen',
    tekst:
      'De historische backtest (Hist) gebruikt de app-rendementreeksen als bron in plaats van een tweede, losse dataset — één bron van waarheid voor het historische rendement.',
    akkoord: 'Eigenaar-akkoord · horizon-excel-oracle-plan §V11',
  },
  {
    titel: 'Scenarioband zonder pensioen-kortsluiting',
    tekst:
      'De scenarioband-wrapper draait dezelfde bisectie als de solver maar past de pensioen-kortsluiting bewust niet toe, zodat de band een zuivere gevoeligheids-run blijft.',
    akkoord: 'Eigenaar-akkoord · wrappers/band.ts',
  },
]

export default function TabTechnisch({ bron }: { bron: VerifReport['bron'] | null }) {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl font-serif text-sm italic text-[var(--ink-3)]">
        De motorkap open: hoe de rekenkern is opgebouwd, welke principes hij volgt, hoe de
        solver werkt en welke bewuste afwijkingen er zijn gemaakt — elk met eigenaar-akkoord.
      </p>

      <SectionCard>
        <Kicker>Modulekaart</Kicker>
        <div className="mt-3 space-y-2">
          {MODULES.map((m) => (
            <div key={m.pad} className="grid gap-1 border-t border-[var(--border-ed)] py-2 first:border-t-0 sm:grid-cols-[280px_1fr]">
              <code className="font-mono text-xs text-[var(--color-horizon-700)]">{m.pad}</code>
              <span className="text-sm text-[var(--ink-2)]">{m.rol}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard>
        <Kicker>Rekenprincipes</Kicker>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {PRINCIPES.map((p) => (
            <div key={p.titel} className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
              <div className="text-sm font-semibold text-[var(--ink)]">{p.titel}</div>
              <p className="mt-1 text-xs text-[var(--ink-2)]">{p.tekst}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard>
        <Kicker>Solver & de vier statussen</Kicker>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          De solver is een letterlijke port van de Excel-macro <span className="font-mono">BepaalFIRE</span>:
          een maand-bisectie die de kleinste maand zoekt waarop de gap (netto-liquide − doelbedrag) ≥ 0 is.
          Bij eindstrategie &ldquo;Pensioenleeftijd&rdquo; is er geen bisectie — FIRE = de AOW-/pensioenleeftijd.
        </p>
        <div className="mt-3 space-y-2">
          {STATUSSEN.map((s) => (
            <div key={s.code} className="flex flex-col gap-1 border-t border-[var(--border-ed)] py-2.5 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-4">
              <code className="shrink-0 font-mono text-xs text-[var(--color-horizon-700)] sm:w-56">{s.code}</code>
              <div>
                <span className="text-sm font-semibold text-[var(--ink)]">{s.titel}</span>
                <span className="text-sm text-[var(--ink-2)]"> — {s.tekst}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard>
        <Kicker>Bewuste afwijkingen & besluiten</Kicker>
        <div className="mt-3 space-y-3">
          {AFWIJKINGEN.map((a) => (
            <div key={a.titel} className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--ink)]">{a.titel}</span>
                <span className="rounded-full border border-[var(--color-horizon-500)] bg-[color-mix(in_oklch,var(--color-horizon-500)_10%,transparent)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-horizon-700)] font-mono">
                  {a.akkoord}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-[var(--ink-2)]">{a.tekst}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard>
        <Kicker>Bron-Excel (oracle)</Kicker>
        {bron ? (
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4 border-b border-[var(--border-ed)] pb-1.5">
              <span className="text-[var(--ink-3)]">Bestand</span>
              <span className="font-mono text-[var(--ink)]">{bron.sourceFile}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-[var(--border-ed)] pb-1.5">
              <span className="text-[var(--ink-3)]">Laatst gewijzigd</span>
              <span className="font-mono text-[var(--ink)]">{bron.sourceLastWriteTime}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-[var(--border-ed)] pb-1.5">
              <span className="text-[var(--ink-3)]">Geëxtraheerd</span>
              <span className="font-mono text-[var(--ink)]">{bron.extractedAt}</span>
            </div>
            <div className="flex flex-col gap-1 pt-1">
              <span className="text-[var(--ink-3)]">SHA-256</span>
              <span className="break-all font-mono text-[11px] text-[var(--ink-2)]">{bron.sourceSha256}</span>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-3)]">
            Draai de <span className="font-semibold">Verificatie</span> om de exacte bron-Excel
            (naam, wijzigingsdatum en SHA-256-hash) uit de fixture-meta te laden.
          </p>
        )}
      </SectionCard>
    </div>
  )
}
