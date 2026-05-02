'use client'

import { useState } from 'react'
import { Inbox, ChevronRight, Plus } from 'lucide-react'
import {
  Kicker,
  EditorialDeck,
  HighlightMark,
  SectionLabel,
  CardEditorial,
  FiguresStrip,
  PullQuote,
  HL,
  HLNeg,
  ScenarioCallout,
  TogglePill,
  Colophon,
} from './editorial'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// ─────────────────────────────────────────────────────────────────
// Type 8 — Settings / preferences
// ─────────────────────────────────────────────────────────────────

export function SettingsPreview() {
  const [activeTab, setActiveTab] = useState('notificaties')
  const tabs = [
    { id: 'notificaties', label: 'Notificaties' },
    { id: 'widgets', label: 'Widgets' },
    { id: 'fire', label: 'FIRE' },
    { id: 'weergave', label: 'Weergave' },
  ]
  return (
    <div className="space-y-6">
      {/* Editorial header */}
      <header className="space-y-2">
        <Kicker>Instellingen</Kicker>
        <h1
          className="font-bold text-[28px] sm:text-[36px] leading-tight tracking-[-0.02em]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Maak het{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            jouw
          </em>{' '}
          TriFinity
        </h1>
        <EditorialDeck>
          Voorkeuren worden direct opgeslagen. Geen save-knop, geen wachten —
          gewoon aanvinken.
        </EditorialDeck>
      </header>

      {/* Tab-bar */}
      <nav
        className="flex gap-1 border-b border-[var(--border-ed)] overflow-x-auto"
        role="tablist"
      >
        {tabs.map((t) => {
          const active = t.id === activeTab
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              onClick={() => setActiveTab(t.id)}
              className="px-3 py-2 text-[12px] uppercase tracking-[0.12em] font-mono whitespace-nowrap"
              style={{
                color: active ? 'var(--module-active-700)' : 'var(--ink-3)',
                borderBottom: active ? '3px solid var(--module-active-500)' : '3px solid transparent',
                background: active ? 'var(--module-active-50)' : 'transparent',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Autosave-status */}
      <div className="flex justify-end">
        <span
          className="italic text-[11.5px] text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Opgeslagen — zojuist
        </span>
      </div>

      {/* Per sectie: card-editorial */}
      <CardEditorial>
        <div className="p-4 sm:p-5 space-y-4">
          <SectionLabel num="i.">Push-meldingen</SectionLabel>
          <SettingRow label="Maandelijkse check-in" desc="Eind van de maand vragen we hoe het ging" on />
          <SettingRow label="Doel-mijlpalen" desc="Bij 25%, 50%, 75%, 100%" on />
          <SettingRow label="Stale data &gt; 1 week" desc="Wanneer saldo of waarde lang niet bijgewerkt is" on={false} />
        </div>
      </CardEditorial>

      <CardEditorial>
        <div className="p-4 sm:p-5 space-y-4">
          <SectionLabel num="ii.">E-mail</SectionLabel>
          <SettingRow label="Wekelijkse briefing" desc="Maandagochtend in je inbox" on />
          <SettingRow label="Aanbevelingen" desc="Wanneer er een nieuwe aanbeveling klaar is" on={false} />
        </div>
      </CardEditorial>
    </div>
  )
}

function SettingRow({
  label,
  desc,
  on,
}: {
  label: string
  desc: string
  on: boolean
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-2 border-b border-dotted border-[var(--rule-soft)] last:border-b-0"
      style={{ fontFamily: SOURCE_SERIF }}
    >
      <div className="flex-1">
        <div className="text-[14px] text-[var(--ink)]">{label}</div>
        <div className="italic text-[12px] text-[var(--ink-3)] mt-0.5">{desc}</div>
      </div>
      <TogglePill on={on} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Type 9 — Empty-state
// ─────────────────────────────────────────────────────────────────

export function EmptyPreview() {
  return (
    <div className="space-y-10">
      {[
        {
          title: 'Eerste-gebruik',
          subtitle: 'Verschijnt op een verse cash-categorie zonder rekeningen.',
          render: (
            <EmptyStateBlock
              kicker="Nog geen rekeningen"
              headline={
                <>
                  Voeg je eerste{' '}
                  <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
                    spaarpot
                  </em>{' '}
                  toe
                </>
              }
              body="Cash en spaargeld vormen je vrijheid op korte termijn. Begin met de rekening waar je het meeste mee doet — handmatig of via bank-koppeling."
              ctaPrimary="Voeg rekening toe"
              ctaSecondary="Hoe werkt dit?"
            />
          ),
        },
        {
          title: 'User-cleared',
          subtitle: 'Verschijnt nadat de gebruiker zelf alle items heeft verwijderd.',
          render: (
            <EmptyStateBlock
              kicker="Inbox leeg"
              headline={
                <>
                  Alles{' '}
                  <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
                    afgerond
                  </em>
                  . Ruim.
                </>
              }
              body="Geen aanbevelingen meer voor nu — de motor draait pas weer over zeven dagen."
              ctaPrimary="Bekijk je dashboard"
            />
          ),
        },
        {
          title: 'No-results-van-filter',
          subtitle: 'Verschijnt als een actief filter geen items oplevert.',
          render: (
            <EmptyStateBlock
              kicker="Geen resultaten"
              headline={
                <>
                  Niets gevonden voor{' '}
                  <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
                    krediet
                  </em>
                </>
              }
              body="Probeer een andere zoekterm of wis de filters om alles weer te zien."
              ctaPrimary="Wis filters"
            />
          ),
        },
      ].map((variant) => (
        <section key={variant.title} className="space-y-3">
          <SectionLabel>{variant.title}</SectionLabel>
          <p
            className="italic text-[12.5px] text-[var(--ink-3)] -mt-3"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            {variant.subtitle}
          </p>
          <CardEditorial>{variant.render}</CardEditorial>
        </section>
      ))}
    </div>
  )
}

function EmptyStateBlock({
  kicker,
  headline,
  body,
  ctaPrimary,
  ctaSecondary,
}: {
  kicker: string
  headline: React.ReactNode
  body: string
  ctaPrimary: string
  ctaSecondary?: string
}) {
  return (
    <div className="max-w-md mx-auto py-10 sm:py-12 px-6 text-center space-y-4">
      <div className="flex justify-center">
        <Inbox className="w-9 h-9 text-[var(--ink-3)]" aria-hidden />
      </div>
      <Kicker className="!justify-center">
        <span className="!flex">{kicker}</span>
      </Kicker>
      <h2
        className="font-bold text-xl sm:text-[22px] leading-tight tracking-[-0.01em]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {headline}
      </h2>
      <p
        className="italic text-[14px] leading-relaxed text-[var(--ink-2)] max-w-prose mx-auto"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        {body}
      </p>
      <div className="flex flex-col items-center gap-2 pt-1">
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.1em] font-mono"
          style={{ background: 'var(--module-active-500)', color: 'var(--paper)' }}
        >
          <Plus className="w-3.5 h-3.5" aria-hidden /> {ctaPrimary}
        </button>
        {ctaSecondary && (
          <button
            type="button"
            className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            {ctaSecondary}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Type 10 — Calculator / tool-pagina (volledig WOZ-blueprint, simplified)
// ─────────────────────────────────────────────────────────────────

export function CalculatorPreview() {
  const [regime, setRegime] = useState<'no-rent' | 'box1' | 'box3'>('box1')
  const [woz, setWoz] = useState(650000)
  const [years, setYears] = useState(10)

  return (
    <div className="space-y-6">
      {/* Masthead met dubbele lijn boven */}
      <header
        className="border-t-4 border-double border-b border-[var(--ink)] py-3 sm:py-4 flex items-baseline justify-between gap-4 flex-wrap"
      >
        <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-2)]">
          Editie · Horizon module
        </div>
        <div
          className="text-[28px] sm:text-[34px] leading-none italic font-black tracking-[-0.02em]"
          style={{ fontFamily: PLAYFAIR }}
        >
          tf<span style={{ color: 'var(--color-horizon-500)' }}>.</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-2)] text-right">
          Drie regimes · vergelijk de uitkomst
        </div>
      </header>

      {/* Headline-row */}
      <section className="border-b border-[var(--ink)] py-7 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-end">
        <div className="space-y-3">
          <Kicker>Drie fiscale regimes voor woningverhuur</Kicker>
          <h1
            className="font-black leading-[0.95] tracking-[-0.025em] text-[32px] sm:text-[44px] md:text-[56px]"
            style={{ fontFamily: PLAYFAIR }}
          >
            Welke fiscale
            <br />
            <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
              route
            </em>{' '}
            kies je?
          </h1>
        </div>
        <EditorialDeck>
          Tijdelijke verhuur, permanente deelverhuur of het nieuwe stelsel
          vanaf 2028 — dezelfde woning, drie verschillende rekeningen.
        </EditorialDeck>
      </section>

      {/* Regime-toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap py-3 border-b border-[var(--ink)]">
        <span className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          Fiscaal regime
        </span>
        <div className="flex border border-[var(--ink)] flex-1 max-w-[640px]">
          {[
            { id: 'no-rent', label: 'Niet verhuren', sub: 'Baseline' },
            { id: 'box1', label: 'Box 1 — 70%', sub: 'Tijdelijk' },
            { id: 'box3', label: 'Box 3 — Werkelijk', sub: 'Vanaf 2028' },
          ].map((r, idx, arr) => {
            const active = regime === r.id
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRegime(r.id as typeof regime)}
                className={`flex-1 px-2 py-2.5 text-[12px] leading-tight ${
                  idx < arr.length - 1 ? 'border-r border-[var(--ink)]' : ''
                }`}
                style={{
                  background: active ? 'var(--ink)' : 'transparent',
                  color: active ? 'var(--paper)' : 'var(--ink-2)',
                  fontFamily: PLAYFAIR,
                  fontWeight: active ? 700 : 500,
                }}
              >
                {r.label}
                <span
                  className="block text-[8.5px] uppercase tracking-[0.12em] font-mono opacity-70 mt-0.5"
                  style={{ fontFamily: 'var(--font-dm-mono, monospace)' }}
                >
                  {r.sub}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2-koloms grid */}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0">
        {/* Inputs */}
        <div className="md:border-r md:border-[var(--ink)] md:pr-7 pb-7 md:pb-0">
          <SectionLabel num="i.">Vermogen</SectionLabel>
          <div className="space-y-4 mb-6">
            <RangeField
              label="WOZ-waarde"
              value={`€ ${woz.toLocaleString('nl-NL')}`}
              min={200000}
              max={2000000}
              step={10000}
              valueState={woz}
              onChange={setWoz}
              minLabel="€200k"
              maxLabel="€2M"
            />
            <RangeField
              label="Looptijd"
              value={`jr ${years}`}
              min={1}
              max={30}
              step={1}
              valueState={years}
              onChange={setYears}
              minLabel="1 jr"
              maxLabel="30 jr"
            />
          </div>
          <SectionLabel num="ii.">Hypotheek</SectionLabel>
          <div className="space-y-4">
            <RangeField
              label="Rente"
              value="4,0%"
              min={0}
              max={8}
              step={0.1}
              valueState={4}
              onChange={() => {}}
              minLabel="0%"
              maxLabel="8%"
            />
          </div>
        </div>

        {/* Results */}
        <div className="md:pl-7 space-y-5">
          <ScenarioCallout title="Box 1 — Tijdelijke verhuur:">
            woning blijft eigen woning. 70% van netto huur belast. Geen vermogenswinstbelasting.
          </ScenarioCallout>

          <PullQuote>
            Met de <HL>70%-regeling</HL> levert verhuur over <HL>jaar {years}</HL> netto{' '}
            <HighlightMark>
              <HL>+€ 203.375</HL>
            </HighlightMark>{' '}
            op — incl. waardestijging.
          </PullQuote>

          <FiguresStrip
            figures={[
              { kicker: 'Bruto huur', amount: '€ 206.350', sub: '10 jaar' },
              { kicker: 'Belasting', amount: '€ 70.122', sub: '70%×50%', variant: 'negative' },
              { kicker: 'Waardestijging', amount: '€ 98.108', sub: 'onbelast', variant: 'positive' },
              { kicker: 'Eindresultaat', amount: '+€ 203.375', sub: '10-jaars netto', variant: 'winner' },
            ]}
          />

          <p
            className="italic text-[12.5px] text-[var(--ink-3)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            Volledige breakdown, jaaroverzicht en grafiek volgen in een echte rollout.
          </p>
        </div>
      </div>

      {/* Comparison-block */}
      <section
        className="pt-6 mt-3"
        style={{ borderTop: '4px double var(--ink)' }}
      >
        <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-2 mb-4 flex-wrap gap-2">
          <h2
            className="font-black text-2xl sm:text-3xl leading-none tracking-[-0.02em]"
            style={{ fontFamily: PLAYFAIR }}
          >
            Drie{' '}
            <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
              uitkomsten
            </em>
          </h2>
          <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
            10-jaars netto
          </span>
        </div>
        <p
          className="italic text-base mb-5 pl-4"
          style={{
            fontFamily: PLAYFAIR,
            borderLeft: '2px solid var(--color-horizon-500)',
          }}
        >
          De <HL>70%-regeling</HL> wint met <HighlightMark><HL>+€ 203.375</HL></HighlightMark>;
          forfait-box-3 verliest <HLNeg>−€ 18.420</HLNeg> aan vermogensbelasting.
        </p>
        <div className="space-y-3">
          {[
            { label: 'Box 1 — 70%', value: '+€ 203.375', width: 100, current: true },
            { label: 'Box 3 — werkelijk', value: '+€ 156.840', width: 77 },
            { label: 'Niet verhuren', value: '+€ 89.500', width: 44 },
            { label: 'Box 3 — forfait', value: '−€ 18.420', width: 9, neg: true },
          ].map((b, idx) => (
            <div
              key={b.label}
              className="grid grid-cols-[140px_1fr_100px] gap-3 items-center"
              style={
                b.current
                  ? {
                      background: 'rgba(232,182,54,0.12)',
                      borderLeft: '3px solid var(--color-horizon-500)',
                      margin: '-4px -8px',
                      padding: '4px 8px',
                    }
                  : undefined
              }
            >
              <div
                className="text-[13px] font-medium leading-tight"
                style={{ fontFamily: PLAYFAIR }}
              >
                {b.label}
                <span
                  className="block text-[8.5px] uppercase tracking-[0.12em] font-mono text-[var(--ink-3)] mt-0.5"
                >
                  {idx + 1}e van 4
                </span>
              </div>
              <div className="relative h-6 bg-[var(--paper)] border border-[var(--ink)]">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${b.width}%`,
                    background: b.neg ? 'var(--negative)' : 'var(--color-horizon-400)',
                  }}
                />
              </div>
              <div
                className="text-right font-mono tabular-nums text-[13px] font-semibold"
                style={{ color: b.neg ? 'var(--negative)' : b.current ? 'var(--module-active-700)' : 'var(--ink)' }}
              >
                {b.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer-notes */}
      <section
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-7 pt-6 mt-6"
        style={{ borderTop: '4px double var(--ink)' }}
      >
        {[
          {
            title: 'Aannames',
            body: 'WOZ-stijging 5,0% per jaar, huurindexatie 3,0%, geen leegstand.',
          },
          {
            title: 'Niet meegenomen',
            body: 'Verhuurdersheffing, stijging marginaal IB-tarief, leegstandsrisico.',
          },
          {
            title: 'Onzekerheden',
            body: 'Box 3-stelsel 2028 nog niet definitief. Werkelijk-rendement-tarief kan afwijken.',
          },
          {
            title: 'Updates',
            body: 'Model bijgewerkt aan v4 (mei 2026). Wijzigingen worden hier gepubliceerd.',
          },
        ].map((n) => (
          <div key={n.title}>
            <h4 className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] font-semibold mb-2">
              {n.title}
            </h4>
            <p
              className="text-xs leading-relaxed text-[var(--ink-2)]"
              style={{ fontFamily: SOURCE_SERIF }}
            >
              {n.body}
            </p>
          </div>
        ))}
      </section>

      <Colophon text="Horizon · Verhuur rekenmodel" />
    </div>
  )
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  valueState,
  onChange,
  minLabel,
  maxLabel,
}: {
  label: string
  value: string
  min: number
  max: number
  step: number
  valueState: number
  onChange: (n: number) => void
  minLabel: string
  maxLabel: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span
          className="text-[13px] text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {label}
        </span>
        <span
          className="font-bold text-[18px] tracking-[-0.01em]"
          style={{ fontFamily: PLAYFAIR }}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueState}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={
          {
            accentColor: 'var(--module-active-500)',
            height: '2px',
          } as React.CSSProperties
        }
      />
      <div className="flex justify-between text-[9px] uppercase tracking-[0.1em] font-mono text-[var(--ink-3)] mt-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}
