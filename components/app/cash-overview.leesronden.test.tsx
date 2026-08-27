/**
 * Leesronden van CashOverview ná hydratatie.
 *
 * Dit oppervlak vuurde bij het monteren een reeks eigen queries af, met daarin
 * twee zichtbare dubbelingen: `bank_accounts` werd twee keer gelezen (één keer
 * voor de rekeningkaarten, één keer voor de asset→rekening-map) en er stonden
 * twee losse bestaans-checks op `transactions` naast elkaar. Beide zijn nu één
 * ronde.
 *
 * Deze suite telt de leesronden ECHT — via een opnemende Supabase-stub, niet via
 * een broncontrole — en houdt tegelijk vast wat er semantisch aan vast zit:
 *   • de rekeningkaarten blijven perspectief-versmald (in de brede modus gebeurt
 *     dat ná het ophalen, want de map heeft de ongefilterde set nodig);
 *   • de twee afgeleide vlaggen (90-dagen-activiteit, transacties-in-andere-maand)
 *     komen uit die ene datum.
 *
 * Tellen gebeurt per ROL, niet per tabelnaam — zie `bankReads()`. `bank_accounts`
 * draagt namelijk twee ongelijke vragen: de kaartenlijst-ronde en de losse
 * archief-opzoeking. Een kale telling op de tabel zou die twee op één hoop gooien
 * en met elke volgende query moeten meebewegen; dan bewaakt hij niets meer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { CashOverview, budgetTrackedBankByAsset } from './cash-overview'

// Peildatum 15 juni 2026 → 90-dagengrens = 17 maart 2026.
const NOW = new Date(2026, 5, 15)

type Op = { name: string; args: unknown[] }
type Query = { table: string; columns: string; ops: Op[] }

const { queries, perspectiveData, latestDate, archiveRow } = vi.hoisted(() => ({
  queries: { value: [] as Query[] },
  perspectiveData: { value: { assets: [] as unknown[] } },
  latestDate: { value: null as string | null },
  /** De archief-rekening, of `null` = nog nooit een rekening verwijderd. */
  archiveRow: { value: null as { id: string } | null },
}))

const BANK_ROWS = [
  {
    id: 'ba-eigen',
    name: 'Eigen betaalrekening',
    bank_name: 'ING',
    account_type: 'checking',
    balance: 1000,
    is_active: true,
    sort_order: 1,
    linked_asset_id: 'asset-eigen',
    ownership: 'personal',
    linked_asset: { has_budget_tracking: true },
  },
  {
    id: 'ba-gedeeld',
    name: 'Gezamenlijke rekening',
    bank_name: 'ING',
    account_type: 'checking',
    balance: 2000,
    is_active: true,
    sort_order: 2,
    linked_asset_id: 'asset-gedeeld',
    ownership: 'shared',
    linked_asset: { has_budget_tracking: true },
  },
]

/**
 * Cash-bezitting van de gedeelde huishoudrekening, zoals de perspectief-loader
 * 'm ook in het PERSOONLIJKE perspectief levert (RLS geeft eigen + gedeeld).
 * Zijn `bank_accounts`-rij valt daar juist wél buiten de kaartenlijst — dat
 * verschil is de kern van de map-invariant.
 */
const GEDEELD_CASH_ASSET = {
  id: 'asset-gedeeld',
  name: 'Gezamenlijke rekening',
  asset_type: 'cash',
  is_active: true,
  current_value: 2000,
  ownership: 'shared',
  _provenance: 'gezamenlijk',
  _myShareFraction: 0.5,
}

// ── Module-mocks ─────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/overzicht/cashflow',
}))

vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal' as const }),
}))

vi.mock('@/components/app/toast-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/toast-provider')>()),
  useToast: () => ({ addToast: vi.fn() }),
}))

vi.mock('@/lib/own-accounts-ibans', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/own-accounts-ibans')>()),
  fetchOwnAccountIbans: () => Promise.resolve({ accounts: [], unreadable: 0 }),
}))

vi.mock('@/lib/load-entity-sparklines', () => ({
  loadEntitySparklines: () => Promise.resolve({}),
}))

// De rekeningdetail-overlay (lazy geladen) en het bezittings-paneel zijn de twee
// bestemmingen van een klik op een rekeningkaart. Als stubs zijn ze
// onderscheidbaar zonder hun echte gewicht mee te slepen.
vi.mock('@/components/app/cash-account-view', () => ({
  CashAccountView: ({ accountId }: { accountId: string }) => (
    <div data-testid="rekeningdetail">{accountId}</div>
  ),
}))

vi.mock('@/components/app/core/assets/asset-pane', () => ({
  AssetPane: () => <div data-testid="bezittingspaneel" />,
}))

vi.mock('@/lib/household/perspective-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/household/perspective-loader')>()),
  // `context` hoort bij het contract van `PerspectiveData`; het oppervlak leest
  // er `userId` uit om Bewerken/Verwijderen op andermans rij te verbergen.
  // Weglaten geeft geen assertie-fout maar een afgekapte `loadAllCashRekeningen`.
  loadPerspectiveData: () =>
    Promise.resolve({
      ...perspectiveData.value,
      debts: [],
      budgets: [],
      context: { userId: 'gebruiker-1' },
    }),
}))

/**
 * Opnemende Supabase-stub: legt per query de tabel, de kolomlijst en de keten
 * van filters vast, en beantwoordt hem op vorm. Zonder deze registratie zou een
 * telling van leesronden alleen maar een aanname zijn.
 */
vi.mock('@/lib/supabase/client', () => {
  const makeBuilder = (table: string) => {
    const query: Query = { table, columns: '', ops: [] }
    const builder: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => {
      query.ops.push({ name, args })
      return builder
    }
    builder.select = (columns: string) => {
      query.columns = columns
      queries.value.push(query)
      return builder
    }
    for (const name of ['eq', 'gte', 'lte', 'lt', 'in', 'order', 'limit', 'range']) {
      builder[name] = chain(name)
    }
    // `maybeSingle()` sluit de keten zélf af (één rij of `null`, geen array) en
    // gaat dus buiten `then` om. De archief-opzoeking is de enige afnemer.
    builder.maybeSingle = () => {
      query.ops.push({ name: 'maybeSingle', args: [] })
      return Promise.resolve({
        data: table === 'bank_accounts' ? archiveRow.value : null,
        error: null,
      })
    }
    builder.then = (resolve: (v: { data: unknown[]; error: null }) => void) => {
      if (table === 'bank_accounts') return resolve({ data: BANK_ROWS, error: null })
      if (table === 'transactions' && query.ops.some((o) => o.name === 'limit')) {
        return resolve({
          data: latestDate.value ? [{ date: latestDate.value }] : [],
          error: null,
        })
      }
      return resolve({ data: [], error: null })
    }
    return builder
  }
  return { createClient: () => ({ from: (table: string) => makeBuilder(table) }) }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function tableReads(table: string) {
  return queries.value.filter((q) => q.table === table)
}

const filtersOn = (q: Query, column: string) =>
  q.ops.some((o) => o.name === 'eq' && o.args[0] === column)

/**
 * De `bank_accounts`-leesronden uitgesplitst naar ROL. Er zijn er precies twee,
 * en ze meten iets anders:
 *
 *  • `kaartenlijst` (`is_active = true`) — de winst van T3.5: één ronde voedt
 *    zowel de rekeningkaarten als de asset→rekening-map. Dit is de invariant.
 *  • `archief` (`is_archive_bucket = true`) — één rij die alléén de
 *    aggregatie-ids voedt; per definitie inactief en dus buiten de kaartenlijst.
 *
 * Rollen tellen i.p.v. tabelrijen is bewust. `toHaveLength(2)` op de tabel zou
 * de kaartenlijst-dubbeling weer laten passeren zodra er een derde vraag
 * bijkomt; nu landt élke niet-herkende query in `overig` en wordt de suite
 * rood — een nieuwe leesronde is dan een expliciete keuze, geen bijvangst.
 */
function bankReads() {
  const all = tableReads('bank_accounts')
  const archief = all.filter((q) => filtersOn(q, 'is_archive_bucket'))
  const kaartenlijst = all.filter(
    (q) => !filtersOn(q, 'is_archive_bucket') && filtersOn(q, 'is_active'),
  )
  return {
    all,
    archief,
    kaartenlijst,
    overig: all.filter((q) => !archief.includes(q) && !kaartenlijst.includes(q)),
  }
}

/**
 * Wacht tot de component is uitgepraat: blijf micro-taken flushen tot er geen
 * query meer bijkomt. Zónder dit slaagt een `waitFor(... toHaveLength(1))` al op
 * het moment dat de eerste ronde binnen is en glipt een teruggekeerde tweede
 * ronde er ongemerkt doorheen — gemeten, niet aangenomen: de bijt-proef op de
 * herintroductie van de tweede `bank_accounts`-query bleef daardoor groen.
 */
async function settle() {
  let previous = -1
  for (let i = 0; i < 25 && previous !== queries.value.length; i++) {
    previous = queries.value.length
    await act(async () => {
      await Promise.resolve()
    })
  }
}

function renderOverzicht(props: Parameters<typeof CashOverview>[0] = {}) {
  return render(
    <DisplayModeProvider initialMode="full">
      <CashOverview {...props} />
    </DisplayModeProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  queries.value = []
  perspectiveData.value = { assets: [] }
  latestDate.value = null
  archiveRow.value = null
})

afterEach(() => {
  vi.useRealTimers()
})

// ── bank_accounts: één ronde voor twee afnemers ──────────────────────────────

describe('CashOverview — bank_accounts in één leesronde', () => {
  it('leest de kaartenlijst één keer in de brede modus, mét het tracking-veld', async () => {
    renderOverzicht({ showAllCashAccounts: true })
    await settle()
    const reads = bankReads()
    expect(reads.kaartenlijst).toHaveLength(1)
    expect(reads.overig).toEqual([])

    const q = reads.kaartenlijst[0]
    expect(q.columns).toContain('linked_asset:assets!bank_accounts_linked_asset_id_fkey')
    // Kolomregel: nooit `*` op een tabel met crypto-kolommen.
    expect(q.columns).not.toContain('*')
    // De asset→rekening-map heeft de ONGEFILTERDE set nodig; een
    // ownership-filter in de query zou de gedeelde huishoudrekening eruit
    // knippen en de map onvolledig maken.
    expect(q.ops.filter((o) => o.name === 'eq').map((o) => o.args[0])).not.toContain('ownership')
  })

  it('leest de kaartenlijst één keer in de smalle modus, zónder het tracking-veld', async () => {
    renderOverzicht()
    await settle()
    const reads = bankReads()
    expect(reads.kaartenlijst).toHaveLength(1)
    expect(reads.overig).toEqual([])

    const q = reads.kaartenlijst[0]
    // `linked_asset_id` blijft; de embedded join (`linked_asset:assets!…`) niet.
    expect(q.columns).not.toContain('linked_asset:')
    expect(q.columns).not.toContain('*')
    // Zonder map is er geen reden de gedeelde rijen op te halen: het
    // perspectief versmalt hier gewoon in de query.
    expect(q.ops).toContainEqual({ name: 'eq', args: ['ownership', 'personal'] })
  })

  it('versmalt het persoonlijke perspectief op OWNERSHIP, niet op rekening (H6)', async () => {
    renderOverzicht({ showAllCashAccounts: true })
    await settle()

    const txReads = tableReads('transactions')
    expect(txReads.length).toBeGreaterThan(0)

    // SINDS H6: geen rekening-witlijst meer. De strip telde daardoor een andere
    // verzameling dan de canonieke maandmotor (`deriveRealMonthTotals`), die
    // alle RLS-zichtbare rijen leest — een van de vier assen achter bevinding
    // H6. Eigenaarsbesluit 26-08-2026: scoping los, historische maandcijfers
    // mogen zichtbaar verschuiven.
    expect(txReads.some((q) => q.ops.some((o) => o.name === 'in'))).toBe(false)

    // Wat WÉL blijft: het perspectief. Dat is geen rekening-scoping maar de as
    // waarop de hele pagina draait; los je die ook op, dan lekken partner-rijen
    // in het persoonlijke beeld.
    for (const q of txReads) {
      expect(q.ops).toContainEqual({ name: 'eq', args: ['ownership', 'personal'] })
    }
  })

  it('een gedeelde rekening opent de rekeningdetail, niet het bezittings-paneel', async () => {
    // De invariant achter het weghalen van het server-side ownership-filter:
    // de map moet de gedeelde huishoudrekening kennen, óók in het persoonlijke
    // perspectief waar zijn `bank_accounts`-rij níét in de kaartenlijst valt.
    // Zou de map uit de versmalde set gebouwd worden, dan levert
    // `detailBankAccountIdForAsset` niets en opent deze klik het bezittings-
    // paneel — een echte gedragsregressie, die deze test vangt.
    perspectiveData.value = { assets: [GEDEELD_CASH_ASSET] }
    renderOverzicht({ showAllCashAccounts: true, embedded: true })
    await settle()

    fireEvent.click(
      await screen.findByRole('button', { name: /Gezamenlijke rekening openen/ }),
    )
    expect(await screen.findByTestId('rekeningdetail')).toHaveTextContent('ba-gedeeld')
    expect(screen.queryByTestId('bezittingspaneel')).not.toBeInTheDocument()
  })

  it('houdt de archief-opzoeking een eigen rol: één rij, ongefilterd op actief en perspectief', async () => {
    renderOverzicht({ showAllCashAccounts: true })
    await settle()
    const { archief } = bankReads()
    expect(archief).toHaveLength(1)
    // Alleen het id: de rij hoeft niets aan de kaartenlijst te leveren.
    expect(archief[0].columns).toBe('id')
    expect(archief[0].ops).toContainEqual({ name: 'maybeSingle', args: [] })
    // De archiefrij staat per definitie op `is_active = false` en draagt de
    // historie van élke verwijderde rekening — van jou én van de gedeelde
    // huishoudrekening. Een `is_active`- of `ownership`-filter zou hem stil
    // wegfilteren en de geldstroomcijfers van afgelopen maanden laten schuiven.
    const gefilterdeKolommen = archief[0].ops
      .filter((o) => o.name === 'eq')
      .map((o) => o.args[0])
    expect(gefilterdeKolommen).toEqual(['is_archive_bucket'])
  })

  it('houdt de archiefrekening buiten de kaartenlijst; de aggregatie ziet hem structureel (H6)', async () => {
    archiveRow.value = { id: 'ba-archief' }
    renderOverzicht()
    await settle()

    // Eén kaartenlijst-ronde blijft één ronde, en het archief hoort daar niet in
    // — dat deel van de belofte is ongewijzigd.
    expect(bankReads().kaartenlijst).toHaveLength(1)
    expect(screen.queryByText(/archief/i)).toBeNull()

    // VÓÓR H6 werd `ba-archief` handmatig aan een `in('account_id', …)`-witlijst
    // geplakt zodat de bewaarde historie in de geldstroomcijfers bleef staan.
    // Die witlijst bestaat niet meer: de query leest alle RLS-zichtbare rijen,
    // dus archiefboekingen tellen nu vanzelf mee. Sterker dan de witlijst, want
    // die kon een rekening missen; deze assertie bewaakt dat er geen nieuwe
    // scoping insluipt die het archief opnieuw zou kunnen uitsluiten.
    expect(tableReads('transactions').some((q) => q.ops.some((o) => o.name === 'in'))).toBe(false)
  })

  it('bouwt de asset→rekening-map uit de ongefilterde set, inclusief gedeeld', () => {
    expect(budgetTrackedBankByAsset(BANK_ROWS)).toEqual({
      'asset-eigen': 'ba-eigen',
      'asset-gedeeld': 'ba-gedeeld',
    })
  })

  it('laat rekeningen zonder budget-tracking of zonder bezitting buiten de map', () => {
    expect(
      budgetTrackedBankByAsset([
        { ...BANK_ROWS[0], linked_asset: { has_budget_tracking: false } },
        { ...BANK_ROWS[1], linked_asset_id: null },
      ]),
    ).toEqual({})
  })
})

// ── transactions: één bestaans-check voor twee vlaggen ───────────────────────

describe('CashOverview — één bestaans-check voor twee vlaggen', () => {
  it('stelt precies één datum-vraag: de recentste transactie', async () => {
    latestDate.value = '2026-06-01'
    renderOverzicht()
    await settle()

    const existence = tableReads('transactions').filter((q) => q.ops.some((o) => o.name === 'limit'))
    expect(existence).toHaveLength(1)
    expect(existence[0].columns).toBe('date')
    expect(existence[0].ops).toContainEqual({ name: 'order', args: ['date', { ascending: false }] })
    // De oude tweede check was een `gte(date, 90-dagengrens).limit(1)` op `id`.
    expect(existence.some((q) => q.columns === 'id')).toBe(false)
  })

  it('recente transactie → geen 90-dagen-lege-staat, wél de andere-maand-hint', async () => {
    latestDate.value = '2026-06-01' // binnen 90 dagen, buiten de lege maand
    renderOverzicht()
    await waitFor(() => expect(screen.getByTestId('other-month-hint')).toBeInTheDocument())
    expect(screen.queryByTestId('cashflow-empty-90d')).not.toBeInTheDocument()
    expect(screen.getByTestId('go-to-latest-tx')).toBeInTheDocument()
  })

  it('recentste transactie ouder dan 90 dagen → lege-staat vervangt het blok', async () => {
    latestDate.value = '2026-01-05'
    renderOverzicht()
    await waitFor(() => expect(screen.getByTestId('cashflow-empty-90d')).toBeInTheDocument())
    expect(screen.queryByTestId('other-month-hint')).not.toBeInTheDocument()
  })

  it('precies op de 90-dagengrens telt nog als activiteit', async () => {
    latestDate.value = '2026-03-17' // 15 juni 2026 minus 90 dagen
    renderOverzicht()
    await waitFor(() => expect(screen.getByTestId('other-month-hint')).toBeInTheDocument())
    expect(screen.queryByTestId('cashflow-empty-90d')).not.toBeInTheDocument()
  })

  it('één dag vóór de grens niet meer', async () => {
    latestDate.value = '2026-03-16'
    renderOverzicht()
    await waitFor(() => expect(screen.getByTestId('cashflow-empty-90d')).toBeInTheDocument())
  })

  it('helemaal geen transacties → lege-staat, geen hint', async () => {
    latestDate.value = null
    renderOverzicht()
    await waitFor(() => expect(screen.getByTestId('cashflow-empty-90d')).toBeInTheDocument())
    expect(screen.queryByTestId('other-month-hint')).not.toBeInTheDocument()
  })
})
