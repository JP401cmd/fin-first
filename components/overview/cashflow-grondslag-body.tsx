'use client'

/**
 * De GEDEELDE BODY van "Inkomen, uitgaven en spaarquote" (W-009, ADR 0103).
 *
 * ÉÉN BODY, TWEE HOSTS (plan-review-conventie). Deze module draagt de volledige
 * inhoud van het grondslag-venster: de drie blokken (inkomen · uitgaven ·
 * spaarquote), de keuze per kant, de kassabonnen en de schrijfweg. Twee hosts
 * renderen 'm:
 *
 *  1. `components/overview/cashflow-instellingen-blok.tsx` — het instellingenblok
 *     onderaan /overzicht/budget/transacties, in een `ShellOverlay kind="pane"`;
 *  2. `components/future/plan-review/grondslag-editor.tsx` — stap "Waar je cijfers
 *     op rusten" in de voorkeuren-wizard op /toekomst.
 *
 * Het blok als gehéél in de wizard hangen kan niet: dat zou een pane in een pane
 * geven (de wizard is zelf een `ShellOverlay kind="pane"`). Vandaar de splitsing
 * host (venster, figuren-strook) / body (inhoud).
 *
 * GRONDSLAG WORDT GECONSUMEERD, NIET BESLIST. De beslissing woont in
 * `resolveAmountWithBasis` (lib/effective-financials.ts) — dezelfde functie die de
 * loader gebruikt. Deze module voedt die resolver met de bundelwaarden plus de
 * lokale (optimistische) budgetselectie en toont welke grondslag daaruit komt; die
 * zichtbaarheid is de harde voorwaarde uit ADR 0103 waaronder een grondslag mág
 * schuiven zonder handeling van de gebruiker.
 *
 * DE SPAARQUOTE HEEFT GEEN EIGEN BRON. Hij volgt uit de twee grondslagen hierboven;
 * er is bewust géén derde bronveld (dat zou hetzelfde begrip dubbel opschrijven).
 */

import { useState, useMemo, useCallback, useEffect, useRef, useId } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { resolveAmountWithBasis } from '@/lib/effective-financials'
import {
  CASHFLOW_BASIS_PREFS_VERSION,
  type CashflowBasisPrefs,
} from '@/lib/cashflow-settings'
import {
  calculateFreedomTime,
  formatCurrency,
  formatFreedomRateFootnote,
  formatFreedomTimeString,
} from '@/lib/format'
import {
  BASIS_LABEL,
  extrapolationNote,
  isUnknownBasis,
  savingsRateBasisLabel,
  summarizeBasisWindow,
} from '@/lib/budget-basis'
import type {
  BasisSource,
  BudgetBasisEntry,
  BudgetBasisResult,
  ResolvedBasis,
} from '@/lib/budget-basis'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

export type CashflowBlockId = 'income' | 'expenses' | 'savings'
type Side = 'income' | 'expenses'
type BasisOptionId = 'budget' | 'transaction' | 'manual'

/** Kopniveau van de drie blokken — de host bepaalt het (koppenconventie, ADR 0110). */
export type CashflowKopNiveau = 'h2' | 'h3' | 'h4' | 'h5'

/**
 * Welke keuze-optie hoort bij een uitkomst-grondslag. `'profile'`, `'estimate'`
 * en `'unknown'` vallen samen met "Eigen bedrag": het is dezelfde profielkolom,
 * alleen niet (of nog niet) door de gebruiker zelf gezet — dat verschil draagt
 * het label op de kaart, niet de radio. Voor `'unknown'` is dat bovendien
 * precies het veld waar het bedrag ingevuld hoort te worden (ADR 0131).
 */
function optionForBasis(basis: ResolvedBasis): BasisOptionId {
  switch (basis) {
    case 'budget':
    case 'transaction':
    case 'manual':
      return basis
    case 'profile':
    case 'estimate':
    case 'unknown':
      return 'manual'
  }
}

const SAVE_ERROR_TEXT =
  'Niet gelukt om dit op te slaan. Je keuze staat weer zoals hij was — probeer het zo nog eens.'

/**
 * De grondslagregel onder een cijfer, met het afkap-voorbehoud erin verwerkt.
 *
 * `truncationSuspected` betekent dat we mogelijk niet alle transacties konden
 * meetellen; het bedrag kán dan te laag zijn. Dat voorbehoud hoort te staan waar
 * het cijfer staat — niet alleen in het detailvenster, dat een gebruiker nooit
 * hoeft te openen. Alleen relevant bij de budgetgrondslag: de andere drie meten
 * niet per budget en kennen deze afkapping niet.
 */
export function basisSubLabel(basis: ResolvedBasis, truncationSuspected: boolean): string {
  const label = BASIS_LABEL[basis]
  return basis === 'budget' && truncationSuspected ? `${label} · mogelijk onvolledig` : label
}

/** Wat `useCashflowGrondslag` teruggeeft — de host leest eruit wat hij toont. */
export interface CashflowGrondslagControl {
  data: CashflowSettingsData
  syncing: boolean
  saveError: Side | null
  radioName: string

  incomeBasis: ResolvedBasis
  expensesBasis: ResolvedBasis
  /**
   * Welke radio aangevinkt staat. `'estimate'` kan hier uitkomen wanneer de app het
   * bedrag zelf schatte (ADR 0131): dat is géén kiesbare optie, dus dan staat er bewust
   * geen radio aan — precies zoals vóór de body-extractie.
   */
  incomeOption: BasisOptionId | 'estimate'
  expensesOption: BasisOptionId | 'estimate'
  incomeUnknown: boolean
  expensesUnknown: boolean

  /** Geresolveerd op de LOKALE keuze — zonder wijziging gelijk aan de bundel. */
  annualIncome: number
  monthlyIncome: number
  monthlyExpenses: number

  savingsRate: number
  transactionSavingsRate: number
  savingsBasisLabel: string
  savingsSub: string
  showTxReceipt: boolean
  showDerivedReceipt: boolean
  showEstimateNote: boolean

  dailyRate: number
  showRate: boolean
  rateFootnote: string | null

  excludedIncome: Set<string>
  excludedExpense: Set<string>
  budgetIncomeAnnual: number
  budgetExpensesAnnual: number
  sixMonth: { months: CashflowSettingsData['monthlyBreakdown']; income: number; expenses: number; saved: number }
  twelveMonthIncome: number
  transactieWindowNote: string | null

  manualIncomeDraft: string
  setManualIncomeDraft: (v: string) => void
  manualExpensesDraft: string
  setManualExpensesDraft: (v: string) => void

  chooseSource: (side: Side, source: BasisSource) => void
  toggleEntry: (side: Side, id: string) => void
  commitManual: (side: Side, raw: string) => void

  refs: {
    income: React.RefObject<HTMLElement | null>
    expenses: React.RefObject<HTMLElement | null>
    savings: React.RefObject<HTMLElement | null>
  }
  /** Ruimt de mislukt-melding op (de host doet dat bij sluiten). */
  resetSaveError: () => void
}

export interface CashflowGrondslagOpties {
  /**
   * Na een GESLAAGDE schrijfactie via `PUT /api/parameters`. De wizard zet hier zijn
   * markering; het instellingenblok heeft 'm niet nodig.
   */
  onSaved?: () => void
  /**
   * Vernieuwt de omliggende server-pagina na opslaan. AAN op /overzicht/budget (de
   * pagina eromheen toont dezelfde cijfers), UIT in de wizard: een RSC-refresh van
   * /toekomst tijdens een open pane zou de hele review onder de gebruiker vandaan
   * herladen.
   */
  refreshRouter?: boolean
}

/**
 * Staat + schrijfweg van het grondslag-venster. Beide hosts gebruiken deze hook, zodat
 * de keuze op beide plekken exact hetzelfde doet — inclusief de optimistische
 * terugdraai bij een mislukte PUT.
 */
export function useCashflowGrondslag(
  initialData: CashflowSettingsData,
  opties: CashflowGrondslagOpties = {},
): CashflowGrondslagControl {
  const { onSaved, refreshRouter = true } = opties
  const router = useRouter()
  const radioName = useId()
  const { masked } = useMaskedAmounts()

  // De bundel komt via een lazy fetch binnen (cashflow-instellingen-lazy). Na elke
  // wijziging halen we 'm opnieuw op, zodat de spaarquote en de server-resolutie
  // van de grondslag weer kloppen zonder dat de gebruiker moet verversen.
  const [data, setData] = useState(initialData)
  useEffect(() => { setData(initialData) }, [initialData])

  const [syncing, setSyncing] = useState(false)
  /** Kant waarvan de laatste schrijfactie mislukte — draagt de rustige melding. */
  const [saveError, setSaveError] = useState<Side | null>(null)

  // Lokale bron-keuze + uitsluitlijsten. Bewust ALLEEN geseed uit de eerste
  // bundel: na een persist bevestigt de server dezelfde waarden, dus opnieuw
  // seeden uit een verse fetch zou een net-gezette keuze kunnen terugdraaien
  // wanneer de fetch de schrijfactie inhaalt.
  const [incomeSource, setIncomeSource] = useState<BasisSource>(initialData.incomeSource)
  const [expensesSource, setExpensesSource] = useState<BasisSource>(initialData.expensesSource)
  const [excludedIncome, setExcludedIncome] = useState<Set<string>>(
    () => new Set(initialData.budgetIncome.entries.filter((e) => e.excluded).map((e) => e.id)),
  )
  const [excludedExpense, setExcludedExpense] = useState<Set<string>>(
    () => new Set(initialData.budgetExpenses.entries.filter((e) => e.excluded).map((e) => e.id)),
  )

  const [manualIncomeDraft, setManualIncomeDraft] = useState(
    String(Math.round(initialData.netMonthlyIncome || 0)),
  )
  const [manualExpensesDraft, setManualExpensesDraft] = useState(
    String(Math.round(initialData.estimatedMonthlyExpenses || 0)),
  )

  // ── Optimistische budget-totalen ──────────────────────────────────────────
  // De som van de aangevinkte posten is de rekensom van de kassabon zélf (niet
  // een tweede afleiding van een kerngetal): zolang de lokale selectie gelijk is
  // aan de server-selectie is hij per definitie gelijk aan `annualTotal`. Hij
  // bestaat zodat een vinkje meteen zichtbaar effect heeft.
  const budgetIncomeAnnual = useMemo(
    () => sumSelected(data.budgetIncome, excludedIncome),
    [data.budgetIncome, excludedIncome],
  )
  const budgetExpensesAnnual = useMemo(
    () => sumSelected(data.budgetExpenses, excludedExpense),
    [data.budgetExpenses, excludedExpense],
  )

  // DE grondslagbeslissing komt uit de rekenlaag — dezelfde functie die de
  // loader gebruikt (`resolveAmountWithBasis`, lib/effective-financials.ts).
  // De resolver is schaalvrij: inkomen gaat er op JAARbasis in, uitgaven op
  // maandbasis — de drie bedragen per aanroep staan in dezelfde eenheid.
  const resolvedIncome = resolveAmountWithBasis(
    incomeSource,
    data.netMonthlyIncome * 12,
    data.estimatedAnnualIncome,
    budgetIncomeAnnual,
  )
  const resolvedExpenses = resolveAmountWithBasis(
    expensesSource,
    data.estimatedMonthlyExpenses,
    data.computedMonthlyExpenses,
    budgetExpensesAnnual / 12,
  )

  const incomeBasis = resolvedIncome.basis
  const expensesBasis = resolvedExpenses.basis
  const annualIncome = resolvedIncome.amount
  const monthlyIncome = annualIncome / 12
  const monthlyExpenses = resolvedExpenses.amount

  // Welke van de drie opties aangevinkt staat. Bij een EXPLICIETE keuze is dat de
  // keuze zelf — óók wanneer die (tijdelijk) terugvalt op transacties omdat alle
  // posten zijn uitgevinkt; anders zou de gebruiker zijn eigen selectie én de
  // terugval-melding niet meer zien. Bij 'auto' volgt de vink de grondslag die de
  // resolver koos, zodat er nooit een venster zonder enige selectie staat.
  const incomeOption = incomeSource === 'auto' ? optionForBasis(incomeBasis) : incomeSource
  const expensesOption = expensesSource === 'auto' ? optionForBasis(expensesBasis) : expensesSource

  // De spaarquote komt ALTIJD uit de rekenlaag (consume, don't recompute) — maar
  // het zijn TWEE getallen met twee betekenissen, en het venster moet er per
  // kassabonvorm het juiste van tonen:
  //
  //  • `effectiveSavingsRatePct` — de ADR 0103-uniforme (inkomen − uitgaven) ÷
  //    inkomen op de GEKOZEN grondslagen. Dit is wat de kaart toont en wat onder
  //    het afgeleide kassabon-blok hoort, want dat blok toont effectieve,
  //    grondslag-geresolveerde bedragen.
  //  • `savingsRate6m` — de RAUWE 6-maands transactiequote (incl. de
  //    spaarbudget-/aflossingscorrectie). Hoort uitsluitend onder de
  //    transactie-kassabon, want alleen dáár volgt hij uit de getoonde rijen.
  const savingsRate = Math.round(data.effectiveSavingsRatePct)
  const transactionSavingsRate = Math.round(data.savingsRate6m)

  // 6-maands transactie-kassabon (alleen zinvol wanneer BEIDE grondslagen de
  // transactiesom zijn — anders zou een breakdown getoond worden die het
  // percentage niet produceerde). `monthlyBreakdown` bevat sinds ADR 0138 de
  // twaalf AFGESLOTEN maanden, dus `.slice(-6)` is exact het C6-venster van
  // `savingsRate6m` (zes afgesloten maanden, lopende maand exclusief).
  const sixMonth = useMemo(() => {
    const last6 = data.monthlyBreakdown.slice(-6)
    const income = last6.reduce((s, m) => s + m.income, 0)
    const expenses = last6.reduce((s, m) => s + m.expenses, 0)
    return { months: last6, income, expenses, saved: income - expenses }
  }, [data.monthlyBreakdown])

  const twelveMonthIncome = useMemo(
    () => data.monthlyBreakdown.reduce((s, m) => s + m.income, 0),
    [data.monthlyBreakdown],
  )

  // B-017 — de transactie-kassabon extrapoleert net zo hard als de
  // budget-kassabon ernaast (`extrapolatedIncome`, ADR 0050) en zweeg daar
  // even hard over. Eén post (de transactiesom als geheel), dus een
  // één-post-samenvatting; de ZIN komt uit dezelfde helper, zodat de twee
  // kassabonnen niet twee formuleringen voor hetzelfde feit krijgen.
  const transactieWindowNote = useMemo(() => {
    const windowMonths = Math.max(1, data.monthlyBreakdown.length)
    const gemeten = data.incomeMonths
    return extrapolationNote({
      windowMonths,
      countedRealized: gemeten > 0 ? 1 : 0,
      shortCount: gemeten > 0 && gemeten < windowMonths ? 1 : 0,
      shortestMonths: gemeten,
      longestShortMonths: gemeten,
    })
  }, [data.monthlyBreakdown.length, data.incomeMonths])

  const bothTransaction = incomeBasis === 'transaction' && expensesBasis === 'transaction'
  const showTxReceipt = bothTransaction && data.savingsRateMethod === 'transaction'
  const showDerivedReceipt = !bothTransaction
  const showEstimateNote = bothTransaction && data.savingsRateMethod !== 'transaction'

  // Gedeelde helper (lib/budget-basis.ts): de forecast-kaart en de
  // spaarquote-widget benoemen dezelfde grondslag met dezelfde woorden.
  const savingsBasis = savingsRateBasisLabel(incomeBasis, expensesBasis)
  const savingsSub = showTxReceipt
    ? 'laatste 6 afgesloten maanden'
    : showEstimateNote
      ? data.savingsRateMethod === 'net_worth_delta'
        ? 'geschat uit vermogensgroei'
        : 'geschat uit profiel'
      : 'volgt uit inkomen en uitgaven'

  // ── Persist ───────────────────────────────────────────────────────────────
  // Bronwaarde én selectie gaan ALTIJD in dezelfde PUT (ADR 0103): twee calls
  // zouden een waarneembare tussentoestand opleveren, en bij een gefaalde tweede
  // call een blijvend verkeerde grondslag.
  //
  // MISLUKT DE PUT, DAN DRAAIT DE OPTIMISTISCHE STAAT TERUG — zie de uitgebreide
  // toelichting in de commit die dit gedrag introduceerde (ADR 0103): "opgeslagen"
  // tonen terwijl de app met een andere grondslag rekent is een tweede waarheid.
  const persist = useCallback(
    async (side: Side, patch: Record<string, unknown>, rollback: () => void) => {
      setSyncing(true)
      setSaveError(null)

      // `res.ok` alléén is hier het VERKEERDE signaal. De route geeft bewust 200
      // terug wanneer `cashflow_basis_prefs` uit de payload is gestript omdat de
      // kolom nog niet is uitgerold — de bronwaarde IS dan opgeslagen, de
      // selectie niet. Wij toetsen dus op de bevestiging van wat we stuurden.
      const expectsPrefs = patch.cashflow_basis_prefs !== undefined
      let saved = false
      try {
        const res = await fetch('/api/parameters', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (res.ok) {
          if (expectsPrefs) {
            const body = (await res.json().catch(() => null)) as
              | { cashflow_basis_prefs?: unknown }
              | null
            saved = Boolean(body?.cashflow_basis_prefs)
          } else {
            saved = true
          }
        }
      } catch {
        saved = false
      }

      if (!saved) {
        rollback()
        setSaveError(side)
        setSyncing(false)
        return
      }

      try {
        const res = await fetch('/api/overzicht/cashflow-settings')
        if (res.ok) setData((await res.json()) as CashflowSettingsData)
        if (refreshRouter) router.refresh()
      } catch {
        // Schrijfactie geslaagd, alleen het verversen niet — de optimistische
        // weergave is dan nog steeds de waarheid.
      }
      onSaved?.()
      setSyncing(false)
    },
    [onSaved, refreshRouter, router],
  )

  const buildPrefs = useCallback(
    (inc: Set<string>, exp: Set<string>): CashflowBasisPrefs => ({
      v: CASHFLOW_BASIS_PREFS_VERSION,
      excludedIncomeBudgetIds: [...inc],
      excludedExpenseBudgetIds: [...exp],
    }),
    [],
  )

  const chooseSource = useCallback(
    (side: Side, source: BasisSource) => {
      const key = side === 'income' ? 'income_source' : 'expenses_source'
      const patch: Record<string, unknown> = {
        [key]: source,
        cashflow_basis_prefs: buildPrefs(excludedIncome, excludedExpense),
      }
      // Vorige staat bewaren vóór de optimistische mutatie, zodat een mislukte
      // PUT exact terugvalt op wat de gebruiker had.
      const prevSource = side === 'income' ? incomeSource : expensesSource
      const prevDraft = side === 'income' ? manualIncomeDraft : manualExpensesDraft

      if (source === 'manual') {
        // Het bedrag hoort in dezelfde call: een 'manual'-bron zonder bedrag zou
        // de kaart op de profielwaarde laten staan zonder dat de gebruiker dat
        // zag gebeuren.
        const draft = Number(prevDraft)
        const fallback = side === 'income' ? monthlyIncome : monthlyExpenses
        const value = Math.round(Number.isFinite(draft) && draft > 0 ? draft : fallback)
        patch[side === 'income' ? 'net_monthly_income' : 'estimated_monthly_expenses'] = value
        if (side === 'income') setManualIncomeDraft(String(value))
        else setManualExpensesDraft(String(value))
      }
      if (side === 'income') setIncomeSource(source)
      else setExpensesSource(source)

      void persist(side, patch, () => {
        if (side === 'income') {
          setIncomeSource(prevSource)
          setManualIncomeDraft(prevDraft)
        } else {
          setExpensesSource(prevSource)
          setManualExpensesDraft(prevDraft)
        }
      })
    },
    [
      buildPrefs,
      excludedExpense,
      excludedIncome,
      expensesSource,
      incomeSource,
      manualExpensesDraft,
      manualIncomeDraft,
      monthlyExpenses,
      monthlyIncome,
      persist,
    ],
  )

  const toggleEntry = useCallback(
    (side: Side, id: string) => {
      const prevExcluded = side === 'income' ? excludedIncome : excludedExpense
      const prevSource = side === 'income' ? incomeSource : expensesSource
      const next = new Set(prevExcluded)
      if (next.has(id)) next.delete(id)
      else next.add(id)

      // Aanvinken IS een expliciete keuze: de rij verlaat 'auto' (ADR 0103), dus
      // de lokale bron schuift mee met wat we wegschrijven.
      if (side === 'income') {
        setExcludedIncome(next)
        setIncomeSource('budget')
      } else {
        setExcludedExpense(next)
        setExpensesSource('budget')
      }

      const inc = side === 'income' ? next : excludedIncome
      const exp = side === 'expenses' ? next : excludedExpense
      void persist(
        side,
        {
          [side === 'income' ? 'income_source' : 'expenses_source']: 'budget',
          cashflow_basis_prefs: buildPrefs(inc, exp),
        },
        () => {
          if (side === 'income') {
            setExcludedIncome(prevExcluded)
            setIncomeSource(prevSource)
          } else {
            setExcludedExpense(prevExcluded)
            setExpensesSource(prevSource)
          }
        },
      )
    },
    [buildPrefs, excludedExpense, excludedIncome, expensesSource, incomeSource, persist],
  )

  const commitManual = useCallback(
    (side: Side, raw: string) => {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) return
      const value = Math.round(n)
      const prevSource = side === 'income' ? incomeSource : expensesSource
      const prevDraft = side === 'income' ? manualIncomeDraft : manualExpensesDraft

      if (side === 'income') setIncomeSource('manual')
      else setExpensesSource('manual')

      void persist(
        side,
        {
          [side === 'income' ? 'income_source' : 'expenses_source']: 'manual',
          [side === 'income' ? 'net_monthly_income' : 'estimated_monthly_expenses']: value,
          cashflow_basis_prefs: buildPrefs(excludedIncome, excludedExpense),
        },
        () => {
          if (side === 'income') {
            setIncomeSource(prevSource)
            setManualIncomeDraft(prevDraft)
          } else {
            setExpensesSource(prevSource)
            setManualExpensesDraft(prevDraft)
          }
        },
      )
    },
    [
      buildPrefs,
      excludedExpense,
      excludedIncome,
      expensesSource,
      incomeSource,
      manualExpensesDraft,
      manualIncomeDraft,
      persist,
    ],
  )

  const incomeRef = useRef<HTMLElement | null>(null)
  const expensesRef = useRef<HTMLElement | null>(null)
  const savingsRef = useRef<HTMLElement | null>(null)

  const resetSaveError = useCallback(() => setSaveError(null), [])

  // ── Dagtarief: ÉÉN wisselkoers (M22, besluit B1) ──────────────────────────
  // Het canonieke 12-mnd rolling tarief uit de bundel. Een dagtarief is geen
  // grondslagkeuze maar een app-brede wisselkoers; wat de gebruiker hier kiest
  // bepaalt welk BEDRAG er staat, niet hoe een euro in tijd wordt uitgedrukt.
  //
  // PRIVACY (ADR 0091 laag 4). Onder maskering vallen zowel het tarief als de
  // eruit afgeleide vrijheidstijd weg; `showRate` is de ene gate voor beide.
  const dailyRate = data.dailyExpenseRate ?? 0
  const showRate = !masked && dailyRate > 0
  const rateFootnote = formatFreedomRateFootnote(
    dailyRate,
    data.dailyExpenseRateSource ?? (dailyRate > 0 ? 'transactions' : 'none'),
    masked,
  )

  return {
    data,
    syncing,
    saveError,
    radioName,
    incomeBasis,
    expensesBasis,
    incomeOption,
    expensesOption,
    incomeUnknown: isUnknownBasis(incomeBasis),
    expensesUnknown: isUnknownBasis(expensesBasis),
    annualIncome,
    monthlyIncome,
    monthlyExpenses,
    savingsRate,
    transactionSavingsRate,
    savingsBasisLabel: savingsBasis,
    savingsSub,
    showTxReceipt,
    showDerivedReceipt,
    showEstimateNote,
    dailyRate,
    showRate,
    rateFootnote,
    excludedIncome,
    excludedExpense,
    budgetIncomeAnnual,
    budgetExpensesAnnual,
    sixMonth,
    twelveMonthIncome,
    transactieWindowNote,
    manualIncomeDraft,
    setManualIncomeDraft,
    manualExpensesDraft,
    setManualExpensesDraft,
    chooseSource,
    toggleEntry,
    commitManual,
    refs: { income: incomeRef, expenses: expensesRef, savings: savingsRef },
    resetSaveError,
  }
}

/**
 * De inhoud van het venster: intro, sprongknoppen en de drie blokken.
 *
 * `kop` bepaalt het kopniveau van de blokken — de host weet waar hij zit
 * (instellingenblok: `h2` binnen de pagina; wizard: `h5` onder de stapnaam `h4`).
 * `onJump`/`actief` zijn optioneel: alleen de host met een scroll-container toont
 * de sprongknoppen.
 */
export function CashflowGrondslagBody({
  ctrl,
  kop = 'h2',
  actief,
  onJump,
  intro = true,
}: {
  ctrl: CashflowGrondslagControl
  kop?: CashflowKopNiveau
  actief?: CashflowBlockId | null
  onJump?: (id: CashflowBlockId) => void
  intro?: boolean
}) {
  const { data } = ctrl
  return (
    <div className="space-y-6">
      {intro && (
        <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
          Deze drie horen bij elkaar. Je kiest per kant waar het getal vandaan komt;
          je spaarquote volgt daar vanzelf uit — dat is wat je aan vrijheid opbouwt.
        </p>
      )}

      {onJump && (
        <nav aria-label="Ga naar" className="flex flex-wrap gap-2">
          <JumpPill active={actief === 'income'} onClick={() => onJump('income')}>Inkomen</JumpPill>
          <JumpPill active={actief === 'expenses'} onClick={() => onJump('expenses')}>Uitgaven</JumpPill>
          <JumpPill active={actief === 'savings'} onClick={() => onJump('savings')}>Spaarquote</JumpPill>
        </nav>
      )}

      {/* ── Inkomen ───────────────────────────────────────────────── */}
      <BlockSection
        ref={ctrl.refs.income}
        kop={kop}
        kicker="Grondslag"
        heading="Waar komt je inkomen vandaan?"
        amount={<MaskedAmount value={ctrl.annualIncome} tone="kern" />}
        amountSub={`€${Math.round(ctrl.monthlyIncome).toLocaleString('nl-NL')} per maand · ${BASIS_LABEL[ctrl.incomeBasis]}`}
      >
        <div role="radiogroup" aria-label="Grondslag voor je inkomen" className="space-y-2">
          <BasisOption
            name={`${ctrl.radioName}-income`}
            checked={ctrl.incomeOption === 'budget'}
            disabled={!data.budgetIncome.hasBudgets}
            label="Uit je budgetten"
            hint={
              data.budgetIncome.hasBudgets
                ? 'Wat er per post binnenkwam over de afgelopen 12 afgesloten maanden — de lopende maand telt pas mee als hij voorbij is. Vink aan wat meetelt.'
                : 'Je hebt nog geen inkomsten-budgetten om uit te rekenen.'
            }
            onSelect={() => ctrl.chooseSource('income', 'budget')}
          >
            <BudgetKassabon
              basis={data.budgetIncome}
              excluded={ctrl.excludedIncome}
              onToggle={(id) => ctrl.toggleEntry('income', id)}
              annualTotal={ctrl.budgetIncomeAnnual}
              emptyNote="Je hebt alle posten uitgevinkt. We rekenen daarom voorlopig met je transacties — je inkomen komt zo nooit op €0 te staan."
            />
          </BasisOption>

          <BasisOption
            name={`${ctrl.radioName}-income`}
            checked={ctrl.incomeOption === 'transaction'}
            label="Uit je transacties"
            hint="Wat er de afgelopen 12 afgesloten maanden werkelijk binnenkwam — de lopende maand telt pas mee als hij voorbij is."
            onSelect={() => ctrl.chooseSource('income', 'transaction')}
          >
            <KassabonShell>
              <div className="space-y-1.5">
                {data.monthlyBreakdown.map((m, i) => (
                  <div key={`${m.label}-${i}`} className="flex items-center justify-between">
                    <span className="capitalize text-[var(--ink-2)]">{m.label}</span>
                    <span className="tabular-nums"><MaskedAmount value={m.income} tone="kern" /></span>
                  </div>
                ))}
                <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>Totaal (12 afgesloten mnd)</span>
                    <span className="tabular-nums"><MaskedAmount value={ctrl.twelveMonthIncome} tone="kern" /></span>
                  </div>
                  {/* Rijen, totaal en "≈ €X/mnd" komen sinds ADR 0138 uit
                      HETZELFDE venster van twaalf afgesloten maanden. */}
                  <p className="mt-1 text-[10px] text-[var(--ink-meta)]">
                    ≈ €{Math.round(data.estimatedAnnualIncome / 12).toLocaleString('nl-NL')}/mnd
                  </p>
                  {ctrl.transactieWindowNote && (
                    <p className="mt-1 font-serif text-[10px] italic leading-snug text-[var(--ink-3)]">
                      {ctrl.transactieWindowNote}
                    </p>
                  )}
                </div>
              </div>
            </KassabonShell>
          </BasisOption>

          <BasisOption
            name={`${ctrl.radioName}-income`}
            checked={ctrl.incomeOption === 'manual'}
            label="Eigen bedrag"
            hint="Een vast bedrag dat je zelf invult. Beweegt niet mee."
            onSelect={() => ctrl.chooseSource('income', 'manual')}
          >
            <ManualAmountInput
              label="Netto per maand"
              value={ctrl.manualIncomeDraft}
              onChange={ctrl.setManualIncomeDraft}
              onCommit={(v) => ctrl.commitManual('income', v)}
            />
          </BasisOption>
        </div>

        {ctrl.saveError === 'income' && <BlockNote live>{SAVE_ERROR_TEXT}</BlockNote>}

        {/* De vrijheidstijd is lineair in `annualIncome` — dat bedrag staat
            erboven als MaskedAmount, dus deze regel maskeert mee (ADR 0091
            laag 4). Zonder die gate lees je het jaarinkomen gewoon terug. */}
        {ctrl.annualIncome > 0 && ctrl.showRate && (
          <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
            Een jaar van dit inkomen is bij je huidige uitgaven{' '}
            <strong className="text-[var(--ink-2)]">
              {formatFreedomTimeString(calculateFreedomTime(ctrl.annualIncome, ctrl.dailyRate))}
            </strong>{' '}
            vrijheid. {ctrl.rateFootnote}
          </p>
        )}
      </BlockSection>

      {/* ── Uitgaven ──────────────────────────────────────────────── */}
      <BlockSection
        ref={ctrl.refs.expenses}
        kop={kop}
        kicker="Grondslag"
        heading="Waar komen je uitgaven vandaan?"
        amount={<MaskedAmount value={ctrl.monthlyExpenses} tone="kern" />}
        amountSub={`per maand · ${BASIS_LABEL[ctrl.expensesBasis]}`}
      >
        <div role="radiogroup" aria-label="Grondslag voor je uitgaven" className="space-y-2">
          <BasisOption
            name={`${ctrl.radioName}-expenses`}
            checked={ctrl.expensesOption === 'budget'}
            disabled={!data.budgetExpenses.hasBudgets}
            label="Uit je budgetten"
            hint={
              data.budgetExpenses.hasBudgets
                ? 'Wat je per post uitgaf over de afgelopen 12 afgesloten maanden — de lopende maand telt pas mee als hij voorbij is. Vink aan wat meetelt.'
                : 'Je hebt nog geen uitgaven-budgetten om uit te rekenen.'
            }
            onSelect={() => ctrl.chooseSource('expenses', 'budget')}
          >
            <BudgetKassabon
              basis={data.budgetExpenses}
              excluded={ctrl.excludedExpense}
              onToggle={(id) => ctrl.toggleEntry('expenses', id)}
              annualTotal={ctrl.budgetExpensesAnnual}
              emptyNote="Je hebt alle posten uitgevinkt. We rekenen daarom voorlopig met je transacties — je uitgaven komen zo nooit op €0 te staan."
            />
          </BasisOption>

          <BasisOption
            name={`${ctrl.radioName}-expenses`}
            checked={ctrl.expensesOption === 'transaction'}
            label="Uit je transacties"
            hint="Het gemiddelde over de laatste 6 afgesloten maanden — de lopende maand telt pas mee als hij voorbij is."
            onSelect={() => ctrl.chooseSource('expenses', 'transaction')}
          >
            <KassabonShell>
              <div className="space-y-1.5">
                {ctrl.sixMonth.months.map((m, i) => (
                  <div key={`${m.label}-${i}`} className="flex items-center justify-between text-[var(--ink-3)]">
                    <span className="capitalize">{m.label}</span>
                    <span className="tabular-nums">
                      <MaskedAmount value={m.expenses} tone="kern" className="text-[11px]" />
                    </span>
                  </div>
                ))}
                <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>Σ Uitgaven (6 mnd)</span>
                    <span className="tabular-nums"><MaskedAmount value={ctrl.sixMonth.expenses} tone="kern" /></span>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--ink-meta)]">
                    ≈ €{Math.round(data.computedMonthlyExpenses).toLocaleString('nl-NL')}/mnd
                  </p>
                </div>
              </div>
            </KassabonShell>
          </BasisOption>

          <BasisOption
            name={`${ctrl.radioName}-expenses`}
            checked={ctrl.expensesOption === 'manual'}
            label="Eigen bedrag"
            hint="Wat je maandelijks écht kwijt bent — inclusief je hypotheeklast, zonder wat je naar spaar- of beleggingspotjes overmaakt."
            onSelect={() => ctrl.chooseSource('expenses', 'manual')}
          >
            <ManualAmountInput
              label="Per maand"
              value={ctrl.manualExpensesDraft}
              onChange={ctrl.setManualExpensesDraft}
              onCommit={(v) => ctrl.commitManual('expenses', v)}
            />
          </BasisOption>
        </div>

        {ctrl.saveError === 'expenses' && <BlockNote live>{SAVE_ERROR_TEXT}</BlockNote>}

        {/* De grondslagkeuze hierboven bepaalt het BEDRAG op de kaart, niet
            het dagtarief: dat is één app-brede wisselkoers (M22). */}
        {ctrl.showRate && (
          <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
            Je dagtarief staat los van deze keuze: één dag vrijheid kost je{' '}
            <strong className="text-[var(--ink-2)]">{formatCurrency(ctrl.dailyRate)}</strong>,
            gerekend over je uitgaven van de afgelopen 12 maanden — hetzelfde tarief
            dat elk ander scherm gebruikt. Elke euro die je niet uitgeeft, koop je
            terug als tijd.
          </p>
        )}
      </BlockSection>

      {/* ── Spaarquote ────────────────────────────────────────────── */}
      <BlockSection
        ref={ctrl.refs.savings}
        kop={kop}
        kicker="Uitkomst"
        heading="Wat je overhoudt aan vrijheid"
        amount={`${ctrl.savingsRate}%`}
        amountSub={`${ctrl.savingsBasisLabel} · ${ctrl.savingsSub}`}
      >
        <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
          Je spaarquote is geen aparte instelling: hij volgt uit de twee grondslagen
          hierboven — inkomen <em>{BASIS_LABEL[ctrl.incomeBasis]}</em>, uitgaven{' '}
          <em>{BASIS_LABEL[ctrl.expensesBasis]}</em>. Wil je hem veranderen, verander dan
          wat je verdient of wat je uitgeeft.
        </p>

        {ctrl.showTxReceipt && (
          <KassabonShell>
            <div className="space-y-1.5">
              {ctrl.sixMonth.months.map((m, i) => {
                const net = m.income - m.expenses
                return (
                  <div key={`${m.label}-${i}`} className="flex items-center justify-between text-[var(--ink-3)]">
                    <span className="capitalize">{m.label}</span>
                    <span className="tabular-nums">
                      <MaskedAmount value={net} tone="kern" signPrefix={net >= 0 ? '+' : ''} className="text-[11px]" />
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-2 space-y-1 border-t border-dashed border-[var(--border-md)] pt-2">
              <div className="flex items-center justify-between"><span>Σ Inkomen (6 mnd)</span><span className="tabular-nums"><MaskedAmount value={ctrl.sixMonth.income} tone="kern" /></span></div>
              <div className="flex items-center justify-between"><span>Σ Uitgaven (6 mnd)</span><span className="tabular-nums">−<MaskedAmount value={ctrl.sixMonth.expenses} tone="kern" /></span></div>
              {/* De correctieregels horen UITSLUITEND bij de transactiegrondslag:
                  alleen daar is de uitgavensom rúw en zitten spaarstortingen en
                  aflossing er ten onrechte in (ADR 0103). */}
              {data.savingsBudgetTotal6m > 0 && (
                <div className="flex items-center justify-between text-[var(--ink-3)]"><span>+ Sparen in budgetten</span><span className="tabular-nums"><MaskedAmount value={data.savingsBudgetTotal6m} tone="kern" /></span></div>
              )}
              {data.debtAflossingTotal6m > 0 && (
                <div className="flex items-center justify-between text-[var(--ink-3)]"><span>+ Schuldaflossing</span><span className="tabular-nums"><MaskedAmount value={data.debtAflossingTotal6m} tone="kern" /></span></div>
              )}
              <div className="flex items-center justify-between">
                <span>Gespaard</span>
                <span className="tabular-nums">
                  <MaskedAmount
                    value={ctrl.sixMonth.saved + data.savingsBudgetTotal6m + data.debtAflossingTotal6m}
                    tone="kern"
                    signPrefix={(ctrl.sixMonth.saved + data.savingsBudgetTotal6m + data.debtAflossingTotal6m) >= 0 ? '+' : ''}
                  />
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-1.5 font-bold">
                {/* De 6-maands transactiequote: het getal dat uit DEZE rijen
                    volgt, inclusief de correcties hierboven. */}
                <span>Spaarquote</span><span className="tabular-nums">{ctrl.transactionSavingsRate}%</span>
              </div>
            </div>
          </KassabonShell>
        )}

        {ctrl.showDerivedReceipt && (
          <KassabonShell>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span>Inkomen (per maand)</span>
                <span className="tabular-nums"><MaskedAmount value={ctrl.monthlyIncome} tone="kern" /></span>
              </div>
              <div className="flex items-center justify-between">
                <span>Uitgaven (per maand)</span>
                <span className="tabular-nums">−<MaskedAmount value={ctrl.monthlyExpenses} tone="kern" /></span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-1.5">
                <span>Gespaard</span>
                <span className="tabular-nums">
                  <MaskedAmount
                    value={ctrl.monthlyIncome - ctrl.monthlyExpenses}
                    tone="kern"
                    signPrefix={ctrl.monthlyIncome - ctrl.monthlyExpenses >= 0 ? '+' : ''}
                  />
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-1.5 font-bold">
                <span>Spaarquote</span><span className="tabular-nums">{ctrl.savingsRate}%</span>
              </div>
            </div>
          </KassabonShell>
        )}

        {ctrl.showEstimateNote && (
          <>
            <p className="text-[11px] text-[var(--ink-3)]">
              {data.savingsRateMethod === 'net_worth_delta'
                ? 'Geschat uit de groei van je vermogen — er zijn nog te weinig transacties voor een 6-maands berekening.'
                : 'Geschat uit je opgegeven inkomsten en uitgaven — er zijn nog te weinig transacties voor een 6-maands berekening.'}
            </p>
            <p className="text-[11px] text-[var(--ink-meta)]">
              Zodra je meer transacties hebt, rekenen we je spaarquote over die echte maanden.
            </p>
            <KassabonShell>
              <div className="flex items-center justify-between font-bold">
                <span>Spaarquote</span><span className="tabular-nums">{ctrl.savingsRate}%</span>
              </div>
            </KassabonShell>
          </>
        )}

        <details className="group text-[var(--ink-meta)]">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            Zo rekenen we je spaarquote
          </summary>
          <div className="mt-1.5 space-y-1 text-[10px] leading-relaxed">
            <p>
              Spaarquote ={' '}
              <span className="font-mono tabular-nums">(inkomen − uitgaven) ÷ inkomen</span>, op
              de grondslagen die je hierboven koos.
            </p>
            {ctrl.showTxReceipt ? (
              <p>
                Op de transactiegrondslag tellen we sparen in je budgetten en het aflossen van
                schulden terug bij het gespaarde bedrag: dat geld verdwijnt niet, het bouwt
                vermogen op. Bij een budget- of eigen bedrag-grondslag doen we dat bewust niet —
                spaar- en schuldbudgetten zitten daar per constructie al niet in de uitgaven,
                dus meetellen zou hetzelfde spaargeld twee keer tellen.
              </p>
            ) : (
              <p>
                Sparen in budgetten en schuldaflossing tellen we hier bewust <strong>niet</strong>{' '}
                apart bij op: op deze grondslag zitten spaar- en schuldbudgetten al niet in je
                uitgaven, dus dat zou hetzelfde spaargeld twee keer tellen.
              </p>
            )}
            <p>
              Bron op dit moment: inkomen {BASIS_LABEL[ctrl.incomeBasis]}, uitgaven{' '}
              {BASIS_LABEL[ctrl.expensesBasis]}
              {ctrl.showEstimateNote
                ? data.savingsRateMethod === 'net_worth_delta'
                  ? '; het percentage zelf is geschat uit de groei van je vermogen'
                  : '; het percentage zelf is geschat uit je opgegeven bedragen'
                : ''}
              .
            </p>
          </div>
        </details>
      </BlockSection>
    </div>
  )
}

/** Som van de niet-uitgesloten posten, op jaarbasis. */
function sumSelected(basis: BudgetBasisResult, excluded: Set<string>): number {
  return basis.entries.reduce((s, e) => (excluded.has(e.id) ? s : s + e.annualAmount), 0)
}

function JumpPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center rounded-full border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors ${
        active
          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
          : 'border-[var(--rule-soft)] bg-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Eén blok in het gecombineerde venster. `forwardRef` is niet nodig in React 19
 * — `ref` is daar een gewone prop op function components.
 *
 * `kop` is het kopniveau dat de HOST voorschrijft: de kop van dit blok hangt onder
 * de kop van zijn host, en een niveau overslaan is een a11y-fout (ADR 0110).
 */
function BlockSection({
  ref,
  kop,
  kicker,
  heading,
  amount,
  amountSub,
  children,
}: {
  ref?: React.Ref<HTMLElement>
  kop: CashflowKopNiveau
  kicker: string
  heading: string
  amount: React.ReactNode
  amountSub: string
  children: React.ReactNode
}) {
  const Kop = kop
  return (
    <section ref={ref} className="scroll-mt-4 space-y-3 border-t border-[var(--border-ed)] pt-5">
      <Kicker size="small">{kicker}</Kicker>
      <Kop className="font-display text-[15px] font-semibold leading-snug text-[var(--ink)]">
        {heading}
      </Kop>
      <div>
        <p className="font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">{amount}</p>
        {/* Draagt de grondslag-vermelding bij het hoofdbedrag (ADR 0103) —
            daarom `--ink-meta` (AA-gegarandeerd voor kleine tekst) en niet
            `--ink-4`, dat per app/globals.css geen teksttoken is. */}
        <p className="mt-0.5 text-[11px] italic text-[var(--ink-meta)]">{amountSub}</p>
      </div>
      {children}
    </section>
  )
}

function BasisOption({ name, checked, disabled = false, label, hint, onSelect, children }: {
  name: string
  checked: boolean
  disabled?: boolean
  label: string
  hint?: string
  onSelect: () => void
  children?: React.ReactNode
}) {
  return (
    <div>
      <label
        className={`flex items-start gap-2.5 border px-3 py-2.5 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--module-active-500)] ${
          checked ? 'border-kern-400 bg-kern-50' : 'border-[var(--border-md)]'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <input
          type="radio"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={onSelect}
          className="sr-only"
        />
        <span
          aria-hidden
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            checked ? 'border-kern-600 bg-kern-600 text-[var(--paper)]' : 'border-[var(--border-md)]'
          }`}
        >
          {checked && <Check className="h-3 w-3" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
          {hint && <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-3)]">{hint}</span>}
        </span>
      </label>
      {checked && children && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  )
}

function BudgetKassabon({ basis, excluded, onToggle, annualTotal, emptyNote }: {
  basis: BudgetBasisResult
  excluded: Set<string>
  onToggle: (id: string) => void
  annualTotal: number
  emptyNote: string
}) {
  const allExcluded = basis.entries.length > 0 && annualTotal <= 0
  // De samenvatting van het meetvenster woont in lib/budget-basis.ts en kijkt
  // naar de ZWAKSTE posten, met de LIVE selectie: wat niet meetelt in het
  // totaal, hoort deze regel ook niet te sturen (B-017, ADR 0138).
  const windowNote = extrapolationNote(summarizeBasisWindow(basis, excluded))
  return (
    <>
      <KassabonShell>
        <div className="space-y-1.5">
          {basis.entries.map((entry) => {
            const off = excluded.has(entry.id)
            const meta = entryMeta(entry)
            return (
              <label key={entry.id} className="flex cursor-pointer flex-col gap-0.5">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!off}
                      onChange={() => onToggle(entry.id)}
                      className="h-3.5 w-3.5 shrink-0 accent-[var(--color-kern-500)]"
                    />
                    {/* De-emphasis via `line-through` + één stap lichtere inkt.
                        BEWUST NIET --ink-4: dat is per app/globals.css geen
                        teksttoken (1,65:1 op --subtle). --ink-3 houdt 4,64:1
                        worst-case en blijft dus AA, ook doorgestreept. */}
                    <span className={`truncate ${off ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink-2)]'}`}>
                      {entry.name}
                    </span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${off ? 'text-[var(--ink-3)] line-through' : ''}`}>
                    <MaskedAmount value={entry.annualAmount / 12} tone="kern" />
                  </span>
                </span>
                {meta && (
                  // Eén regel fijndruk per post, links onder de naam: gemeten of
                  // gepland, en het geplande bedrag zodra dat wezenlijk afwijkt.
                  <span className="pl-[22px] font-serif text-[10px] italic leading-snug text-[var(--ink-3)]">
                    {meta}
                  </span>
                )}
              </label>
            )
          })}
          <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
            <div className="flex items-center justify-between font-bold">
              <span>Totaal (per maand)</span>
              <span className="tabular-nums"><MaskedAmount value={annualTotal / 12} tone="kern" /></span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              ≈ €{Math.round(annualTotal).toLocaleString('nl-NL')} per jaar
            </p>
            {windowNote && (
              <p className="mt-1 font-serif text-[10px] italic leading-snug text-[var(--ink-3)]">
                {windowNote}
              </p>
            )}
          </div>
        </div>
      </KassabonShell>
      {basis.truncationSuspected && (
        <BlockNote>
          We konden mogelijk niet alle transacties meetellen, dus dit bedrag kan aan de
          lage kant zijn. Kies je transacties of een eigen bedrag, dan weet je zeker
          waar het op rust.
        </BlockNote>
      )}
      {allExcluded && (
        <BlockNote>{emptyNote}</BlockNote>
      )}
    </>
  )
}

/**
 * De fijndruk onder één budgetpost (ADR 0103, gerealiseerde grondslag).
 *
 * "Uit je budgetten" betekent: wat er de afgelopen 12 AFGESLOTEN maanden
 * werkelijk op deze post is binnengekomen of uitgegeven (ADR 0138). Alleen
 * zonder transacties valt een post terug op zijn geplande limiet — en dát is een
 * zwakker getal, dus dat zegt de regel expliciet. Eén regel, nooit meer.
 */
const PLANNED_DEVIATION_THRESHOLD = 0.05

function entryMeta(entry: BudgetBasisEntry): string | null {
  if (entry.source === 'planned') {
    return entry.realizedMonths === 0
      ? 'gepland — nog geen transacties gelogd'
      : 'gepland'
  }

  const parts: string[] = []
  const planned = entry.plannedAnnualAmount
  if (
    planned > 0 &&
    Math.abs(entry.annualAmount - planned) / planned >= PLANNED_DEVIATION_THRESHOLD
  ) {
    parts.push(`gepland ${formatCurrency(planned / 12)} per maand`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * De ENE meldvorm binnen dit venster: rustige, ingesprongen notitie met een
 * accent-streep links. Gebruikt voor de terugval-melding (alles uitgevinkt) én
 * voor een mislukte schrijfactie — bewust geen tweede, alarmerender systeem.
 */
function BlockNote({ children, live = false }: { children: React.ReactNode; live?: boolean }) {
  return (
    <p
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
      className="border-l-2 border-[var(--module-active-500)] bg-[var(--subtle)]/50 px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]"
    >
      {children}
    </p>
  )
}

function ManualAmountInput({ label, value, onChange, onCommit }: {
  label: string
  value: string
  onChange: (v: string) => void
  onCommit: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2 border border-kern-400 bg-kern-50 px-3 py-2">
      <span className="text-sm text-[var(--ink-2)]">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit(value)}
        className="ml-auto w-28 border-b border-kern-400 bg-transparent text-right font-mono tabular-nums outline-none"
      />
      <span className="text-xs text-[var(--ink-3)]">€/mnd</span>
    </div>
  )
}
