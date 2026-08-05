'use client'

import { ChevronDown, AlertTriangle } from 'lucide-react'
import { SectionLabel, RekeningTag, HighlightMark } from '@/components/editorial'
import { JaarruimteCard } from '@/components/overview/jaarruimte-card'
import { JAARRUIMTE_TITLE, JAARRUIMTE_CAVEAT, type Opportunity } from './optimizer-model'
import type { GoalSection } from '@/lib/tax-optimizer/types'
import type { TaxYear } from '@/lib/box3-data'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

function signed(value: number, fc: (v: number) => string): string {
  if (value === 0) return fc(0)
  return `${value > 0 ? '+ ' : '− '}${fc(Math.abs(value))}`
}

/** Eén rij van de accordeon: een kans, of de jaarruimte-kaart zonder cijfers. */
type DetailRow = {
  id: string
  title: string
  netEffect: number | null
  opportunity: Opportunity | null
}

/**
 * Katern III — "Inzoomen per kans". Detail op aanvraag: elke kans begint
 * ingeklapt, er staat er maximaal één tegelijk open. Box 3-kansen tonen een
 * kassabon (heffing nu → besparing → misgelopen rendement → netto effect); de
 * jaarruimte hergebruikt de bestaande `JaarruimteCard`.
 */
export function OptimizerDetails({
  opportunities,
  jaarruimteSection,
  openId,
  onToggle,
  fc,
  year,
}: {
  /** In de volgorde van de vergelijking. */
  opportunities: Opportunity[]
  jaarruimteSection?: Extract<GoalSection, { kind: 'jaarruimte' }>
  openId: string | null
  onToggle: (id: string) => void
  fc: (v: number) => string
  year: TaxYear
}) {
  const rows: DetailRow[] = opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    netEffect: o.netEffect,
    opportunity: o,
  }))

  // De jaarruimte-kaart blijft bereikbaar wanneer er (nog) geen doorgerekende
  // besparing is — de kaart toont dan zelf de "vul je inkomen aan"-melding.
  const hasJaarruimteRow = rows.some((r) => r.opportunity?.kind === 'jaarruimte')
  if (jaarruimteSection && !hasJaarruimteRow) {
    rows.push({
      id: 'jaarruimte-maximaal',
      title: JAARRUIMTE_TITLE,
      netEffect: null,
      opportunity: null,
    })
  }

  if (rows.length === 0) return null

  return (
    <section id="optimizer-uitwerking" className="scroll-mt-24">
      <SectionLabel num="III">De uitwerking</SectionLabel>
      <div className="-mt-3 mb-4">
        <h2
          className="text-[22px] sm:text-[26px] font-black leading-tight tracking-[-0.02em] text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Inzoomen per{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            kans
          </em>
        </h2>
        <p
          className="mt-1.5 max-w-[64ch] text-sm italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Eén kans tegelijk uitgeklapt, de rest compact. Elke uitwerking volgt dezelfde opbouw:
          de rekening, de aannames en de kanttekening.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const open = openId === row.id
          return (
            <div
              key={row.id}
              id={`optimizer-detail-${row.id}`}
              className={`scroll-mt-24 bg-[var(--paper)] ${
                open ? 'border border-[var(--ink)]' : 'border border-[var(--border-ed)]'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(row.id)}
                aria-expanded={open}
                aria-controls={`optimizer-detail-body-${row.id}`}
                className="flex min-h-[44px] w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <span className="text-[13.5px] font-semibold leading-snug text-[var(--ink)]">
                  {row.title}
                </span>
                <span className="ml-auto flex items-baseline gap-3">
                  {row.netEffect !== null && (
                    <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-[var(--ink-3)]">
                      netto{' '}
                      <span
                        style={{
                          color:
                            row.netEffect > 0
                              ? 'var(--positive)'
                              : row.netEffect < 0
                                ? 'var(--negative)'
                                : 'var(--ink-2)',
                        }}
                      >
                        {signed(row.netEffect, fc)}/jr
                      </span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    {open ? 'Verberg' : 'Toon uitwerking'}
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                </span>
              </button>

              {open && (
                <div
                  id={`optimizer-detail-body-${row.id}`}
                  className="border-t border-dotted border-[var(--rule-soft)] px-4 pb-5 pt-4 sm:px-5"
                >
                  {row.opportunity && row.opportunity.kind === 'box3' ? (
                    <Box3Uitwerking opportunity={row.opportunity} fc={fc} />
                  ) : (
                    jaarruimteSection && (
                      <div>
                        <JaarruimteCard
                          grossYearlyIncome={jaarruimteSection.grossYearlyIncome}
                          pensioenAangroei={jaarruimteSection.pensionFactorA}
                          year={year}
                          dailyExpenses={jaarruimteSection.dailyExpenses}
                        />
                        <Caveat text={JAARRUIMTE_CAVEAT} />
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Kassabon + verdict + uitlegbaarheid voor één Box 3-scenario. */
function Box3Uitwerking({
  opportunity,
  fc,
}: {
  opportunity: Opportunity
  fc: (v: number) => string
}) {
  const s = opportunity.strategy
  if (!s) return null
  const negative = opportunity.netEffect < 0

  return (
    <div>
      <p
        className="mb-4 max-w-[62ch] text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        {opportunity.description}
      </p>

      <RekeningTag label="rekening">
        <ReceiptRow
          label={`Heffing ${s.currentLabel.toLowerCase()} (referentie)`}
          amount={`${fc(s.currentTax)}/jr`}
        />
        <ReceiptRow
          label="Belastingbesparing in dit scenario"
          amount={`− ${fc(opportunity.savings)}`}
          color="var(--positive)"
        />
        {opportunity.returnCostEur > 0 && (
          <ReceiptRow
            label="Verwacht misgelopen rendement"
            amount={`+ ${fc(opportunity.returnCostEur)}`}
            color="var(--negative)"
          />
        )}
        <ReceiptRow
          label="Netto effect per jaar"
          amount={`${signed(opportunity.netEffect, fc)}/jr`}
          color={negative ? 'var(--negative)' : 'var(--positive)'}
          total
        />
        <p
          className="mt-2.5 text-[11.5px] italic leading-snug text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {opportunity.netFreedomDays > 0
            ? `Per saldo koop je hiermee ongeveer ${opportunity.netFreedomDays} vrijheidsdagen per jaar terug.`
            : 'Per saldo koop je hiermee geen vrijheidsdagen terug.'}
        </p>
      </RekeningTag>

      {negative && (
        <div
          className="mt-4 px-3.5 py-2.5 text-[13px] leading-snug text-[var(--ink-2)]"
          style={{
            borderLeft: '3px solid var(--negative)',
            background: 'color-mix(in srgb, var(--negative) 6%, var(--paper))',
          }}
        >
          Per saldo <strong style={{ color: 'var(--negative)' }}>kost dit scenario je geld</strong>.
          Het staat in de vergelijking omdat het je heffing wél verlaagt — tegen deze aannames koop
          je er geen vrijheid mee terug.
        </div>
      )}

      {opportunity.detail.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
          {opportunity.detail.map((d, i) => (
            <li key={i} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
              <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[var(--ink-4)]" />
              {d}
            </li>
          ))}
        </ul>
      )}

      {opportunity.caveat && <Caveat text={opportunity.caveat} />}
    </div>
  )
}

function ReceiptRow({
  label,
  amount,
  color,
  total = false,
}: {
  label: string
  amount: string
  color?: string
  total?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2 ${
        total
          ? 'border-b-4 border-double border-[var(--ink)] font-bold'
          : 'border-b border-dotted border-[var(--rule-soft)]'
      }`}
    >
      <span className="text-[13px] text-[var(--ink-2)]" style={{ fontFamily: SOURCE_SERIF }}>
        {label}
      </span>
      <span
        className="whitespace-nowrap font-mono text-[13px] tabular-nums"
        style={{ color: color ?? 'var(--ink)' }}
      >
        {/* Sluitrij = hoofduitkomst van de kassabon → verplichte
            highlight-marker (quality-checklist: één per sectie). */}
        {total ? <HighlightMark>{amount}</HighlightMark> : amount}
      </span>
    </div>
  )
}

function Caveat({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 border-t border-[var(--rule-soft)] pt-3">
      <AlertTriangle
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]"
        aria-hidden="true"
      />
      <p className="max-w-[62ch] text-xs leading-snug text-[var(--ink-2)]">{text}</p>
    </div>
  )
}
