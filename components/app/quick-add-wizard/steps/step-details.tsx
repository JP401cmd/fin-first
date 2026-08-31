'use client'

import { useEffect, useId, useState } from 'react'
import {
  ASSET_DEFAULT_NAMES,
  ASSET_QUICK_ADD_FIELD3,
  ASSET_QUICK_ADD_LABELS,
  TYPICAL_RETURNS,
  type AssetField3Kind,
  type AssetType,
} from '@/lib/asset-data'
import {
  DEBT_DEFAULT_NAMES,
  DEBT_DEFAULT_REPAYMENT_TYPE,
  DEBT_MONTHLY_PAYMENT_FIELD_TYPES,
  DEBT_QUICK_ADD_FIELD3,
  DEBT_QUICK_ADD_LABELS,
  DEFAULT_TERM_YEARS_PER_TYPE,
  REPAYMENT_TYPE_LABELS,
  computeDefaultMonthlyPayment,
  type DebtField3Kind,
  type DebtType,
  type RepaymentType,
} from '@/lib/debt-data'
import {
  ASSET_NAME_SUGGESTIONS,
  DEBT_NAME_SUGGESTIONS,
} from '@/lib/quick-add/name-suggestions'
import {
  AssetQuickInputSchema,
  DebtQuickInputSchema,
  MAX_TERM_YEARS,
} from '@/lib/quick-add/validation'
import { defaultInterestRate } from '@/lib/quick-add/build-drafts'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'
import { AmountInput } from '@/components/app/amount-input'
import { parseAmountInput } from '@/lib/amount-input'
import type { AssetDraftState, DebtDraftState } from '../wizard-reducer'

/**
 * Stap 3 — mini-form met drie kernvelden (naam, bedrag, type-specifiek
 * veld), aangevuld met een handvol optionele type-specifieke velden die een
 * stille aanname corrigeerbaar maken (spaarrente, aflossing per maand,
 * en voor hypotheken aflossingsvorm/ingangsdatum/resterende looptijd).
 * Defaults uit `ASSET_DEFAULT_NAMES` / `DEBT_DEFAULT_NAMES` worden
 * automatisch ingevuld zodat de gebruiker in veel gevallen alleen het
 * bedrag hoeft te typen. Suggesties komen via een native `<datalist>` —
 * het simpelste patroon dat zowel keyboard als touch goed ondersteunt.
 *
 * De "Meer details"-link onder de save-knop is de ontsnappingsroute voor
 * de ~10% power-users die direct het volledige formulier willen zien.
 * De callback blijft optioneel zodat de initiële rollout dit kan
 * uitstellen zonder de component-API te wijzigen.
 */

type AssetProps = {
  intent: 'asset'
  draft: AssetDraftState
  onChange: (patch: Partial<AssetQuickInput>) => void
  onSubmit: () => void
  onOpenFullForm?: () => void
  isSaving?: boolean
  submitLabel?: string
}

type DebtProps = {
  intent: 'debt'
  draft: DebtDraftState
  onChange: (patch: Partial<DebtQuickInput>) => void
  onSubmit: () => void
  onOpenFullForm?: () => void
  isSaving?: boolean
  submitLabel?: string
}

export type StepDetailsProps = AssetProps | DebtProps

const PALETTE = {
  asset: {
    focusBorder: 'focus:border-[var(--color-kern-500)] focus:ring-[var(--color-kern-500)]',
    saveBg: 'bg-[var(--color-kern-600)] hover:bg-[var(--color-kern-700)] active:bg-[var(--color-kern-800)]',
  },
  debt: {
    focusBorder: 'focus:border-[var(--color-debt-500)] focus:ring-[var(--color-debt-500)]',
    saveBg: 'bg-[var(--color-debt-600)] hover:bg-[var(--color-debt-700)] active:bg-[var(--color-debt-800)]',
  },
} as const

type FieldErrors = {
  name?: string
  amount?: string
  field3?: string
  monthlyPayment?: string
  termYears?: string
}

function getCurrentYear(): number {
  return new Date().getFullYear()
}

/**
 * BEDRAGEN — de canonieke NL-lezing (bevinding H9).
 *
 * De voorganger van deze helper deed `Number(raw.replace(',', '.'))` en las
 * daarmee `45.000` als 45: de duizendtalscheiding werd een decimale punt.
 * `parseAmountInput` is de gedeelde lezing (`45.000` → 45000, `2.150,50` →
 * 2150,5) en geeft `null` bij ongeldig i.p.v. een stille 0. Hier vertalen we
 * die `null` naar `undefined`, omdat de reducer een veld daarmee "niet gezet"
 * laat.
 *
 * `positive-only`: alle drie de bedragvelden van deze stap (waarde/saldo,
 * currency-field3, aflossing per maand) zijn positief. `<AmountInput>` weigert
 * een minteken dan zichtbaar, zodat een getypte `-500` niet stilzwijgend als
 * 500 wordt opgeslagen.
 */
function parseCurrencyInput(raw: string): number | undefined {
  return parseAmountInput(raw, 'positive-only') ?? undefined
}

/**
 * PERCENTAGES EN JAARTALLEN — bewust NIET de bedrag-lezing.
 *
 * Deze velden dragen geen duizendtalscheiding, dus de NL-lezing van
 * `parseAmountInput` zou hier schade doen in plaats van goed: een rente van
 * `4.750`% zou als 4750% gelezen worden. De platte decimale lezing (`,` → `.`)
 * is voor deze velden de juiste, en negatief blijft toegestaan — de
 * percentage-validatie hieronder moet een negatieve rente kunnen zién om hem
 * te kunnen afwijzen.
 */
function parseDecimalInput(raw: string): number | undefined {
  if (raw.trim().length === 0) return undefined
  const normalised = raw.replace(',', '.')
  const parsed = Number(normalised)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function StepDetails(props: StepDetailsProps) {
  const isAsset = props.intent === 'asset'
  const palette = PALETTE[props.intent]
  const nameListId = useId()

  // ── Meta per intent ─────────────────────────────────────────────
  const typeKey = isAsset
    ? (props.draft as AssetDraftState).asset_type
    : (props.draft as DebtDraftState).debt_type

  const defaultName = isAsset
    ? ASSET_DEFAULT_NAMES[typeKey as AssetType]
    : DEBT_DEFAULT_NAMES[typeKey as DebtType]

  const typeLabel = isAsset
    ? ASSET_QUICK_ADD_LABELS[typeKey as AssetType]
    : DEBT_QUICK_ADD_LABELS[typeKey as DebtType]

  const field3Config: AssetField3Kind | DebtField3Kind = isAsset
    ? ASSET_QUICK_ADD_FIELD3[typeKey as AssetType]
    : DEBT_QUICK_ADD_FIELD3[typeKey as DebtType]

  const suggestions = isAsset
    ? ASSET_NAME_SUGGESTIONS[typeKey as AssetType]
    : DEBT_NAME_SUGGESTIONS[typeKey as DebtType]

  const amountLabel = isAsset ? 'Huidige waarde' : 'Huidig saldo'

  // ── Lokale state voor currency/number string-inputs ─────────────
  //
  // We houden de rauwe invoer als string bij zodat gebruikers "1200.5"
  // kunnen typen zonder dat de cursor wegspringt. De genormaliseerde
  // `number` propageert via `onChange(patch)` naar de reducer.
  const draftName =
    typeof props.draft.name === 'string' ? props.draft.name : defaultName ?? ''

  const draftAmount =
    isAsset
      ? (props.draft as AssetDraftState).current_value
      : (props.draft as DebtDraftState).current_balance

  const [amountRaw, setAmountRaw] = useState<string>(
    typeof draftAmount === 'number' ? String(draftAmount) : '',
  )

  // Field3 init — sommige types hebben een defaultValue (bv. credit_card
  // → 14% rente), die prefillen we op de eerste render via een lazy init.
  const [field3Raw, setField3Raw] = useState<string>(() => {
    if (!field3Config) return ''
    if (typeof props.draft.field3 === 'string') return props.draft.field3
    if (typeof props.draft.field3 === 'number') return String(props.draft.field3)
    if (field3Config.kind === 'year') {
      return String(
        (field3Config as Extract<DebtField3Kind, { kind: 'year' }>).defaultValue ??
          getCurrentYear(),
      )
    }
    if ('defaultValue' in field3Config && typeof field3Config.defaultValue === 'number') {
      return String(field3Config.defaultValue)
    }
    return ''
  })

  // First-render: als er nog geen naam is, prefill met de default.
  // `useEffect` i.p.v. `useMemo` omdat we hier een side effect triggeren
  // (reducer-update via props). De lege dep-array is bedoeld: we willen
  // alleen éénmalig prefillen bij de eerste mount per type-keuze.
  useEffect(() => {
    if (
      !props.draft.name &&
      typeof defaultName === 'string' &&
      defaultName.length > 0
    ) {
      if (isAsset) {
        ;(props as AssetProps).onChange({ name: defaultName })
      } else {
        ;(props as DebtProps).onChange({ name: defaultName })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Error state ─────────────────────────────────────────────────
  //
  // We bewaren geen volledige error-map in state — errors worden altijd
  // per render opnieuw afgeleid uit de actuele draft via `validateAll()`.
  // `touched` bepaalt alleen of we de error onder het veld mogen tónen
  // (zodat de user niet meteen rood ziet bij de eerste keystroke).
  const [touched, setTouched] = useState<{ [K in keyof FieldErrors]?: boolean }>({})

  function validateAll(): FieldErrors {
    const next: FieldErrors = {}
    const nameValue = (draftName ?? '').trim()
    const amountValue = typeof draftAmount === 'number' ? draftAmount : NaN

    const schema = isAsset ? AssetQuickInputSchema : DebtQuickInputSchema

    // Zod valideren met de lookup zoals die in de reducer zit — maar we
    // willen per-veld errors en geen top-level. Daarom valideren we ook
    // handmatig en gebruiken Zod alleen voor het amount-veld.
    if (nameValue.length === 0) next.name = 'Naam is verplicht'

    if (!Number.isFinite(amountValue)) {
      next.amount = 'Voer een geldig bedrag in'
    } else {
      const probe = isAsset
        ? { asset_type: typeKey, name: 'x', current_value: amountValue }
        : { debt_type: typeKey, name: 'x', current_balance: amountValue }
      const result = schema.safeParse(probe)
      if (!result.success) {
        const amountIssue = result.error.issues.find((i) =>
          i.path.includes(isAsset ? 'current_value' : 'current_balance'),
        )
        if (amountIssue) next.amount = amountIssue.message
      }
    }

    if (field3Config?.kind === 'year') {
      const year = parseDecimalInput(field3Raw)
      if (year != null && (year < 1900 || year > 2100)) {
        next.field3 = 'Vul een geldig jaartal in'
      }
    }
    if (field3Config?.kind === 'percentage') {
      const pct = parseDecimalInput(field3Raw)
      if (pct != null && pct < 0) next.field3 = 'Percentage mag niet negatief zijn'
    }
    // Vangnet, geen hoofdroute: het currency-field3 loopt via `<AmountInput>`
    // met `positive-only`, dus een minteken bereikt de draft niet meer (het
    // veld meldt zelf dat het geweigerd is). De check blijft staan voor een
    // waarde die langs een andere weg binnenkomt — bv. een voor-ingevulde draft.
    if (field3Config?.kind === 'currency') {
      const value = parseCurrencyInput(field3Raw)
      if (value != null && value < 0) next.field3 = 'Bedrag mag niet negatief zijn'
    }

    // Aflossing per maand (looptijd-leningen): vangnet, geen hoofdroute. Het
    // veld loopt sinds H9 door `<AmountInput>` met `positive-only`, dat een
    // minteken al zichtbaar weigert vóór het de draft raakt. Deze check vangt
    // wat langs een andere weg binnenkomt (bv. een voor-ingevulde draft) —
    // anders zou dat pas op de zod-validatie bij de (eind)save stranden, met
    // een generieke fout i.p.v. een veldfout.
    if (!isAsset && DEBT_MONTHLY_PAYMENT_FIELD_TYPES.includes(typeKey as DebtType)) {
      const mp = (props.draft as DebtDraftState).monthly_payment
      if (typeof mp === 'number' && mp < 0) {
        next.monthlyPayment = 'Bedrag mag niet negatief zijn'
      }
    }

    // Resterende looptijd (hypotheek): zelfde reden als hierboven — het
    // formulier is noValidate, dus min/max op de input blokkeert niets.
    if (!isAsset && typeKey === 'mortgage') {
      const ty = (props.draft as DebtDraftState).term_years
      if (typeof ty === 'number' && (ty < 1 || ty > MAX_TERM_YEARS)) {
        next.termYears = `Vul een looptijd tussen 1 en ${MAX_TERM_YEARS} jaar in`
      }
    }

    return next
  }

  const currentErrors = validateAll()
  const canSubmit = Object.keys(currentErrors).length === 0 && !props.isSaving

  // ── Handlers ────────────────────────────────────────────────────

  function handleNameChange(raw: string) {
    if (isAsset) {
      ;(props as AssetProps).onChange({ name: raw })
    } else {
      ;(props as DebtProps).onChange({ name: raw })
    }
    // `currentErrors` wordt per render opnieuw berekend — de error verdwijnt
    // vanzelf zodra de input valid wordt. Geen expliciete setter nodig.
  }

  function handleAmountChange(raw: string) {
    setAmountRaw(raw)
    const parsed = parseCurrencyInput(raw)
    if (isAsset) {
      ;(props as AssetProps).onChange({ current_value: parsed as number })
    } else {
      ;(props as DebtProps).onChange({ current_balance: parsed as number })
    }
  }

  function handleField3Change(raw: string) {
    setField3Raw(raw)
    if (!field3Config) return
    if (field3Config.kind === 'text' || field3Config.kind === 'date') {
      if (isAsset) {
        ;(props as AssetProps).onChange({ field3: raw })
      } else {
        ;(props as DebtProps).onChange({ field3: raw })
      }
      return
    }
    const parsed =
      field3Config.kind === 'currency' ? parseCurrencyInput(raw) : parseDecimalInput(raw)
    if (isAsset) {
      ;(props as AssetProps).onChange({ field3: parsed ?? null })
    } else {
      ;(props as DebtProps).onChange({ field3: parsed ?? null })
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({
      name: true,
      amount: true,
      field3: true,
      monthlyPayment: true,
      termYears: true,
    })
    const nextErrors = validateAll()
    if (Object.keys(nextErrors).length === 0) {
      props.onSubmit()
    }
  }

  const showNameError = touched.name && currentErrors.name
  const showAmountError = touched.amount && currentErrors.amount
  const showField3Error = touched.field3 && currentErrors.field3
  const showMonthlyPaymentError = touched.monthlyPayment && currentErrors.monthlyPayment
  const showTermYearsError = touched.termYears && currentErrors.termYears

  const submitLabel = props.submitLabel ?? 'Toevoegen'

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* Naam-veld met native datalist voor suggesties. */}
      <div>
        <label
          htmlFor={`${nameListId}-name`}
          className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
        >
          Naam
        </label>
        <input
          id={`${nameListId}-name`}
          type="text"
          autoComplete="off"
          list={suggestions && suggestions.length > 0 ? `${nameListId}-suggestions` : undefined}
          value={draftName}
          placeholder={defaultName ?? `Bijv. ${typeLabel.toLowerCase()}`}
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          aria-invalid={Boolean(showNameError)}
          aria-describedby={showNameError ? `${nameListId}-name-error` : undefined}
          className={`w-full border bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none transition-colors ${
            showNameError
              ? 'border-[var(--negative)] focus:border-[var(--negative)] focus:ring-1 focus:ring-[var(--negative)]'
              : `border-[var(--border-ed)] focus:ring-1 ${palette.focusBorder}`
          }`}
        />
        {suggestions && suggestions.length > 0 && (
          <datalist id={`${nameListId}-suggestions`}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        {showNameError && (
          <p
            id={`${nameListId}-name-error`}
            role="alert"
            className="mt-1 text-[11px] text-[var(--negative)]"
          >
            {currentErrors.name}
          </p>
        )}
      </div>

      {/* Bedrag — altijd currency met EUR prefix. */}
      <div>
        <label
          htmlFor={`${nameListId}-amount`}
          className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
        >
          {amountLabel}
        </label>
        {/* `<AmountInput>` i.p.v. `type="number"` (H9): een number-input laat de
            browser ongeldige invoer stilzwijgend weggooien vóórdat React hem
            ziet, dus het veld kon nooit iets melden. Deze component weigert
            dezelfde tekens ZICHTBAAR en rendert zijn eigen meldingsregel —
            vandaar dat de losse error-`<p>` hieronder weg is: één veldfout, één
            melding (L4). Het euroteken gaat via `prefix`, zodat de melding
            buiten de box valt waarin dat teken gepositioneerd staat. */}
        <AmountInput
          id={`${nameListId}-amount`}
          prefix="€"
          sign="positive-only"
          value={amountRaw}
          onChange={handleAmountChange}
          onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
          error={showAmountError ? currentErrors.amount ?? null : null}
          className={`w-full border bg-[var(--paper)] py-2.5 pl-8 pr-3 font-mono text-base tabular-nums text-[var(--ink)] outline-none transition-colors ${
            showAmountError
              ? 'border-[var(--negative)] focus:border-[var(--negative)] focus:ring-1 focus:ring-[var(--negative)]'
              : `border-[var(--border-ed)] focus:ring-1 ${palette.focusBorder}`
          }`}
        />
      </div>

      {/* Optioneel veld 3 — type-afhankelijk. */}
      {field3Config && (
        <Field3Input
          id={`${nameListId}-field3`}
          config={field3Config}
          value={field3Raw}
          onChange={handleField3Change}
          onBlur={() => setTouched((t) => ({ ...t, field3: true }))}
          error={showField3Error ? currentErrors.field3 : undefined}
          palette={palette}
        />
      )}

      {/* Spaarrekening-only: rente (%). Staat NAAST het bank/instelling-veld
          (field3), zodat de gebruiker bij het toevoegen zowel de bank als de
          werkelijke spaarrente kwijt kan i.p.v. de stille 2,5%-default. Leeg
          laten ⇒ buildAssetDraft valt terug op TYPICAL_RETURNS.savings. */}
      {isAsset && typeKey === 'savings' && (
        <SavingsRenteField
          idBase={nameListId}
          value={(props.draft as AssetDraftState).expected_return ?? undefined}
          onChange={(props as AssetProps).onChange}
          palette={palette}
        />
      )}

      {/* Hypotheek-only: aflossingsvorm + ingangsdatum + resterende looptijd.
          Vult debts.repayment_type / debts.start_date en (via term_years)
          debts.end_date, zodat de eerste-invoer meteen een correcte
          aflossingsprognose oplevert i.p.v. de annuïteit/vandaag/30-jaar-
          default. */}
      {!isAsset && typeKey === 'mortgage' && (
        <MortgageExtraFields
          idBase={nameListId}
          repaymentType={(props.draft as DebtDraftState).repayment_type ?? undefined}
          startDate={(props.draft as DebtDraftState).start_date ?? undefined}
          termYears={(props.draft as DebtDraftState).term_years ?? undefined}
          onChange={(props as DebtProps).onChange}
          onTermBlur={() => setTouched((t) => ({ ...t, termYears: true }))}
          termError={showTermYearsError ? currentErrors.termYears : undefined}
          palette={palette}
        />
      )}

      {/* Looptijd-leningen (autolening, persoonlijke lening, studielening,
          familielening, DGA-schuld): optionele werkelijke aflossing per maand.
          Vult debts.monthly_payment; leeg ⇒ buildDebtDraft berekent de default
          uit saldo/rente/looptijd (computeDefaultMonthlyPayment). */}
      {!isAsset && DEBT_MONTHLY_PAYMENT_FIELD_TYPES.includes(typeKey as DebtType) && (
        <DebtAflossingField
          idBase={nameListId}
          debtType={typeKey as DebtType}
          balance={typeof draftAmount === 'number' ? draftAmount : null}
          rateRaw={field3Raw}
          onChange={(props as DebtProps).onChange}
          onBlur={() => setTouched((t) => ({ ...t, monthlyPayment: true }))}
          error={showMonthlyPaymentError ? currentErrors.monthlyPayment : undefined}
          palette={palette}
        />
      )}

      {/* Hint */}
      <p className="text-center text-[11px] text-[var(--ink-4)] leading-relaxed">
        Alleen het minimum — je kunt de rest later aanvullen.
      </p>

      {/* Save-knop + escape-hatch naar full form. */}
      <div className="space-y-2 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className={`inline-flex min-h-[44px] w-full items-center justify-center px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${palette.saveBg} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
        >
          {props.isSaving ? 'Opslaan…' : submitLabel}
        </button>

        {props.onOpenFullForm && (
          <button
            type="button"
            onClick={props.onOpenFullForm}
            className="block w-full text-center text-xs text-[var(--ink-3)] underline-offset-4 hover:text-[var(--ink)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            Meer velden invullen? Open het volledige formulier →
          </button>
        )}
      </div>
    </form>
  )
}

// ── Veld-3 rendering ──────────────────────────────────────────────

interface Field3InputProps {
  id: string
  config: AssetField3Kind | DebtField3Kind
  value: string
  onChange: (raw: string) => void
  onBlur: () => void
  error: string | undefined
  palette: (typeof PALETTE)['asset'] | (typeof PALETTE)['debt']
}

function Field3Input({
  id,
  config,
  value,
  onChange,
  onBlur,
  error,
  palette,
}: Field3InputProps) {
  if (!config) return null

  const borderClass = error
    ? 'border-[var(--negative)] focus:border-[var(--negative)] focus:ring-1 focus:ring-[var(--negative)]'
    : `border-[var(--border-ed)] focus:ring-1 ${palette.focusBorder}`

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
      >
        {config.label}
      </label>

      {config.kind === 'text' && (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={
            'placeholder' in config && config.placeholder ? config.placeholder : ''
          }
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`w-full border bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none transition-colors ${borderClass}`}
        />
      )}

      {config.kind === 'currency' && (
        /* Zelfde H9-reden als het hoofdbedrag: een currency-veld is een
           bedragveld en gaat dus door `<AmountInput>`. Die rendert zijn eigen
           meldingsregel, dus de gedeelde error-`<p>` onderaan deze component
           slaat het currency-geval over — en plaatst het euroteken zelf, buiten
           de meldingsregel om. */
        <AmountInput
          id={id}
          prefix="€"
          sign="positive-only"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          error={error ?? null}
          className={`w-full border bg-[var(--paper)] py-2.5 pl-8 pr-3 font-mono text-base tabular-nums text-[var(--ink)] outline-none transition-colors ${borderClass}`}
        />
      )}

      {config.kind === 'percentage' && (
        <div className="relative">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step={0.1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className={`w-full border bg-[var(--paper)] py-2.5 pl-3 pr-8 font-mono text-base tabular-nums text-[var(--ink)] outline-none transition-colors ${borderClass}`}
          />
          <span
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]"
            aria-hidden="true"
          >
            %
          </span>
        </div>
      )}

      {config.kind === 'date' && (
        <input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`w-full border bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none transition-colors ${borderClass}`}
        />
      )}

      {config.kind === 'year' && (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          step={1}
          min={1900}
          max={2100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`w-full border bg-[var(--paper)] px-3 py-2.5 font-mono text-base tabular-nums text-[var(--ink)] outline-none transition-colors ${borderClass}`}
        />
      )}

      {/* Het currency-geval meldt zelf (via `<AmountInput>`); die hier nog eens
          herhalen zou twee meldingen voor één veldfout geven (L4). */}
      {error && config.kind !== 'currency' && (
        <p role="alert" className="mt-1 text-[11px] text-[var(--negative)]">
          {error}
        </p>
      )}
    </div>
  )
}

// ── Spaarrekening-extra: rente ────────────────────────────────────
//
// Eén extra veld dat alleen bij `asset_type='savings'` verschijnt: de
// spaarrente (%). Schrijft rechtstreeks naar het `AssetQuickInput.expected_return`-
// veld. Blijft leeg ⇒ `buildAssetDraft` valt terug op TYPICAL_RETURNS.savings
// (2,5%). We tonen die default expliciet als voorinvulling zodat de gebruiker
// ziet wat er wordt opgeslagen als hij niets wijzigt. Negatieve rente is
// toegestaan (historisch reëel op grote saldi) — geen client-side blokkade.

interface SavingsRenteFieldProps {
  idBase: string
  value: number | undefined
  onChange: (patch: Partial<AssetQuickInput>) => void
  palette: (typeof PALETTE)['asset'] | (typeof PALETTE)['debt']
}

function SavingsRenteField({ idBase, value, onChange, palette }: SavingsRenteFieldProps) {
  const renteId = `${idBase}-savings-rente`
  // Lokale raw-string zodat "2." / "1,5" tijdens typen niet wegspringt. Init op
  // de draft-waarde of de zichtbare default (TYPICAL_RETURNS.savings).
  const [raw, setRaw] = useState<string>(() =>
    typeof value === 'number' ? String(value) : String(TYPICAL_RETURNS.savings),
  )

  return (
    <div>
      <label
        htmlFor={renteId}
        className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
      >
        Rente (%)
      </label>
      <div className="relative">
        <input
          id={renteId}
          type="number"
          inputMode="decimal"
          step={0.1}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            onChange({ expected_return: parseDecimalInput(e.target.value) ?? null })
          }}
          className={`w-full border bg-[var(--paper)] py-2.5 pl-3 pr-8 font-mono text-base tabular-nums text-[var(--ink)] outline-none transition-colors focus:ring-1 border-[var(--border-ed)] ${palette.focusBorder}`}
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]"
          aria-hidden="true"
        >
          %
        </span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--ink-4)] leading-relaxed">
        De werkelijke spaarrente van je bank. Laat staan als je het niet weet.
      </p>
    </div>
  )
}

// ── Looptijd-lening-extra: aflossing per maand ────────────────────
//
// Eén optioneel veld dat alleen verschijnt bij de schuldtypes in
// `DEBT_MONTHLY_PAYMENT_FIELD_TYPES`. Schrijft rechtstreeks naar
// `DebtQuickInput.monthly_payment`. Blijft leeg ⇒ `buildDebtDraft` berekent
// de default uit saldo/rente/looptijd via `computeDefaultMonthlyPayment` —
// die schatting tonen we als hint zodat de gebruiker ziet wat er wordt
// opgeslagen als hij niets invult (zelfde patroon als SavingsRenteField).

interface DebtAflossingFieldProps {
  idBase: string
  debtType: DebtType
  /** Huidig saldo uit het bedrag-veld — voor de default-schatting in de hint. */
  balance: number | null
  /** Rauwe rente-invoer (field3) — voor dezelfde schatting. */
  rateRaw: string
  onChange: (patch: Partial<DebtQuickInput>) => void
  onBlur: () => void
  error: string | undefined
  palette: (typeof PALETTE)['asset'] | (typeof PALETTE)['debt']
}

function DebtAflossingField({
  idBase,
  debtType,
  balance,
  rateRaw,
  onChange,
  onBlur,
  error,
  palette,
}: DebtAflossingFieldProps) {
  const aflossingId = `${idBase}-aflossing`
  const [raw, setRaw] = useState<string>('')

  // Dezelfde default die buildDebtDraft zou berekenen wanneer het veld leeg
  // blijft — geconsumeerd uit de canonieke helpers, niet herberekend. Een
  // geleegd rente-veld valt op dezelfde per-type rente-default terug als de
  // draft (defaultInterestRate — bv. dga_schuld 2,5%), anders zou de hint
  // een ander bedrag beloven dan wat er wordt opgeslagen.
  const rate = parseDecimalInput(rateRaw)
  const defaultEstimate =
    balance != null && balance > 0
      ? computeDefaultMonthlyPayment(
          balance,
          rate ?? defaultInterestRate(debtType),
          DEFAULT_TERM_YEARS_PER_TYPE[debtType],
          DEBT_DEFAULT_REPAYMENT_TYPE[debtType],
        )
      : null

  const borderClass = error
    ? 'border-[var(--negative)] focus:border-[var(--negative)] focus:ring-1 focus:ring-[var(--negative)]'
    : `border-[var(--border-ed)] focus:ring-1 ${palette.focusBorder}`

  return (
    <div>
      <label
        htmlFor={aflossingId}
        className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
      >
        Aflossing per maand{' '}
        <span className="font-normal text-[var(--ink-4)]">(optioneel)</span>
      </label>
      {/* Ook dit is een bedragveld en gaat dus door `<AmountInput>` (H9): als
          `type="number"` slikte het `1.250` in als 1,25 en ongeldige tekens
          zonder een woord. De component levert de meldingsregel zelf, dus geen
          losse error-`<p>` meer eronder (L4), en plaatst het euroteken zodat
          dat niet meezakt wanneer die melding verschijnt. */}
      <AmountInput
        id={aflossingId}
        prefix="€"
        sign="positive-only"
        value={raw}
        placeholder={defaultEstimate != null && defaultEstimate > 0 ? String(Math.round(defaultEstimate)) : undefined}
        onChange={(next) => {
          setRaw(next)
          onChange({ monthly_payment: parseCurrencyInput(next) ?? null })
        }}
        onBlur={onBlur}
        error={error ?? null}
        className={`w-full border bg-[var(--paper)] py-2.5 pl-8 pr-3 font-mono text-base tabular-nums text-[var(--ink)] outline-none transition-colors ${borderClass}`}
      />
      <p className="mt-1 text-[11px] text-[var(--ink-4)] leading-relaxed">
        Wat je nu maandelijks aflost (zie je leningcontract of afschrijving).
        {defaultEstimate != null && defaultEstimate > 0
          ? ` Leeg laten = schatting van €${Math.round(defaultEstimate)} per maand.`
          : ' Leeg laten mag — dan schatten we het voor je.'}
      </p>
    </div>
  )
}

// ── Hypotheek-extra's ─────────────────────────────────────────────
//
// Drie extra velden die alleen bij `debt_type='mortgage'` verschijnen:
// aflossingsvorm (select), ingangsdatum (date) en resterende looptijd
// (number). Ze schrijven rechtstreeks naar de DebtQuickInput-velden
// `repayment_type` / `start_date` / `term_years`. Blijft leeg ⇒
// `buildDebtDraft` valt terug op de type-defaults, dus geen van drieën is
// verplicht — ze maken alleen de stille annuïteit/vandaag/30-jaar-aannames
// corrigeerbaar op het moment dat de gebruiker ze kent.

/** Volgorde van de aflossingsvormen in de select — meest gekozen eerst. */
const MORTGAGE_REPAYMENT_ORDER: readonly RepaymentType[] = [
  'annuiteit',
  'lineair',
  'aflossingsvrij',
]

interface MortgageExtraFieldsProps {
  idBase: string
  repaymentType: RepaymentType | undefined
  startDate: string | undefined
  termYears: number | undefined
  onChange: (patch: Partial<DebtQuickInput>) => void
  onTermBlur: () => void
  termError?: string
  palette: (typeof PALETTE)['asset'] | (typeof PALETTE)['debt']
}

function MortgageExtraFields({
  idBase,
  repaymentType,
  startDate,
  termYears,
  onChange,
  onTermBlur,
  termError,
  palette,
}: MortgageExtraFieldsProps) {
  const repaymentId = `${idBase}-repayment`
  const startDateId = `${idBase}-startdate`
  const termId = `${idBase}-termyears`
  // Rode rand bij een zichtbare fout; anders de neutrale editorial-rand.
  const termBorderClass = termError
    ? 'border-[var(--negative)] focus:ring-1 focus:ring-[var(--negative)]'
    : `border-[var(--border-ed)] focus:ring-1 ${palette.focusBorder}`
  // Toon de aanname die anders stilzwijgend zou gelden, zodat de gebruiker
  // ziet wát hij corrigeert als hij het veld leeg laat.
  const defaultTermYears = DEFAULT_TERM_YEARS_PER_TYPE.mortgage
  // Toon de default expliciet zodat de user ziet wat er wordt opgeslagen als
  // hij niets wijzigt (draft blijft leeg → buildDebtDraft vult dezelfde default).
  const selectValue = repaymentType ?? DEBT_DEFAULT_REPAYMENT_TYPE.mortgage ?? 'annuiteit'

  return (
    <>
      <div>
        <label
          htmlFor={repaymentId}
          className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
        >
          Aflossingsvorm
        </label>
        <select
          id={repaymentId}
          value={selectValue}
          onChange={(e) =>
            onChange({ repayment_type: e.target.value as RepaymentType })
          }
          className={`w-full border bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none transition-colors focus:ring-1 border-[var(--border-ed)] ${palette.focusBorder}`}
        >
          {MORTGAGE_REPAYMENT_ORDER.map((rt) => (
            <option key={rt} value={rt}>
              {REPAYMENT_TYPE_LABELS[rt]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={startDateId}
          className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
        >
          Ingangsdatum
        </label>
        <input
          id={startDateId}
          type="date"
          value={startDate ?? ''}
          onChange={(e) => onChange({ start_date: e.target.value || null })}
          className={`w-full border bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none transition-colors focus:ring-1 border-[var(--border-ed)] ${palette.focusBorder}`}
        />
        <p className="mt-1 text-[11px] text-[var(--ink-4)] leading-relaxed">
          Loopt de hypotheek al? Vul de echte startdatum in voor een kloppende
          aflossing.
        </p>
      </div>

      <div>
        <label
          htmlFor={termId}
          className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]"
        >
          Resterende looptijd{' '}
          <span className="font-normal text-[var(--ink-4)]">(optioneel)</span>
        </label>
        <div className="relative">
          <input
            id={termId}
            type="number"
            inputMode="numeric"
            step="1"
            min={1}
            max={MAX_TERM_YEARS}
            value={termYears ?? ''}
            onChange={(e) =>
              onChange({ term_years: parseDecimalInput(e.target.value) ?? null })
            }
            onBlur={onTermBlur}
            aria-invalid={termError ? true : undefined}
            aria-describedby={termError ? `${termId}-error` : undefined}
            placeholder={defaultTermYears != null ? String(defaultTermYears) : ''}
            className={`w-full border bg-[var(--paper)] py-2.5 pl-3 pr-10 font-mono text-base tabular-nums text-[var(--ink)] outline-none transition-colors ${termBorderClass}`}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]"
          >
            jaar
          </span>
        </div>
        {termError && (
          <p
            id={`${termId}-error`}
            role="alert"
            className="mt-1 text-[11px] text-[var(--negative)]"
          >
            {termError}
          </p>
        )}
        <p className="mt-1 text-[11px] text-[var(--ink-4)] leading-relaxed">
          Hoeveel jaar loopt de hypotheek nog? Bepaalt de getoonde looptijd en
          de geschatte maandlast.
          {defaultTermYears != null
            ? ` Leeg laten = ${defaultTermYears} jaar vanaf de ingangsdatum.`
            : ''}
        </p>
      </div>
    </>
  )
}
