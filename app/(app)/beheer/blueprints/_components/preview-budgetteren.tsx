'use client'

import { useState } from 'react'
import {
  ShoppingCart,
  Car,
  Utensils,
  Music,
  Wifi,
  PiggyBank,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import {
  Kicker,
  EditorialDeck,
  HighlightMark,
  SectionLabel,
  CardEditorial,
  FiguresStrip,
  ScenarioCallout,
  Colophon,
} from './editorial'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * Budgetteren — App-preview binnen Kern-categorie Cash.
 *
 * Toont hoe de envelope-budgetting feature van TriFinity er uitziet
 * met de nieuwe blueprint. Bouwt op de mini-artikel-blueprint voor
 * envelope-cards en gebruikt de figures-strip voor maandcyclus-totalen.
 *
 * NB: dit is een visueel mockup met statische data. De echte
 * `<BudgetsClient>` wordt onveranderd geëmbed in de app-tab van de
 * cash-categorie zodra de rollout begint — alleen de presentatie-laag
 * krijgt deze nieuwe stijl.
 */
export function BudgetterenPreview() {
  const [tab, setTab] = useState<'envelopes' | 'transacties' | 'plan'>('envelopes')

  return (
    <div className="space-y-6">
      {/* Editorial header — maand-context */}
      <header className="space-y-2">
        <Kicker>Budgetteren · April 2026</Kicker>
        <h1
          className="font-bold text-[28px] sm:text-[36px] leading-tight tracking-[-0.02em]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Hoeveel{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            ruimte
          </em>{' '}
          heb je nog?
        </h1>
        <p
          className="font-mono tabular-nums text-[36px] sm:text-[44px] font-bold leading-none mt-2"
        >
          <HighlightMark>€ 1.245</HighlightMark>
        </p>
        <p
          className="italic text-[13px] text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Te besteden de komende 12 dagen · €103,75 per dag
        </p>
      </header>

      <EditorialDeck>
        Volgens de envelope-methode geef je elk potje een eigen budget. Wat
        over is aan het eind van de maand schuift door naar je doelen.
      </EditorialDeck>

      {/* Maandcyclus-totalen */}
      <FiguresStrip
        figures={[
          {
            kicker: 'Inkomsten',
            amount: '€ 4.850',
            sub: 'salaris + bijklus',
            variant: 'positive',
          },
          {
            kicker: 'Vaste lasten',
            amount: '€ 2.140',
            sub: 'huur, energie, abo',
            variant: 'negative',
          },
          {
            kicker: 'Variabel besteed',
            amount: '€ 1.465',
            sub: '18 t/m 30 april',
            variant: 'negative',
          },
          {
            kicker: 'Te besteden',
            amount: '€ 1.245',
            sub: 'envelope-saldo',
            variant: 'winner',
          },
        ]}
      />

      {/* Tab-bar binnen de app */}
      <nav
        className="flex gap-1 border-b border-[var(--border-ed)] overflow-x-auto"
        role="tablist"
      >
        {[
          { id: 'envelopes', label: 'Envelopes' },
          { id: 'transacties', label: 'Transacties' },
          { id: 'plan', label: 'Maandplan' },
        ].map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              onClick={() => setTab(t.id as typeof tab)}
              className="px-3 py-2 text-[12px] uppercase tracking-[0.12em] font-mono whitespace-nowrap"
              style={{
                color: active ? 'var(--module-active-700)' : 'var(--ink-3)',
                borderBottom: active
                  ? '3px solid var(--module-active-500)'
                  : '3px solid transparent',
                background: active ? 'var(--module-active-50)' : 'transparent',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {tab === 'envelopes' && <EnvelopesGrid />}
      {tab === 'transacties' && <RecentTransactions />}
      {tab === 'plan' && <MaandplanView />}

      {/* AI-suggestie callout */}
      <ScenarioCallout title="AI heeft gevonden:">
        Drie nieuwe terugkerende lasten dit jaar: <em>Spotify Family</em>{' '}
        (€17,99/m), <em>NL Sport Pass</em> (€8,50/m) en{' '}
        <em>Verzekering fiets</em> (€6,30/m). Wil je ze toevoegen aan je
        vaste lasten-plan?
      </ScenarioCallout>

      <Colophon text="App · Budgetteren" />
    </div>
  )
}

function EnvelopesGrid() {
  const envelopes = [
    {
      icon: ShoppingCart,
      kicker: 'Variabel',
      name: 'Boodschappen',
      assigned: 600,
      spent: 412,
      meta: '€8 per dag gemiddeld',
    },
    {
      icon: Car,
      kicker: 'Variabel',
      name: 'Vervoer',
      assigned: 250,
      spent: 178,
      meta: 'OV + benzine',
    },
    {
      icon: Utensils,
      kicker: 'Plezier',
      name: 'Uit eten',
      assigned: 200,
      spent: 247,
      meta: 'over budget',
      over: true,
    },
    {
      icon: Music,
      kicker: 'Plezier',
      name: 'Hobby & cultuur',
      assigned: 150,
      spent: 32,
      meta: 'concert geannuleerd',
    },
    {
      icon: Wifi,
      kicker: 'Vast',
      name: 'Abonnementen',
      assigned: 95,
      spent: 95,
      meta: '7 abonnementen',
    },
    {
      icon: PiggyBank,
      kicker: 'Doel',
      name: 'Buffer-aanvulling',
      assigned: 300,
      spent: 0,
      meta: 'overschrijving 28 apr',
    },
  ]

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 list-none">
      {envelopes.map((e) => {
        const Icon = e.icon
        const pct = Math.min(100, Math.round((e.spent / e.assigned) * 100))
        const remaining = e.assigned - e.spent
        const isOver = e.over === true
        return (
          <li key={e.name}>
            <CardEditorial accent>
              <div className="p-4 sm:p-5 flex flex-col gap-2.5">
                {/* Kicker met streep én icon */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
                    <span
                      aria-hidden
                      className="inline-block w-7 h-px"
                      style={{ background: 'var(--module-active-500)' }}
                    />
                    {e.kicker}
                  </div>
                  <Icon
                    className="w-4 h-4 shrink-0 text-[var(--module-active-700)]"
                    aria-hidden
                  />
                </div>
                {/* Headline */}
                <h3
                  className="font-bold text-base sm:text-lg leading-tight"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  {e.name}
                </h3>
                {/* Hoofdcijfer = wat er nog over is */}
                <p className="font-mono tabular-nums text-[20px] font-bold leading-none">
                  {isOver ? (
                    <span style={{ color: 'var(--negative)' }}>
                      −€ {Math.abs(remaining).toLocaleString('nl-NL')}
                    </span>
                  ) : (
                    <HighlightMark>
                      € {remaining.toLocaleString('nl-NL')}
                    </HighlightMark>
                  )}
                </p>
                {/* Voortgangsbalk */}
                <div
                  className="h-1.5 w-full"
                  style={{ background: 'var(--subtle)' }}
                  role="img"
                  aria-label={`${pct}% besteed`}
                >
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: isOver
                        ? 'var(--negative)'
                        : pct > 90
                        ? 'var(--color-horizon-500)'
                        : 'var(--module-active-500)',
                    }}
                  />
                </div>
                {/* Meta-regel */}
                <div className="flex items-baseline justify-between text-[11px] mt-0.5">
                  <span
                    className="font-mono tabular-nums text-[var(--ink-3)]"
                  >
                    € {e.spent.toLocaleString('nl-NL')} / €{' '}
                    {e.assigned.toLocaleString('nl-NL')}
                  </span>
                  <span
                    className="italic text-[var(--ink-3)]"
                    style={{ fontFamily: SOURCE_SERIF }}
                  >
                    {e.meta}
                  </span>
                </div>
              </div>
            </CardEditorial>
          </li>
        )
      })}
    </ul>
  )
}

function RecentTransactions() {
  const txs = [
    { date: '28 apr', merchant: 'Albert Heijn', envelope: 'Boodschappen', amount: -42.18 },
    { date: '27 apr', merchant: 'NS Reizigers', envelope: 'Vervoer', amount: -28.4 },
    { date: '27 apr', merchant: 'Restaurant De Buurt', envelope: 'Uit eten', amount: -67.5 },
    { date: '26 apr', merchant: 'Jumbo', envelope: 'Boodschappen', amount: -38.92 },
    { date: '26 apr', merchant: 'Spotify Family', envelope: 'Abonnementen', amount: -17.99 },
    { date: '25 apr', merchant: 'Salaris ASN', envelope: 'Inkomen', amount: 2425.0 },
  ]
  return (
    <div className="space-y-3">
      <SectionLabel num="i.">Recente transacties</SectionLabel>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.12em] font-mono text-[var(--ink-3)] border-b border-[var(--ink)]">
            <th className="text-left py-2 font-semibold">Datum</th>
            <th className="text-left py-2 font-semibold">Wie</th>
            <th className="text-left py-2 font-semibold">Envelope</th>
            <th className="text-right py-2 font-semibold">Bedrag</th>
          </tr>
        </thead>
        <tbody style={{ fontFamily: SOURCE_SERIF }}>
          {txs.map((t, idx) => (
            <tr
              key={idx}
              className="border-b border-dotted border-[var(--rule-soft)] hover:bg-[var(--subtle)]/50"
            >
              <td className="py-2 text-[var(--ink-2)]">{t.date}</td>
              <td className="py-2">{t.merchant}</td>
              <td className="py-2">
                <span
                  className="text-[10px] uppercase tracking-[0.12em] font-mono px-1.5 py-0.5"
                  style={{
                    background: 'var(--module-active-50)',
                    color: 'var(--module-active-700)',
                    border: '1px solid var(--module-active-200)',
                  }}
                >
                  {t.envelope}
                </span>
              </td>
              <td
                className="py-2 text-right font-mono tabular-nums font-medium"
                style={{
                  color:
                    t.amount > 0 ? 'var(--positive)' : 'var(--ink)',
                }}
              >
                {t.amount > 0 ? '+' : '−'}€{' '}
                {Math.abs(t.amount).toLocaleString('nl-NL', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] hover:gap-2 transition-all mt-2"
      >
        Open alle 47 transacties <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  )
}

function MaandplanView() {
  return (
    <div className="space-y-5">
      <SectionLabel num="i.">Maandplan april</SectionLabel>

      <ScenarioCallout title="Plan vanuit AI-analyse:">
        Op basis van je laatste 6 maanden hebben we onderstaande
        envelope-grootte gekozen. Pas aan en we onthouden je voorkeur
        voor volgende maand.
      </ScenarioCallout>

      <CardEditorial>
        <div className="p-4 sm:p-5 space-y-3">
          {[
            { name: 'Inkomsten', amount: 4850, type: 'income' },
            { name: 'Vaste lasten', amount: 2140, type: 'fixed' },
            { name: 'Boodschappen', amount: 600, type: 'envelope' },
            { name: 'Vervoer', amount: 250, type: 'envelope' },
            { name: 'Uit eten', amount: 200, type: 'envelope' },
            { name: 'Hobby & cultuur', amount: 150, type: 'envelope' },
            { name: 'Buffer-aanvulling', amount: 300, type: 'goal' },
            { name: 'Overig / vrije ruimte', amount: 1210, type: 'free' },
          ].map((row, idx, arr) => {
            const isLast = idx === arr.length - 1
            return (
              <div
                key={row.name}
                className={`flex items-baseline justify-between py-1.5 ${
                  !isLast
                    ? 'border-b border-dotted border-[var(--rule-soft)]'
                    : ''
                }`}
                style={{ fontFamily: SOURCE_SERIF }}
              >
                <span className="text-[14px] text-[var(--ink-2)]">
                  {row.name}
                  {row.type === 'free' && (
                    <em
                      className="ml-2 text-[11px] text-[var(--ink-3)]"
                      style={{ fontFamily: SOURCE_SERIF }}
                    >
                      — schuift naar doelen
                    </em>
                  )}
                </span>
                <span
                  className="font-mono tabular-nums text-[14px] font-medium"
                  style={{
                    color:
                      row.type === 'income'
                        ? 'var(--positive)'
                        : row.type === 'goal'
                        ? 'var(--module-active-700)'
                        : 'var(--ink)',
                  }}
                >
                  {row.type === 'income' ? '+' : ''}€{' '}
                  {row.amount.toLocaleString('nl-NL')}
                </span>
              </div>
            )
          })}
        </div>
      </CardEditorial>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          className="text-[12px] uppercase tracking-[0.15em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          Reset naar suggestie
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.1em] font-mono"
          style={{
            background: 'var(--module-active-500)',
            color: 'var(--paper)',
          }}
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden /> Plan opslaan
        </button>
      </div>
    </div>
  )
}
