'use client'

import { useState } from 'react'
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react'
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
  RekeningTag,
  TogglePill,
} from './editorial'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// ─────────────────────────────────────────────────────────────────
// Type 4 — Bewerk / Create-pagina
// ─────────────────────────────────────────────────────────────────

export function EditPreview() {
  return (
    <div className="space-y-5 pb-24">
      {/* Editorial header */}
      <header className="space-y-2">
        <Kicker>Bewerken · Spaarrekening</Kicker>
        <h1
          className="font-bold text-[26px] sm:text-[32px] leading-tight tracking-[-0.02em]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Spaarrekening{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            ASN
          </em>
        </h1>
      </header>

      <ScenarioCallout title="Bij herwaardering:">
        corrigeren we de waarde maar laten we de transactiehistorie ongemoeid.
        De vorige stand blijft zichtbaar als snapshot van vandaag.
      </ScenarioCallout>

      {/* Form-secties */}
      <section>
        <SectionLabel num="i.">Basisgegevens</SectionLabel>
        <div className="space-y-4">
          <FormField label="Naam" value="Spaarrekening ASN" />
          <FormField label="Provider" value="ASN Bank" />
          <FormField label="IBAN" value="NL12 ASNB 0123 4567 89" hint="Optioneel — gebruikt voor automatische koppeling." />
        </div>
      </section>

      <section>
        <SectionLabel num="ii.">Bedrag &amp; rente</SectionLabel>
        <div className="space-y-4">
          <FormField label="Huidig saldo" value="€ 18.450,32" mono />
          <FormField
            label="Rentepercentage"
            value="2,10%"
            mono
            optional
            optionalOn
          />
        </div>
      </section>

      <section>
        <SectionLabel num="iii.">Toepassing</SectionLabel>
        <div className="space-y-3">
          <ToggleRow label="Meetellen voor netto vermogen" on />
          <ToggleRow label="Tonen op dashboard" on />
          <ToggleRow label="Buffer-functie (wordt eerst gebruikt)" on={false} />
        </div>
      </section>

      {/* Sticky save-bar (toont positie, niet écht sticky in preview) */}
      <div
        className="border-t border-[var(--border-ed)] pt-4 mt-6 flex items-center justify-between gap-3"
        style={{ background: 'var(--bg)' }}
      >
        <button
          type="button"
          className="text-[12px] uppercase tracking-[0.15em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          Annuleren
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.1em] font-mono"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          Opslaan en doorgaan <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}

function FormField({
  label,
  value,
  hint,
  mono = false,
  optional = false,
  optionalOn = false,
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
  optional?: boolean
  optionalOn?: boolean
}) {
  return (
    <div>
      <label
        className="flex items-center justify-between gap-2 mb-1.5 text-[13px] text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        <span className="inline-flex items-center gap-2">
          {label}
          {optional && <TogglePill on={optionalOn} />}
        </span>
      </label>
      <div
        className={`px-3 py-2 border border-[var(--border-md)] bg-[var(--paper)] text-[15px] ${
          mono ? 'font-mono tabular-nums' : ''
        }`}
        style={!mono ? { fontFamily: SOURCE_SERIF } : undefined}
      >
        {value}
      </div>
      {hint && (
        <p
          className="italic text-[11.5px] text-[var(--ink-3)] mt-1"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

function ToggleRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className="flex items-center justify-between py-2 border-b border-dotted border-[var(--rule-soft)] last:border-b-0"
      style={{ fontFamily: SOURCE_SERIF }}
    >
      <span className="text-[14px] text-[var(--ink)]">{label}</span>
      <TogglePill on={on} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Type 5 — Modal / Sheet
// ─────────────────────────────────────────────────────────────────

export function ModalPreview() {
  const [open, setOpen] = useState(true)
  return (
    <div className="space-y-4">
      <p
        className="italic text-[14px] text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Trigger-knop opent een bottom-sheet (mobile-first). Druk op Esc of de ✕ om te sluiten.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.1em] font-mono"
        style={{ background: 'var(--module-active-500)', color: 'var(--paper)' }}
      >
        Open voorbeeld-modal
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'var(--scrim)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[var(--paper)] border border-[var(--ink)] w-full sm:max-w-lg sm:mx-4 max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Drag-handle (alleen mobile) */}
            <div className="flex justify-center pt-2 sm:hidden">
              <span className="block w-10 h-1 bg-[var(--ink-4)] rounded-full" />
            </div>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-[var(--border-ed)]">
              <div className="space-y-1.5">
                <Kicker className="!text-[9px]">Aanbeveling</Kicker>
                <h2
                  className="font-bold text-lg sm:text-xl leading-tight"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  Verhoog je{' '}
                  <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
                    buffer
                  </em>{' '}
                  met €1.200
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Sluiten"
                className="w-11 h-11 -mt-2 -mr-2 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--ink)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
              <p
                className="text-[14px] leading-relaxed text-[var(--ink-2)]"
                style={{ fontFamily: SOURCE_SERIF }}
              >
                Je buffer dekt nu 5,2 maanden lasten. Een gezonde basis ligt op
                6 maanden — dat is €1.200 extra. We kunnen dat in 4 maanden
                opbouwen door €300 per maand opzij te zetten.
              </p>
              {/* APP-7-opt-out: blueprint-preview — toont de primitive bewust in
                  zijn volle vorm, ongeacht de weergavemodus van de beheerder. */}
              <FiguresStrip
                alwaysFull
                cols={2}
                figures={[
                  { kicker: 'Huidig', amount: '5,2 mnd', sub: '€ 12.000' },
                  { kicker: 'Doel', amount: '6,0 mnd', sub: '€ 13.200', variant: 'winner' },
                ]}
              />
            </div>
            {/* Footer met duo-CTA */}
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-t border-[var(--border-ed)]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] uppercase tracking-[0.15em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                Later
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.1em] font-mono"
                style={{ background: 'var(--ink)', color: 'var(--paper)' }}
              >
                Plan inrichten <ChevronRight className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Type 6 — Kassabon / breakdown-modal (inline preview)
// ─────────────────────────────────────────────────────────────────

export function KassabonPreview() {
  return (
    <div className="space-y-5">
      <ScenarioCallout title="Box 1 — Tijdelijke verhuur (70%-regeling):">
        je woning blijft eigen woning, hypotheekrenteaftrek behouden. 70% van
        de netto huurinkomsten wordt belast tegen je IB-tarief. Geen
        vermogenswinstbelasting.
      </ScenarioCallout>

      <PullQuote>
        Met de <HL>70%-regeling</HL> en 50,0% IB-tarief levert verhuur over{' '}
        <HL>jaar 10</HL> netto <HighlightMark><HL>+€ 203.375</HL></HighlightMark> op —
        incl. waardestijging. Wordt het krap?{' '}
        <HLNeg>−€ 12.450</HLNeg> aan onverwachte kosten kan dat halveren.
      </PullQuote>

      {/* APP-7-opt-out: blueprint-preview (zie hierboven). */}
      <FiguresStrip
        alwaysFull
        figures={[
          { kicker: 'Bruto huur cumulatief', amount: '€ 206.350', sub: '10 jaar inkomsten' },
          { kicker: 'Belasting box 1', amount: '€ 70.122', sub: '70% × 50,0%', variant: 'negative' },
          { kicker: 'Waardestijging', amount: '€ 98.108', sub: 'onbelast', variant: 'positive' },
          { kicker: 'Eindresultaat', amount: '+€ 203.375', sub: '10-jaars netto', variant: 'winner' },
        ]}
      />

      <RekeningTag label="rekening">
        <div
          className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--ink-3)] mb-3 pb-1 border-b border-dashed border-[var(--rule-soft)]"
        >
          Box 1 · 70%-regeling · per jaar
        </div>
        <ul className="space-y-1 text-[14px]" style={{ fontFamily: SOURCE_SERIF }}>
          <RekeningRow label="Bruto huur" value="€ 14.400" />
          <RekeningRow label="Onderhoud (1,0%)" value="−€ 1.560" neg />
          <RekeningRow label="Overige kosten" value="−€ 600" neg />
          <RekeningRow label="Hypotheekrente verhuurd deel" value="−€ 3.840" neg />
          <RekeningRow
            label="Hypotheekrenteaftrek (49,5%)"
            value="+€ 1.901"
            pos
            tax
          />
          <RekeningRow label="Subtotaal vóór box 1" value="€ 10.301" subtotal />
          <RekeningRow label="Belasting (70% × 49,5%)" value="−€ 3.569" neg tax />
          <RekeningRow label="Netto cashflow jaar 1" value="€ 6.732" total />
        </ul>
      </RekeningTag>
    </div>
  )
}

function RekeningRow({
  label,
  value,
  neg,
  pos,
  tax,
  subtotal,
  total,
}: {
  label: string
  value: string
  neg?: boolean
  pos?: boolean
  tax?: boolean
  subtotal?: boolean
  total?: boolean
}) {
  if (total) {
    return (
      <li
        className="flex items-baseline justify-between pt-3 mt-2"
        style={{
          borderTop: '2px solid var(--ink)',
          borderBottom: '4px double var(--ink)',
          fontFamily: PLAYFAIR,
          fontSize: '18px',
          fontWeight: 900,
          paddingBottom: '12px',
        }}
      >
        <span>{label}</span>
        <span>
          <HighlightMark>{value}</HighlightMark>
        </span>
      </li>
    )
  }
  if (subtotal) {
    return (
      <li
        className="flex items-baseline justify-between pt-2 mt-1 font-bold"
        style={{ borderTop: '1px solid var(--ink)', fontFamily: SOURCE_SERIF }}
      >
        <span className="text-[var(--ink)]">{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
      </li>
    )
  }
  return (
    <li
      className="flex items-baseline justify-between py-1 border-b border-dotted border-[var(--rule-soft)]"
      style={
        tax
          ? {
              background: 'rgba(91,63,122,0.05)',
              borderLeft: '3px solid var(--color-wil-500)',
              paddingLeft: '8px',
              marginLeft: '-8px',
              marginRight: '-8px',
              paddingRight: '8px',
            }
          : undefined
      }
    >
      <span className="text-[var(--ink-2)]">{label}</span>
      <span
        className="font-mono tabular-nums text-[13px] font-medium"
        style={{
          color: neg
            ? 'var(--negative)'
            : pos
            ? 'var(--positive)'
            : 'var(--ink)',
        }}
      >
        {value}
      </span>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────
// Type 7 — Wizard / multi-step
// ─────────────────────────────────────────────────────────────────

export function WizardPreview() {
  const [step, setStep] = useState(2)
  const total = 4
  return (
    <div className="space-y-5 pb-20">
      {/* Stappen-balk */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span
            className="italic text-sm text-[var(--module-active-700)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {['i.', 'ii.', 'iii.', 'iv.'][step - 1]} / iv.
          </span>
          <span
            className="italic text-[12px] text-[var(--ink-3)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            stap {step} van {total}
          </span>
        </div>
        <div className="h-[2px] w-full bg-[var(--rule-soft)]">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${(step / total) * 100}%`,
              background: 'var(--module-active-500)',
            }}
          />
        </div>
      </div>

      {/* Editorial header per stap */}
      <header className="space-y-2 pt-2">
        <Kicker>Maandelijkse check-in</Kicker>
        <h1
          className="font-bold text-[26px] sm:text-[34px] leading-tight tracking-[-0.02em]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Hoe voelt je{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            ruimte
          </em>{' '}
          deze maand?
        </h1>
        <EditorialDeck>
          Eén woord. Eén gevoel. Geen analyse — dat doen we straks. Hoe stond je
          financieel in april?
        </EditorialDeck>
      </header>

      {/* Form-blueprint */}
      <section className="space-y-3">
        {[
          { label: 'Ruim', desc: 'Ik had marge, koos vrij' },
          { label: 'In balans', desc: 'Inkomsten en uitgaven matchten' },
          { label: 'Krap', desc: 'Ik moest opletten op kleine bedragen' },
          { label: 'Onder druk', desc: 'Ik gebruikte mijn buffer' },
        ].map((opt) => (
          <CardEditorial key={opt.label}>
            <button
              type="button"
              className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-[var(--subtle)]/40"
            >
              <div>
                <div
                  className="font-bold text-base"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  {opt.label}
                </div>
                <div
                  className="italic text-[12.5px] text-[var(--ink-3)] mt-0.5"
                  style={{ fontFamily: SOURCE_SERIF }}
                >
                  {opt.desc}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--ink-3)]" aria-hidden />
            </button>
          </CardEditorial>
        ))}
      </section>

      {/* Save-progress-banner */}
      <div
        className="border border-[var(--border-ed)] bg-[var(--paper)] p-3 italic text-[12.5px] text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        <Check className="inline w-3.5 h-3.5 mr-1 text-[var(--positive)]" aria-hidden />
        Voortgang opgeslagen — je kunt later terugkomen via dashboard.
      </div>

      {/* Navigatie-balk */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-ed)]">
        <button
          type="button"
          onClick={() => setStep(Math.max(1, step - 1))}
          className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.15em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-30"
          disabled={step === 1}
        >
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden /> Vorige
        </button>
        <span className="text-[10px] uppercase tracking-[0.12em] font-mono text-[var(--ink-4)]">
          Skip
        </span>
        <button
          type="button"
          onClick={() => setStep(Math.min(total, step + 1))}
          className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.1em] font-mono"
          style={{ background: 'var(--module-active-500)', color: 'var(--paper)' }}
        >
          Volgende <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
