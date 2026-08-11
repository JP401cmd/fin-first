'use client'

import { useState, useMemo, useCallback, useEffect, useRef, useId } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { Button, FiguresStrip, Kicker, type FigureProps } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { resolveAmountWithBasis } from '@/lib/effective-financials'
import {
  CASHFLOW_BASIS_PREFS_VERSION,
  type CashflowBasisPrefs,
} from '@/lib/cashflow-settings'
import {
  calculateFreedomTime,
  dailyExpenseRate,
  formatCurrency,
  formatFreedomTimeString,
} from '@/lib/format'
import type {
  BasisSource,
  BudgetBasisEntry,
  BudgetBasisResult,
  ResolvedBasis,
} from '@/lib/budget-basis'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

/**
 * Menselijk label per grondslag — het harde acceptatiecriterium uit ADR 0103:
 * elke kaart benoemt waar zijn getal vandaan komt. Een grondslag die kan
 * schuiven zonder zich bekend te maken is een tweede waarheid met vertraging.
 */
export const BASIS_LABEL: Record<ResolvedBasis, string> = {
  budget: 'uit je budgetten',
  transaction: 'uit je transacties',
  manual: 'eigen invoer',
  profile: 'uit je profiel',
}

/**
 * Instellingenblok onderaan /overzicht/cashflow — inkomen, uitgaven en
 * spaarquote.
 *
 * ÉÉN VENSTER, DRIE KAARTEN (ADR 0103). De drie kaarten blijven staan: het zijn
 * drie getallen die je apart wilt kunnen scannen. Ze openen alle drie hetzelfde
 * gecombineerde venster, want het is één samenhangend systeem — de spaarquote
 * ís de uitkomst van de twee grondslagen erboven en heeft daarom géén eigen
 * bronkeuze meer. Welke kaart je aanklikt, bepaalt naar welk blok het venster
 * scrolt.
 *
 * GRONDSLAG WORDT GECONSUMEERD, NIET BESLIST. Tot ADR 0103 besliste dit
 * component client-side nog een keer zélf of het handmatige of het berekende
 * inkomen gold (de oude `initIncome`/`initExpenses`-regels). Dat was één van de
 * vijf onafhankelijke kopieën van die beslissing. De beslissing woont nu in
 * `resolveAmountWithBasis` (lib/effective-financials.ts) — dezelfde functie die
 * de loader gebruikt. Dit component voedt die resolver met de bundelwaarden plus
 * zijn lokale (optimistische) budgetselectie en toont welke grondslag daaruit
 * komt; die zichtbaarheid is de harde voorwaarde uit de ADR waaronder een
 * grondslag mág schuiven zonder handeling van de gebruiker.
 */

type BlockId = 'income' | 'expenses' | 'savings'
type Side = 'income' | 'expenses'
type BasisOptionId = 'budget' | 'transaction' | 'manual'

/**
 * Welke keuze-optie hoort bij een uitkomst-grondslag. `'profile'` valt samen met
 * "Eigen bedrag": het is dezelfde profielkolom, alleen niet door de gebruiker
 * zelf gezet — dat verschil draagt het label op de kaart, niet de radio.
 */
function optionForBasis(basis: ResolvedBasis): BasisOptionId {
  return basis === 'profile' ? 'manual' : basis
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
function basisSubLabel(basis: ResolvedBasis, truncationSuspected: boolean): string {
  const label = BASIS_LABEL[basis]
  return basis === 'budget' && truncationSuspected ? `${label} · mogelijk onvolledig` : label
}

export function CashflowInstellingenBlok({
  data: initialData,
  hideHeading = false,
}: {
  data: CashflowSettingsData
  /**
   * Onderdrukt de eigen kop (kicker + h2) én de sectie-marge. Gezet wanneer het
   * blok in een disclosure hangt die de titel al draagt (CF-4, Eenvoudige
   * weergave — zie cashflow-below-fold.tsx); zonder dit staat de kop er twee keer.
   */
  hideHeading?: boolean
}) {
  const router = useRouter()
  const radioName = useId()

  // De bundel komt via een lazy fetch binnen (cashflow-below-fold). Na elke
  // wijziging halen we 'm opnieuw op, zodat de spaarquote en de server-resolutie
  // van de grondslag weer kloppen zonder dat de gebruiker moet verversen.
  const [data, setData] = useState(initialData)
  useEffect(() => { setData(initialData) }, [initialData])

  const [syncing, setSyncing] = useState(false)
  const [open, setOpen] = useState<BlockId | null>(null)
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
  // loader gebruikt (`resolveAmountWithBasis`, lib/effective-financials.ts). Dit
  // component beslist dus niets zelf; het voedt de resolver met de bundelwaarden
  // plus de lokale (optimistische) budgetselectie, zodat een vinkje meteen
  // zichtbaar effect heeft zonder dat de precedentie hier opnieuw wordt
  // opgeschreven. Zonder lokale wijziging is de uitkomst per definitie gelijk
  // aan `data.effectiveAnnualIncome` / `data.incomeBasis`.
  //
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
  //
  // Ze door elkaar halen levert een kassabon op die zichzelf tegenspreekt:
  // €5.000 in, −€3.000 uit, +€2.000 gespaard en dan 5% in plaats van 40%. Bij
  // twee transactiegrondslagen vallen beide getallen samen (ADR 0103), dus de
  // kaart mag altijd het effectieve getal dragen.
  const savingsRate = Math.round(data.effectiveSavingsRatePct)
  const transactionSavingsRate = Math.round(data.savingsRate6m)

  // 6-maands transactie-kassabon (alleen zinvol wanneer BEIDE grondslagen de
  // transactiesom zijn — anders zou een breakdown getoond worden die het
  // percentage niet produceerde).
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

  const bothTransaction = incomeBasis === 'transaction' && expensesBasis === 'transaction'
  const showTxReceipt = bothTransaction && data.savingsRateMethod === 'transaction'
  const showDerivedReceipt = !bothTransaction
  const showEstimateNote = bothTransaction && data.savingsRateMethod !== 'transaction'

  const savingsBasisLabel =
    incomeBasis === expensesBasis ? BASIS_LABEL[incomeBasis] : 'gemengde grondslag'
  const savingsSub = showTxReceipt
    ? 'laatste 6 maanden'
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
  // MISLUKT DE PUT, DAN DRAAIT DE OPTIMISTISCHE STAAT TERUG. De vinkjes worden
  // vooruitlopend gezet en de uitsluitlijsten worden bewust alleen uit de eerste
  // bundel geseed — zonder terugdraaien zou de gebruiker na een mislukte
  // schrijfactie een selectie blijven zien die nergens staat, en bij de volgende
  // page-load stilzwijgend weer alles aangevinkt krijgen. Dat weegt hier zwaarder
  // dan bij een gewone instelling: deze selectie werkt door tot in het bruto
  // Box 1-inkomen en de jaarruimte, dus "opgeslagen" tonen terwijl de app met een
  // andere grondslag rekent is een tweede waarheid.
  //
  // Alleen het resultaat van de PUT bepaalt dat. Slaagt de PUT maar mislukt het
  // daaropvolgende verversen, dan klopt de optimistische weergave nog steeds —
  // geen terugdraai, geen melding.
  const persist = useCallback(
    async (side: Side, patch: Record<string, unknown>, rollback: () => void) => {
      setSyncing(true)
      setSaveError(null)

      // `res.ok` alléén is hier het VERKEERDE signaal. De route geeft bewust 200
      // terug wanneer `cashflow_basis_prefs` uit de payload is gestript omdat de
      // kolom nog niet is uitgerold — de bronwaarde IS dan opgeslagen, de
      // selectie niet. Hij laat het veld daarom uit de response
      // (`persistedCashSettings` in app/api/parameters/route.ts). Wij toetsen dus
      // op de bevestiging van wat we stuurden: geen `cashflow_basis_prefs` terug
      // = niet opgeslagen, en dat is precies zo'n stille tweede waarheid als de
      // gebruiker niets merkt (de selectie werkt door tot in de jaarruimte).
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
        router.refresh()
      } catch {
        // Schrijfactie geslaagd, alleen het verversen niet — de optimistische
        // weergave is dan nog steeds de waarheid.
      }
      setSyncing(false)
    },
    [router],
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

  // ── Scroll naar het aangeklikte blok ──────────────────────────────────────
  const incomeRef = useRef<HTMLElement | null>(null)
  const expensesRef = useRef<HTMLElement | null>(null)
  const savingsRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const target =
      open === 'income' ? incomeRef : open === 'expenses' ? expensesRef : savingsRef
    // Eén frame wachten: de overlay mount z'n content in dezelfde commit, maar
    // de scroll-container heeft z'n hoogte pas na de eerste paint.
    const raf = requestAnimationFrame(() => {
      const el = target.current
      // jsdom (en oude browsers) kennen scrollIntoView niet — de guard houdt de
      // component testbaar zonder een polyfill af te dwingen.
      if (typeof el?.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'start', behavior: 'auto' })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  // Sluiten ruimt de mislukt-melding op: hij hoort bij de handeling die de
  // gebruiker zojuist deed, niet bij het venster als toestand.
  const closeVenster = useCallback(() => {
    setOpen(null)
    setSaveError(null)
  }, [])

  const dailyRate = dailyExpenseRate(monthlyExpenses)

  // ── De drie cellen van de samenvatting ────────────────────────────────────
  // De grondslag staat als eigen subregel op ELKE cel (ADR 0103: een grondslag
  // die kan schuiven moet zich bekendmaken). Staat een budgetgrondslag onder
  // verdenking van afkapping, dan draagt die regel dat mee — dit is het
  // oppervlak waar het mogelijk te lage bedrag daadwerkelijk staat, dus de
  // waarschuwing mag niet uitsluitend in het detailvenster leven.
  const incomeFigure: FigureProps = {
    kicker: 'Geschat jaarinkomen',
    amount: <MaskedAmount value={annualIncome} tone="kern" monoWhenVisible={false} />,
    sub: basisSubLabel(incomeBasis, data.budgetIncome.truncationSuspected),
    sub2: `€${Math.round(monthlyIncome).toLocaleString('nl-NL')} per maand`,
  }
  const expensesFigure: FigureProps = {
    kicker: 'Geschatte uitgaven',
    amount: <MaskedAmount value={monthlyExpenses} tone="kern" monoWhenVisible={false} />,
    sub: basisSubLabel(expensesBasis, data.budgetExpenses.truncationSuspected),
    sub2: 'per maand',
  }
  const savingsFigure: FigureProps = {
    kicker: 'Spaarquote',
    amount: `${savingsRate}%`,
    variant: 'winner',
    sub: savingsBasisLabel,
    sub2: savingsSub,
  }

  return (
    <section className={hideHeading ? undefined : 'mt-5 sm:mt-8'}>
      {!hideHeading && (
        <header className="mb-4 space-y-1.5">
          <Kicker>Je instellingen</Kicker>
          <h2 className="font-display text-[17px] font-semibold leading-snug text-[var(--ink)] sm:text-[19px]">
            Waar je <em className="font-normal italic text-[var(--module-active-700)]">cijfers</em>{' '}
            op rusten
          </h2>
        </header>
      )}

      {/* Cijferstrook via de canonieke `FiguresStrip` (patroon-kaart
          *Figures-strip*) — niet met de hand nagebouwd: alleen de component
          brengt de Eenvoudig-reductie (naar 2 cellen, zoals élke andere strip op
          deze pagina) en de `data-figures-strip` print-hook mee.
          `simpleFigures` is expliciet, want de uitkomst-cel staat achteraan: in
          Eenvoudig blijven inkomen en spaarquote staan.
          De spaarquote is `variant: 'winner'` en krijgt daarmee als enige de
          highlight-marker — hij ís de uitkomst van de twee cellen ervoor. */}
      <div aria-busy={syncing || undefined}>
        <FiguresStrip
          cols={3}
          className={syncing ? 'opacity-60 transition-opacity' : 'transition-opacity'}
          figures={[incomeFigure, expensesFigure, savingsFigure]}
          simpleFigures={[incomeFigure, savingsFigure]}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[52ch] font-serif text-[13px] italic leading-relaxed text-[var(--ink-2)]">
          {dailyRate > 0 ? (
            <>
              Deze drie horen bij elkaar: wat binnenkomt, wat weggaat, en wat je daarmee
              aan vrijheid opbouwt. Eén dag vrijheid kost je nu{' '}
              <strong className="not-italic">{formatCurrency(dailyRate)}</strong>.
            </>
          ) : (
            <>
              Deze drie horen bij elkaar: wat binnenkomt, wat weggaat, en wat je daarmee
              aan vrijheid opbouwt.
            </>
          )}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen('income')}
          className="shrink-0 self-start sm:self-auto"
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden />
          Instellingen aanpassen
        </Button>
      </div>

      <ShellOverlay
        open={open !== null}
        onClose={closeVenster}
        kind="pane"
        title="Inkomen, uitgaven en spaarquote"
        primaryAction={{ label: 'Klaar', onClick: closeVenster }}
      >
        <div className="space-y-6">
          <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
            Deze drie horen bij elkaar. Je kiest per kant waar het getal vandaan komt;
            je spaarquote volgt daar vanzelf uit — dat is wat je aan vrijheid opbouwt.
          </p>

          <nav aria-label="Ga naar" className="flex flex-wrap gap-2">
            <JumpPill active={open === 'income'} onClick={() => setOpen('income')}>Inkomen</JumpPill>
            <JumpPill active={open === 'expenses'} onClick={() => setOpen('expenses')}>Uitgaven</JumpPill>
            <JumpPill active={open === 'savings'} onClick={() => setOpen('savings')}>Spaarquote</JumpPill>
          </nav>

          {/* ── Inkomen ───────────────────────────────────────────────── */}
          <BlockSection
            ref={incomeRef}
            kicker="Grondslag"
            heading="Waar komt je inkomen vandaan?"
            amount={<MaskedAmount value={annualIncome} tone="kern" />}
            amountSub={`€${Math.round(monthlyIncome).toLocaleString('nl-NL')} per maand · ${BASIS_LABEL[incomeBasis]}`}
          >
            <div role="radiogroup" aria-label="Grondslag voor je inkomen" className="space-y-2">
              <BasisOption
                name={`${radioName}-income`}
                checked={incomeOption === 'budget'}
                disabled={!data.budgetIncome.hasBudgets}
                label="Uit je budgetten"
                hint={
                  data.budgetIncome.hasBudgets
                    ? 'Wat er de afgelopen 12 maanden per post binnenkwam. Vink aan wat meetelt.'
                    : 'Je hebt nog geen inkomsten-budgetten om uit te rekenen.'
                }
                onSelect={() => chooseSource('income', 'budget')}
              >
                <BudgetKassabon
                  basis={data.budgetIncome}
                  excluded={excludedIncome}
                  onToggle={(id) => toggleEntry('income', id)}
                  annualTotal={budgetIncomeAnnual}
                  emptyNote="Je hebt alle posten uitgevinkt. We rekenen daarom voorlopig met je transacties — je inkomen komt zo nooit op €0 te staan."
                />
              </BasisOption>

              <BasisOption
                name={`${radioName}-income`}
                checked={incomeOption === 'transaction'}
                label="Uit je transacties"
                hint="Wat er de afgelopen 12 maanden werkelijk binnenkwam."
                onSelect={() => chooseSource('income', 'transaction')}
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
                        <span>Totaal (12 mnd)</span>
                        <span className="tabular-nums"><MaskedAmount value={twelveMonthIncome} tone="kern" /></span>
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--ink-meta)]">
                        ≈ €{Math.round(data.estimatedAnnualIncome / 12).toLocaleString('nl-NL')}/mnd
                      </p>
                    </div>
                  </div>
                </KassabonShell>
              </BasisOption>

              <BasisOption
                name={`${radioName}-income`}
                checked={incomeOption === 'manual'}
                label="Eigen bedrag"
                hint="Een vast bedrag dat je zelf invult. Beweegt niet mee."
                onSelect={() => chooseSource('income', 'manual')}
              >
                <ManualAmountInput
                  label="Netto per maand"
                  value={manualIncomeDraft}
                  onChange={setManualIncomeDraft}
                  onCommit={(v) => commitManual('income', v)}
                />
              </BasisOption>
            </div>

            {saveError === 'income' && <BlockNote live>{SAVE_ERROR_TEXT}</BlockNote>}

            {annualIncome > 0 && dailyRate > 0 && (
              <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
                Een jaar van dit inkomen is bij je huidige uitgaven{' '}
                <strong className="text-[var(--ink-2)]">
                  {formatFreedomTimeString(calculateFreedomTime(annualIncome, dailyRate))}
                </strong>{' '}
                vrijheid.
              </p>
            )}
          </BlockSection>

          {/* ── Uitgaven ──────────────────────────────────────────────── */}
          <BlockSection
            ref={expensesRef}
            kicker="Grondslag"
            heading="Waar komen je uitgaven vandaan?"
            amount={<MaskedAmount value={monthlyExpenses} tone="kern" />}
            amountSub={`per maand · ${BASIS_LABEL[expensesBasis]}`}
          >
            <div role="radiogroup" aria-label="Grondslag voor je uitgaven" className="space-y-2">
              <BasisOption
                name={`${radioName}-expenses`}
                checked={expensesOption === 'budget'}
                disabled={!data.budgetExpenses.hasBudgets}
                label="Uit je budgetten"
                hint={
                  data.budgetExpenses.hasBudgets
                    ? 'Wat je de afgelopen 12 maanden per post uitgaf. Vink aan wat meetelt.'
                    : 'Je hebt nog geen uitgaven-budgetten om uit te rekenen.'
                }
                onSelect={() => chooseSource('expenses', 'budget')}
              >
                <BudgetKassabon
                  basis={data.budgetExpenses}
                  excluded={excludedExpense}
                  onToggle={(id) => toggleEntry('expenses', id)}
                  annualTotal={budgetExpensesAnnual}
                  emptyNote="Je hebt alle posten uitgevinkt. We rekenen daarom voorlopig met je transacties — je uitgaven komen zo nooit op €0 te staan."
                />
              </BasisOption>

              <BasisOption
                name={`${radioName}-expenses`}
                checked={expensesOption === 'transaction'}
                label="Uit je transacties"
                hint="Het gemiddelde over de afgelopen 6 maanden."
                onSelect={() => chooseSource('expenses', 'transaction')}
              >
                <KassabonShell>
                  <div className="space-y-1.5">
                    {sixMonth.months.map((m, i) => (
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
                        <span className="tabular-nums"><MaskedAmount value={sixMonth.expenses} tone="kern" /></span>
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--ink-meta)]">
                        ≈ €{Math.round(data.computedMonthlyExpenses).toLocaleString('nl-NL')}/mnd
                      </p>
                    </div>
                  </div>
                </KassabonShell>
              </BasisOption>

              <BasisOption
                name={`${radioName}-expenses`}
                checked={expensesOption === 'manual'}
                label="Eigen bedrag"
                hint="Wat je maandelijks écht kwijt bent — inclusief je hypotheeklast, zonder wat je naar spaar- of beleggingspotjes overmaakt."
                onSelect={() => chooseSource('expenses', 'manual')}
              >
                <ManualAmountInput
                  label="Per maand"
                  value={manualExpensesDraft}
                  onChange={setManualExpensesDraft}
                  onCommit={(v) => commitManual('expenses', v)}
                />
              </BasisOption>
            </div>

            {saveError === 'expenses' && <BlockNote live>{SAVE_ERROR_TEXT}</BlockNote>}

            {dailyRate > 0 && (
              <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
                Dit bepaalt je dagtarief: één dag vrijheid kost je{' '}
                <strong className="text-[var(--ink-2)]">{formatCurrency(dailyRate)}</strong>. Elke
                euro die je niet uitgeeft, koop je terug als tijd.
              </p>
            )}
          </BlockSection>

          {/* ── Spaarquote ────────────────────────────────────────────── */}
          <BlockSection
            ref={savingsRef}
            kicker="Uitkomst"
            heading="Wat je overhoudt aan vrijheid"
            amount={`${savingsRate}%`}
            amountSub={`${savingsBasisLabel} · ${savingsSub}`}
          >
            <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
              Je spaarquote is geen aparte instelling: hij volgt uit de twee grondslagen
              hierboven — inkomen <em>{BASIS_LABEL[incomeBasis]}</em>, uitgaven{' '}
              <em>{BASIS_LABEL[expensesBasis]}</em>. Wil je hem veranderen, verander dan
              wat je verdient of wat je uitgeeft.
            </p>

            {showTxReceipt && (
              <KassabonShell>
                <div className="space-y-1.5">
                  {sixMonth.months.map((m, i) => {
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
                  <div className="flex items-center justify-between"><span>Σ Inkomen (6 mnd)</span><span className="tabular-nums"><MaskedAmount value={sixMonth.income} tone="kern" /></span></div>
                  <div className="flex items-center justify-between"><span>Σ Uitgaven (6 mnd)</span><span className="tabular-nums">−<MaskedAmount value={sixMonth.expenses} tone="kern" /></span></div>
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
                        value={sixMonth.saved + data.savingsBudgetTotal6m + data.debtAflossingTotal6m}
                        tone="kern"
                        signPrefix={(sixMonth.saved + data.savingsBudgetTotal6m + data.debtAflossingTotal6m) >= 0 ? '+' : ''}
                      />
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-1.5 font-bold">
                    {/* De 6-maands transactiequote: het getal dat uit DEZE rijen
                        volgt, inclusief de correcties hierboven. */}
                    <span>Spaarquote</span><span className="tabular-nums">{transactionSavingsRate}%</span>
                  </div>
                </div>
              </KassabonShell>
            )}

            {showDerivedReceipt && (
              <KassabonShell>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span>Inkomen (per maand)</span>
                    <span className="tabular-nums"><MaskedAmount value={monthlyIncome} tone="kern" /></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Uitgaven (per maand)</span>
                    <span className="tabular-nums">−<MaskedAmount value={monthlyExpenses} tone="kern" /></span>
                  </div>
                  <div className="flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-1.5">
                    <span>Gespaard</span>
                    <span className="tabular-nums">
                      <MaskedAmount
                        value={monthlyIncome - monthlyExpenses}
                        tone="kern"
                        signPrefix={monthlyIncome - monthlyExpenses >= 0 ? '+' : ''}
                      />
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-1.5 font-bold">
                    <span>Spaarquote</span><span className="tabular-nums">{savingsRate}%</span>
                  </div>
                </div>
              </KassabonShell>
            )}

            {showEstimateNote && (
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
                    <span>Spaarquote</span><span className="tabular-nums">{savingsRate}%</span>
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
                {showTxReceipt ? (
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
                  Bron op dit moment: inkomen {BASIS_LABEL[incomeBasis]}, uitgaven{' '}
                  {BASIS_LABEL[expensesBasis]}
                  {showEstimateNote
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
      </ShellOverlay>
    </section>
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
 */
function BlockSection({
  ref,
  kicker,
  heading,
  amount,
  amountSub,
  children,
}: {
  ref?: React.Ref<HTMLElement>
  kicker: string
  heading: string
  amount: React.ReactNode
  amountSub: string
  children: React.ReactNode
}) {
  return (
    <section ref={ref} className="scroll-mt-4 space-y-3 border-t border-[var(--border-ed)] pt-5">
      <Kicker size="small">{kicker}</Kicker>
      <h2 className="font-display text-[15px] font-semibold leading-snug text-[var(--ink)]">
        {heading}
      </h2>
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
  // `realizedWindowMonths` is de BREEDTE van het venster dat de rekenkant
  // bevraagt en staat altijd op 12 (REALIZED_WINDOW_MONTHS) — daarop toetsen was
  // dode code. Wat de gebruiker wil weten is hoeveel maanden er werkelijk data
  // ONDER zijn cijfer zit, en dat staat per post in `realizedMonths`. De
  // langstlopende post bepaalt de bovengrens van het totaal.
  const windowMonths = basis.realizedWindowMonths
  const measuredMonths = basis.entries.reduce(
    (max, e) => (e.source === 'realized' ? Math.max(max, e.realizedMonths) : max),
    0,
  )
  return (
    <>
      <KassabonShell>
        <div className="space-y-1.5">
          {basis.entries.map((entry) => {
            const off = excluded.has(entry.id)
            const meta = entryMeta(entry, windowMonths)
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
                  // Bewust niet méér — het budgetoverzicht is een eigen pagina.
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
            {measuredMonths > 0 && measuredMonths < windowMonths && (
              <p className="mt-1 font-serif text-[10px] italic leading-snug text-[var(--ink-3)]">
                Gemeten over {measuredMonths} {measuredMonths === 1 ? 'maand' : 'maanden'} en
                doorgerekend naar een heel jaar.
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
 * "Uit je budgetten" betekent: wat er de afgelopen 12 maanden werkelijk op deze
 * post is binnengekomen of uitgegeven. Alleen zonder transacties valt een post
 * terug op zijn geplande limiet — en dát is een zwakker getal, dus dat zegt de
 * regel expliciet. Waar realisatie en planning uiteenlopen, toont hij de
 * planning erbij: dat verschil ís de informatie (je geeft structureel meer of
 * minder uit dan je begrootte). Eén regel, nooit meer.
 */
const PLANNED_DEVIATION_THRESHOLD = 0.05

function entryMeta(entry: BudgetBasisEntry, windowMonths: number): string | null {
  if (entry.source === 'planned') {
    return entry.realizedMonths === 0
      ? 'gepland — nog geen transacties gelogd'
      : 'gepland'
  }

  const parts: string[] = []
  if (entry.realizedMonths > 0 && entry.realizedMonths < windowMonths) {
    parts.push(
      `gemeten over ${entry.realizedMonths} ${entry.realizedMonths === 1 ? 'maand' : 'maanden'}`,
    )
  }
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
 * voor een mislukte schrijfactie — bewust geen tweede, alarmerender systeem met
 * een rode banner voor iets dat de gebruiker gewoon opnieuw kan doen.
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
