'use client'

/**
 * ManualWizard — handmatige 12-veld aangifte-import wizard.
 *
 * Voor gebruikers die geen PDF willen / kunnen uploaden. Drie secties:
 *   · Box 1 inkomen (bruto loon, type werknemer/zelfstandig/gemengd, AOW
 *     toggle)
 *   · Box 1 eigen woning (optioneel — WOZ + hypotheek-saldo + aflosvorm)
 *   · Box 3 bezittingen + schulden (zes totalen: bank/savings, beleggingen,
 *     crypto, tweede woning, vorderingen, schulden)
 *
 * Elk veld heeft een help-popover *"Vraag X.Y in de aangifte"* zodat de
 * gebruiker weet waar het cijfer vandaan komt.
 *
 * Bij submit bouwen we een `AangifteExtractionResult` op alsof de AI dat
 * had geretourneerd — zo kan de review-step één codepad gebruiken voor
 * beide inputs (PDF en handmatig).
 *
 * Tolerant: alleen `tax_year` is verplicht. Alle bedragsvelden mogen leeg
 * (leeg = niet importeren). Maar minstens één veld moet ingevuld zijn —
 * anders heeft de import geen toegevoegde waarde en zien we de submit-knop
 * gedimd.
 */

import { useMemo, useState } from 'react'
import { HelpCircle, Plus, Minus } from 'lucide-react'
import type { AangifteExtractionResult } from '@/lib/aangifte/types'
import type {
  AangifteAssetType,
  AangifteDebtType,
  AangifteBox1Kind,
} from '@/lib/aangifte/extraction-schema'

interface ManualWizardProps {
  fallbackTaxYear?: number
  onSubmit: (result: AangifteExtractionResult) => void
  onCancel: () => void
  onSwitchToPdf: () => void
}

type IncomeType = 'employee' | 'self_employed' | 'mixed'
type RepaymentType = 'aflossingsvrij' | 'annuiteit' | 'lineair'

/** State-shape — strings ipv numbers zodat lege velden niet als 0 gelden. */
interface FormState {
  // Box 1 — inkomen
  bruto_jaarloon: string
  income_type: IncomeType
  aow_active: boolean

  // Box 1 — eigen woning (optioneel)
  has_eigen_huis: boolean
  woz_value: string
  mortgage_balance: string
  repayment_type: RepaymentType

  // Box 3 — bezittingen
  bank_savings_total: string
  investments_total: string
  crypto_total: string
  second_home_value: string
  vorderingen_total: string

  // Box 3 — schulden
  debts_total: string
}

const INITIAL_STATE: FormState = {
  bruto_jaarloon: '',
  income_type: 'employee',
  aow_active: false,
  has_eigen_huis: false,
  woz_value: '',
  mortgage_balance: '',
  repayment_type: 'annuiteit',
  bank_savings_total: '',
  investments_total: '',
  crypto_total: '',
  second_home_value: '',
  vorderingen_total: '',
  debts_total: '',
}

const CURRENT_YEAR = new Date().getFullYear()
const TAX_YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 1 - i)

/**
 * Help-popover met instructie waar dit veld in de aangifte staat.
 * Eenvoudige hover/click toggle — geen radix Popover (project gebruikt geen
 * Radix UI in de bestaande onboarding-flow).
 */
function HelpHint({ children, label }: { children: React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label={`Help: ${label}`}
        className="inline-flex h-5 w-5 items-center justify-center text-[var(--ink-4)] hover:text-[var(--color-kern-700)] transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] tracking-[0.05em] text-[var(--ink-2)] shadow-sm"
        >
          {children}
        </span>
      )}
    </span>
  )
}

/**
 * Editorial input-row — label boven, input onder. Volgt UI/UX-skill:
 * labels NIET als placeholder, mono-font + tabular-nums voor bedragen,
 * inputmode decimal voor mobile keyboards.
 */
function MoneyInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  hintLabel,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  hintLabel?: string
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.10em] text-[var(--ink-3)]"
      >
        {label}
        {hint && <HelpHint label={hintLabel ?? label}>{hint}</HelpHint>}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)] font-mono"
        >
          €
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            // Alleen cijfers + decimaalpunt/komma — vergevingsgezind voor
            // copy-paste uit de aangifte (die soms thousands-separators
            // bevat).
            const cleaned = e.target.value.replace(/[^\d.,]/g, '')
            onChange(cleaned)
          }}
          placeholder={placeholder ?? '0'}
          className="block w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] py-2 pl-8 pr-3 text-right font-mono text-sm tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--color-kern-500)] focus:outline-none"
        />
      </div>
    </div>
  )
}

/** Parse een NL-style decimaal-string naar number. Lege string → null. */
function parseAmount(value: string): number | null {
  if (!value || !value.trim()) return null
  // Vervang komma door punt voor consistente decimaal-parsing.
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  if (Number.isNaN(parsed) || parsed < 0) return null
  return parsed
}

/**
 * Bouw een `AangifteExtractionResult` uit de form-state. Mirror van wat
 * de AI zou retourneren — review-step kan beide ingangen identiek
 * verwerken.
 */
function buildExtractionResult(state: FormState, taxYear: number): AangifteExtractionResult {
  const peildatum = `${taxYear}-01-01`

  const assets: AangifteExtractionResult['assets'] = []
  const debts: AangifteExtractionResult['debts'] = []
  const box1: AangifteExtractionResult['box1_components'] = []

  // ── Box 1 inkomen ────────────────────────────────────────────────
  const loon = parseAmount(state.bruto_jaarloon)
  if (loon != null && loon > 0) {
    box1.push({
      kind: state.income_type === 'self_employed' ? ('winst' as AangifteBox1Kind) : ('loon' as AangifteBox1Kind),
      annual_amount: loon,
      label: state.income_type === 'self_employed'
        ? 'Winst uit onderneming'
        : state.income_type === 'mixed'
          ? 'Bruto inkomen (gemengd)'
          : 'Bruto loon werkgever',
    })
  }
  if (state.aow_active) {
    box1.push({
      kind: 'aow' as AangifteBox1Kind,
      annual_amount: 0, // AOW-bedrag is vast via NL_AOW_MONTHLY — geen invoer nodig
      label: 'AOW-uitkering (bevestigd)',
    })
  }

  // ── Box 1 eigen woning + hypotheek ────────────────────────────────
  if (state.has_eigen_huis) {
    const woz = parseAmount(state.woz_value)
    if (woz != null && woz > 0) {
      assets.push({
        name: 'Eigen woning',
        asset_type: 'eigen_huis' as AangifteAssetType,
        current_value: woz,
        woz_value: woz,
        subtype: null,
      })
    }
    const mortgage = parseAmount(state.mortgage_balance)
    if (mortgage != null && mortgage > 0) {
      debts.push({
        name: 'Hypotheek eigen woning',
        debt_type: 'mortgage' as AangifteDebtType,
        current_balance: mortgage,
        repayment_type: state.repayment_type,
        is_tax_deductible: true,
        interest_rate: null,
        subtype: state.repayment_type,
      })
    }
  }

  // ── Box 3 bezittingen ─────────────────────────────────────────────
  const bankSavings = parseAmount(state.bank_savings_total)
  if (bankSavings != null && bankSavings > 0) {
    assets.push({
      name: 'Bank- en spaartegoeden',
      asset_type: 'savings' as AangifteAssetType,
      current_value: bankSavings,
      subtype: null,
      woz_value: null,
    })
  }

  const investments = parseAmount(state.investments_total)
  if (investments != null && investments > 0) {
    assets.push({
      name: 'Beleggingen',
      asset_type: 'investment' as AangifteAssetType,
      current_value: investments,
      subtype: null,
      woz_value: null,
    })
  }

  const crypto = parseAmount(state.crypto_total)
  if (crypto != null && crypto > 0) {
    assets.push({
      name: 'Cryptovaluta',
      asset_type: 'crypto' as AangifteAssetType,
      current_value: crypto,
      subtype: null,
      woz_value: null,
    })
  }

  const secondHome = parseAmount(state.second_home_value)
  if (secondHome != null && secondHome > 0) {
    assets.push({
      name: 'Tweede woning',
      asset_type: 'real_estate' as AangifteAssetType,
      current_value: secondHome,
      subtype: null,
      woz_value: null,
    })
  }

  const vorderingen = parseAmount(state.vorderingen_total)
  if (vorderingen != null && vorderingen > 0) {
    assets.push({
      name: 'Vorderingen',
      asset_type: 'vordering' as AangifteAssetType,
      current_value: vorderingen,
      subtype: null,
      woz_value: null,
    })
  }

  // ── Box 3 schulden ────────────────────────────────────────────────
  const totalDebts = parseAmount(state.debts_total)
  if (totalDebts != null && totalDebts > 0) {
    debts.push({
      name: 'Box 3 schulden',
      debt_type: 'personal_loan' as AangifteDebtType,
      current_balance: totalDebts,
      interest_rate: null,
      repayment_type: null,
      subtype: null,
      is_tax_deductible: false,
    })
  }

  return {
    assets,
    debts,
    box1_components: box1,
    peildatum,
    tax_year: taxYear,
  }
}

export function ManualWizard({
  fallbackTaxYear = CURRENT_YEAR - 1,
  onSubmit,
  onCancel,
  onSwitchToPdf,
}: ManualWizardProps) {
  const [taxYear, setTaxYear] = useState<number>(fallbackTaxYear)
  const [state, setState] = useState<FormState>(INITIAL_STATE)

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  /**
   * Submit-knop is alleen actief als ten minste één bedragsveld is ingevuld
   * óf de AOW-toggle aan staat. Verhindert "lege import" die niets oplevert.
   */
  const hasAnyInput = useMemo(() => {
    if (state.aow_active) return true
    const fields: (keyof FormState)[] = [
      'bruto_jaarloon',
      'woz_value',
      'mortgage_balance',
      'bank_savings_total',
      'investments_total',
      'crypto_total',
      'second_home_value',
      'vorderingen_total',
      'debts_total',
    ]
    return fields.some((f) => {
      const v = state[f]
      return typeof v === 'string' && parseAmount(v) != null
    })
  }, [state])

  const handleSubmit = () => {
    if (!hasAnyInput) return
    const result = buildExtractionResult(state, taxYear)
    onSubmit(result)
  }

  return (
    <div className="space-y-6">
      {/* Editorial header */}
      <div className="space-y-2">
        <p className="flex items-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          <span
            className="inline-block w-7 h-px bg-[var(--color-kern-500)] mr-2.5 align-middle"
            aria-hidden="true"
          />
          Stap 1 — handmatig invoeren
        </p>
        <h2 className="font-serif text-2xl text-[var(--ink)] leading-tight">
          Open je aangifte en typ de{' '}
          <em className="font-serif italic font-normal text-[var(--color-kern-700)]">totalen</em>
        </h2>
        <p className="font-serif italic text-sm text-[var(--ink-2)] leading-relaxed border-l-2 border-[var(--color-kern-500)] pl-3 max-w-[60ch]">
          Vul alleen in wat je hebt — overslaan kan altijd. De totalen per box volstaan; je
          bevestigt straks per regel of ze in jouw vermogen mogen landen.
        </p>
      </div>

      {/* Tax-year picker */}
      <div className="flex items-center gap-3">
        <label
          htmlFor="aangifte-manual-tax-year"
          className="text-xs font-mono uppercase tracking-[0.10em] text-[var(--ink-3)]"
        >
          Belastingjaar
        </label>
        <select
          id="aangifte-manual-tax-year"
          value={taxYear}
          onChange={(e) => setTaxYear(Number.parseInt(e.target.value, 10))}
          className="min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-[var(--color-kern-500)] focus:outline-none"
        >
          {TAX_YEAR_OPTIONS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* ── Sectie 1: Box 1 inkomen ─────────────────────────────────── */}
      <fieldset className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 space-y-4">
        <legend className="px-2 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--color-kern-700)]">
          Box 1 — inkomen
        </legend>

        <MoneyInput
          id="bruto-jaarloon"
          label="Bruto jaarloon"
          value={state.bruto_jaarloon}
          onChange={(v) => update('bruto_jaarloon', v)}
          hint="Vraag 1 in Box 1 — totaal jaarbedrag van je werkgever(s)."
          hintLabel="Bruto jaarloon"
        />

        <div className="space-y-1.5">
          <p className="text-[10px] font-mono uppercase tracking-[0.10em] text-[var(--ink-3)]">
            Inkomenstype
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'employee' as IncomeType, label: 'Loondienst' },
              { value: 'self_employed' as IncomeType, label: 'Zelfstandig' },
              { value: 'mixed' as IncomeType, label: 'Gemengd' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update('income_type', opt.value)}
                className={`min-h-[44px] px-3 py-2 text-xs font-medium border transition-colors ${
                  state.income_type === opt.value
                    ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                    : 'bg-transparent text-[var(--ink-3)] border-[var(--border-ed)] hover:border-[var(--ink-3)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={state.aow_active}
            onChange={(e) => update('aow_active', e.target.checked)}
            className="h-4 w-4 border-[var(--border-ed)] accent-[var(--color-kern-700)]"
          />
          <span className="font-serif text-sm text-[var(--ink-2)]">
            Ik ontvang AOW
          </span>
          <HelpHint label="AOW">Vink aan als je AOW ontvangt. Bedrag is vast en hoeft niet ingevuld.</HelpHint>
        </label>
      </fieldset>

      {/* ── Sectie 2: Box 1 eigen woning ────────────────────────────── */}
      <fieldset className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 space-y-4">
        <legend className="px-2 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--color-kern-700)]">
          Box 1 — eigen woning <span className="text-[var(--ink-4)] normal-case tracking-normal italic">(optioneel)</span>
        </legend>

        <button
          type="button"
          onClick={() => update('has_eigen_huis', !state.has_eigen_huis)}
          className="inline-flex items-center gap-2 min-h-[44px] text-sm text-[var(--color-kern-700)] hover:text-[var(--color-kern-800)] transition-colors"
        >
          {state.has_eigen_huis ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {state.has_eigen_huis ? 'Eigen woning niet importeren' : 'Ik heb een eigen woning'}
        </button>

        {state.has_eigen_huis && (
          <div className="space-y-4 pt-2 border-t border-dotted border-[var(--border-ed)]">
            <MoneyInput
              id="woz-value"
              label="WOZ-waarde"
              value={state.woz_value}
              onChange={(v) => update('woz_value', v)}
              hint="Vraag bij eigen woning — WOZ-waarde op peildatum."
              hintLabel="WOZ-waarde"
            />
            <MoneyInput
              id="mortgage-balance"
              label="Hypotheek-saldo"
              value={state.mortgage_balance}
              onChange={(v) => update('mortgage_balance', v)}
              hint="Eigenwoningschuld op 1 januari — vraag bij hypotheek."
              hintLabel="Hypotheek-saldo"
            />
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono uppercase tracking-[0.10em] text-[var(--ink-3)]">
                Aflossingsvorm
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'annuiteit' as RepaymentType, label: 'Annuïteit' },
                  { value: 'lineair' as RepaymentType, label: 'Lineair' },
                  { value: 'aflossingsvrij' as RepaymentType, label: 'Aflossingsvrij' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('repayment_type', opt.value)}
                    className={`min-h-[44px] px-3 py-2 text-xs font-medium border transition-colors ${
                      state.repayment_type === opt.value
                        ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                        : 'bg-transparent text-[var(--ink-3)] border-[var(--border-ed)] hover:border-[var(--ink-3)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </fieldset>

      {/* ── Sectie 3: Box 3 ─────────────────────────────────────────── */}
      <fieldset className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 space-y-4">
        <legend className="px-2 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--color-kern-700)]">
          Box 3 — bezittingen &amp; schulden
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MoneyInput
            id="bank-savings-total"
            label="Bank + spaargeld"
            value={state.bank_savings_total}
            onChange={(v) => update('bank_savings_total', v)}
            hint="Vraag 31a — totaal alle bank- en spaarrekeningen op 1 jan."
            hintLabel="Bank + spaargeld"
          />
          <MoneyInput
            id="investments-total"
            label="Beleggingen"
            value={state.investments_total}
            onChange={(v) => update('investments_total', v)}
            hint="Vraag 31b — effectendepot, fondsen, obligaties."
            hintLabel="Beleggingen"
          />
          <MoneyInput
            id="crypto-total"
            label="Cryptovaluta"
            value={state.crypto_total}
            onChange={(v) => update('crypto_total', v)}
            hint="Aparte vraag — totaal in euro op 1 jan."
            hintLabel="Crypto"
          />
          <MoneyInput
            id="second-home-value"
            label="Tweede woning"
            value={state.second_home_value}
            onChange={(v) => update('second_home_value', v)}
            hint="Vraag bij onroerend goed Box 3 — marktwaarde."
            hintLabel="Tweede woning"
          />
          <MoneyInput
            id="vorderingen-total"
            label="Vorderingen"
            value={state.vorderingen_total}
            onChange={(v) => update('vorderingen_total', v)}
            hint="Bv. lening aan familie of DGA — totaal openstaand."
            hintLabel="Vorderingen"
          />
          <MoneyInput
            id="debts-total"
            label="Schulden Box 3"
            value={state.debts_total}
            onChange={(v) => update('debts_total', v)}
            hint="Vraag bij schulden — consumptief krediet, doorlopend, etc."
            hintLabel="Box 3 schulden"
          />
        </div>
      </fieldset>

      {/* ── Action-bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border-ed)] sticky bottom-0 bg-[var(--paper)]/95 backdrop-blur-sm py-3 -mx-1 px-1">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="text-left min-h-[44px] px-3 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={onSwitchToPdf}
            className="text-left min-h-[36px] px-3 text-xs text-[var(--color-kern-700)] hover:text-[var(--color-kern-800)] underline underline-offset-4 decoration-1 transition-colors"
          >
            ← Toch PDF uploaden
          </button>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasAnyInput}
          className="min-h-[44px] inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white transition-colors bg-[var(--color-kern-600)] hover:bg-[var(--color-kern-700)] active:bg-[var(--color-kern-800)] disabled:bg-[var(--ink-4)] disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-kern-500)]"
        >
          Naar review →
        </button>
      </div>
    </div>
  )
}
