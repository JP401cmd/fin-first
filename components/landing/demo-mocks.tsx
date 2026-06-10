import { type ReactNode } from 'react'

/**
 * Productdemo-mockups — browser-chrome kaders met illustratieve
 * app-content. De concrete demo's zijn prop-loze componenten; home en
 * /functies tonen ze per belofte-pijler (Grip = briefing, Toekomst =
 * tijdas, Inzicht = cashflow, Nu = balans) zonder copy-duplicatie.
 */

export function DemoMock({
  rubriek,
  titel,
  toelichting,
  children,
}: {
  rubriek: string
  titel: string
  toelichting: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col">
      <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s1)]">
        {/* Mock browser-chrome */}
        <div className="flex items-center justify-between border-b-2 border-[var(--ink)] bg-[var(--subtle)] px-4 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--ink-4)]/30" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--ink-4)]/30" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--ink-4)]/30" aria-hidden="true" />
          </div>
          <p className="font-mono text-[10px] text-[var(--ink-4)]">
            trifinity.app
          </p>
        </div>

        {/* Mock content */}
        <div className="bg-[var(--bg)] px-5 py-5">
          <p className="mb-3 font-sans text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
            {rubriek}
          </p>
          {children}
        </div>
      </div>

      <div className="mt-4 px-1">
        <p className="font-display text-base font-semibold text-[var(--ink)]">
          {titel}
        </p>
        <p className="mt-1 font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
          {toelichting}
        </p>
      </div>
    </div>
  )
}

// ── Demo 1: dagelijkse briefing ──────────────────────────────────────

export function BriefingDemo() {
  return (
    <DemoMock
      rubriek="Overzicht · Briefing"
      titel="Dagelijkse briefing"
      toelichting="Zes inzichten per dag uit jouw cijfers — wat opvalt, wat je moet weten, wat ruimte geeft."
    >
      <div className="space-y-3">
        <div className="rounded border border-kern-200 bg-kern-50 p-3">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-kern-700">
            Vandaag
          </p>
          <p className="mt-1 font-serif text-xs leading-relaxed text-[var(--ink-2)]">
            Je netto vermogen groeide met €1.240 deze maand — vooral door je beleggingen (+€890). Dat is ≈ +9 dagen vrijheid.
          </p>
        </div>
        <div className="rounded border border-wil-200 bg-wil-50 p-3">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-700">
            Inzicht
          </p>
          <p className="mt-1 font-serif text-xs leading-relaxed text-[var(--ink-2)]">
            Boodschappen-budget zit op 78% van de maand met nog 9 dagen te gaan.
          </p>
        </div>
      </div>
    </DemoMock>
  )
}

// ── Demo 2: tijdas met levensgebeurtenissen ──────────────────────────

export function TijdasDemo() {
  return (
    <DemoMock
      rubriek="Toekomst · Tijdas"
      titel="Levensgebeurtenissen"
      toelichting="Plaats kinderen, verhuizing of pensioen op je tijdas — zie meteen wat het kost in geld én tijd."
    >
      <div className="relative space-y-2.5">
        <span aria-hidden="true" className="absolute left-3 top-2 bottom-2 w-px bg-[var(--border-md)]" />
        {[
          { jaar: '2027', titel: 'Huwelijk', delta: '+6 mnd' },
          { jaar: '2031', titel: 'Verbouwing', delta: '+8 mnd' },
          { jaar: '2036', titel: 'Scheiding', delta: '−4 mnd' },
          { jaar: '2044', titel: 'FIRE', delta: '✓' },
        ].map((ev) => (
          <div key={ev.jaar} className="relative flex items-center gap-3 pl-7">
            <span aria-hidden="true" className="absolute left-2 h-2.5 w-2.5 rounded-full border-2 border-horizon-600 bg-[var(--paper)]" />
            <span className="font-mono text-[10px] text-[var(--ink-3)] tabular-nums">{ev.jaar}</span>
            <span className="flex-1 font-sans text-xs font-medium text-[var(--ink)]">{ev.titel}</span>
            <span className="font-mono text-[10px] text-horizon-700 tabular-nums">{ev.delta}</span>
          </div>
        ))}
      </div>
    </DemoMock>
  )
}

// ── Demo 3: cashflow met automatisch gecategoriseerde transacties ────

export function CashflowInzichtDemo() {
  return (
    <DemoMock
      rubriek="Overzicht · Cashflow"
      titel="Cashflow en inzicht"
      toelichting="Transacties automatisch gecategoriseerd — en een signaal als iets afwijkt."
    >
      <div className="space-y-2.5">
        <div className="grid grid-cols-3 gap-2 rounded border border-[var(--border-ed)] bg-[var(--paper)] p-2.5">
          <div>
            <p className="font-sans text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">In</p>
            <p className="font-mono text-[11px] font-semibold text-[var(--ink)] tabular-nums">€4.870</p>
          </div>
          <div>
            <p className="font-sans text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Uit</p>
            <p className="font-mono text-[11px] font-semibold text-[var(--ink)] tabular-nums">€3.640</p>
          </div>
          <div>
            <p className="font-sans text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Vrij</p>
            <p className="font-mono text-[11px] font-semibold text-kern-700 tabular-nums">+€1.230</p>
          </div>
        </div>

        <div className="space-y-1.5">
          {[
            { naam: 'Albert Heijn', bedrag: '−€86,40', categorie: 'Boodschappen' },
            { naam: 'NS Reizigers', bedrag: '−€64,00', categorie: 'Vervoer' },
            { naam: 'Streamio', bedrag: '−€13,99', categorie: 'Abonnementen' },
          ].map((t) => (
            <div key={t.naam} className="flex items-center gap-2 border-b border-dashed border-[var(--border-ed)] pb-1.5 last:border-b-0 last:pb-0">
              <span className="flex-1 truncate font-sans text-[11px] font-medium text-[var(--ink)]">{t.naam}</span>
              <span className="rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-1.5 py-px font-sans text-[9px] text-[var(--ink-3)]">{t.categorie}</span>
              <span className="font-mono text-[11px] text-[var(--ink-2)] tabular-nums">{t.bedrag}</span>
            </div>
          ))}
        </div>

        <p className="rounded border border-wil-200 bg-wil-50 p-2 font-serif text-[11px] italic leading-snug text-[var(--ink-2)]">
          Signaal: Streamio werd dit jaar twee keer duurder — samen +€4 per maand.
        </p>
      </div>
    </DemoMock>
  )
}

// ── Demo 4: balans van nu — bezittingen, schulden, vaste lasten ──────

export function BalansDemo() {
  return (
    <DemoMock
      rubriek="Overzicht · Vermogen"
      titel="Bezittingen en schulden"
      toelichting="Je hele vermogen van vandaag bij elkaar — inclusief wat er maandelijks vastligt."
    >
      <div className="space-y-2.5">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-[11px] text-[var(--ink-2)]">Bezittingen</span>
            <span className="font-mono text-[11px] font-semibold text-[var(--ink)] tabular-nums">€412.500</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-[11px] text-[var(--ink-2)]">Schulden</span>
            <span className="font-mono text-[11px] font-semibold text-[var(--ink)] tabular-nums">−€238.000</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-[var(--ink)] pt-1.5">
            <span className="font-sans text-[11px] font-semibold text-[var(--ink)]">Netto vermogen</span>
            <span className="font-mono text-[12px] font-bold text-kern-700 tabular-nums">€174.500</span>
          </div>
        </div>

        <div className="rounded border border-[var(--border-ed)] bg-[var(--paper)] p-2.5">
          <p className="font-sans text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Vaste lasten</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-[11px] font-semibold text-[var(--ink)] tabular-nums">€2.140 p/m</span>
            <span className="font-sans text-[10px] text-[var(--ink-3)]">waarvan 4 abonnementen</span>
          </div>
        </div>

        <p className="font-serif text-[10px] italic text-[var(--ink-3)]">
          Netto vermogen ≈ 14 jaar en 3 maanden vrijheid.
        </p>
      </div>
    </DemoMock>
  )
}
