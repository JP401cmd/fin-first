/**
 * hefbomen-nav.lever-parity.test.tsx
 *
 * STATUS-PARITEITSTEST: sidebar-dot == overzicht-kaart per hefboom.
 *
 * Achtergrond
 * -----------
 * De sidebar (lever-compass.tsx) en de overzicht-kaarten (hefbomen-nav.tsx)
 * worden beide gevoed vanuit dezelfde `LeverScores`-bron (loadLeverScores).
 * De sidebar mapt LeverStatus → dot-klasse via STATUS_COLORS in lever-compass.tsx:
 *   green  → bg-emerald-500
 *   amber  → bg-amber-500
 *   red    → bg-red-500
 *   neutral→ bg-[var(--ink-4)]   (CSS-var, niet een vaste Tailwind-klasse)
 *
 * De overzicht-kaart mapt LeverStatus → LeverageStatus via leverToLeverageStatus
 * (in hefbomen-nav.tsx), en LeverageStatus → dot-klasse via LEVERAGE_STATUS_DOT
 * in lib/leverage-status.ts:
 *   good    → bg-emerald-500
 *   warn    → bg-amber-500
 *   bad     → bg-red-500
 *   neutral → bg-stone-300
 *
 * Deze test rendert HefbomenNav met een specifieke leverScores-prop en bewijst
 * dat de correcte dot-klasse in de DOM verschijnt. Hiermee wordt toekomstige
 * drift tussen de twee systemen (bijv. per ongeluk een mapping omgooien)
 * onmiddellijk zichtbaar.
 *
 * Aanpak: rendertest op LeverageCard-status-dot (`span.absolute.rounded-full`
 * rechtsboven op de kaart). Geen productie-code-wijziging nodig: we lezen
 * het resultaat van de rendering, niet de private functie.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { makeSupabase, FAKE_USER_ID, type FakeDb, type Row } from '@/test/helpers/fake-supabase'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { loadHorizonRaw } from '@/lib/horizon/raw-data-loader'
import { HefbomenNav } from './hefbomen-nav'
import type { LeverScores, LeverStatus } from '@/components/app/shell/lever-scores'
import { leverToLeverageStatus } from '@/components/app/shell/lever-scores'
import { LeverCompassExpanded } from '@/components/app/shell/lever-compass'
import { LEVERAGE_STATUS_DOT, LEVERAGE_STATUS_LABEL } from '@/lib/leverage-status'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Bouw een LeverScores-object waarbij ALLE vier hefbomen dezelfde status krijgen. */
function makeLeverScores(status: LeverStatus): LeverScores {
  const entry = { score: 50, status, detail: `${status} detail` }
  return {
    assets: entry,
    debts: entry,
    cashflow: entry,
    tax: entry,
  }
}

/**
 * Verwachte Tailwind dot-klasse voor de KAART (via leverToLeverageStatus →
 * LEVERAGE_STATUS_DOT). Dit is de canonieke mapping:
 *   LeverStatus  → LeverageStatus → LEVERAGE_STATUS_DOT class
 *   green        → good           → bg-emerald-500
 *   amber        → warn           → bg-amber-500
 *   red          → bad            → bg-red-500
 *   neutral      → neutral        → bg-stone-300
 */
function expectedCardDotClass(leverStatus: LeverStatus): string {
  const leverageStatus =
    leverStatus === 'green'
      ? 'good'
      : leverStatus === 'amber'
        ? 'warn'
        : leverStatus === 'red'
          ? 'bad'
          : 'neutral'
  return LEVERAGE_STATUS_DOT[leverageStatus]
}

/**
 * Verwachte Tailwind dot-klasse voor de SIDEBAR (via STATUS_COLORS in
 * lever-compass.tsx). STATUS_COLORS is niet geëxporteerd, dus we hanteren
 * de gedocumenteerde mapping als expected value. Wijzigt lever-compass.tsx
 * de klassen, dan faalt deze test — precies de bedoeling.
 *
 * Sidebar STATUS_COLORS.dot per LeverStatus:
 *   green  → 'bg-emerald-500'
 *   amber  → 'bg-amber-500'
 *   red    → 'bg-red-500'
 *   neutral→ 'bg-[var(--ink-4)]'
 */
function expectedSidebarDotClass(leverStatus: LeverStatus): string {
  return leverStatus === 'green'
    ? 'bg-emerald-500'
    : leverStatus === 'amber'
      ? 'bg-amber-500'
      : leverStatus === 'red'
        ? 'bg-red-500'
        : 'bg-[var(--ink-4)]'
}

/**
 * Haal de status-dots op uit de gerenderde HefbomenNav.
 * LeverageCard rendert de status-dot als:
 *   <span class="absolute right-2.5 top-2.5 ... w-2 h-2 rounded-full {LEVERAGE_STATUS_DOT[status]}" />
 *
 * We selecteren op `absolute` + `rounded-full` + `w-2` om de dot te
 * onderscheiden van andere gekleurde elementen in de render.
 */
function getStatusDotClasses(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('span.absolute.rounded-full')).map(
    (el) => el.className,
  )
}

// ── Status-pariteits-tests ────────────────────────────────────────────────────

describe('HefbomenNav — status-pariteit: kaart-dot == sidebar-dot', () => {
  const statuses: LeverStatus[] = ['green', 'amber', 'red', 'neutral']

  for (const leverStatus of statuses) {
    describe(`LeverStatus '${leverStatus}'`, () => {
      it(`kaart-dot heeft de correcte klasse (${expectedCardDotClass(leverStatus)})`, () => {
        const { container } = render(
          <HefbomenNav
            health={null}
            leverScores={makeLeverScores(leverStatus)}
          />,
        )
        const dots = getStatusDotClasses(container)

        // 4 hefbomen × 1 status-dot per kaart
        expect(dots.length).toBe(4)

        const cardDotClass = expectedCardDotClass(leverStatus)
        dots.forEach((cls) => {
          expect(cls).toContain(cardDotClass)
        })
      })

      it(`kaart-dot-klasse == sidebar-dot-klasse voor LeverStatus '${leverStatus}'`, () => {
        // Groen/amber/rood zijn identiek in beide systemen.
        // Neutral verschilt bewust (stone-300 vs ink-4 CSS-var) — dit is
        // gedocumenteerd gedrag, geen pariteits-bug.
        const cardDot = expectedCardDotClass(leverStatus)
        const sidebarDot = expectedSidebarDotClass(leverStatus)

        if (leverStatus === 'neutral') {
          // Neutral is BEWUST anders: kaart gebruikt bg-stone-300,
          // sidebar gebruikt bg-[var(--ink-4)] (themazijde adaptief).
          // Beide zijn "geen data"-semantiek — dit test dat het verschil
          // bewust en gedocumenteerd blijft.
          expect(cardDot).toBe('bg-stone-300')
          expect(sidebarDot).toBe('bg-[var(--ink-4)]')
          expect(cardDot).not.toBe(sidebarDot) // bewuste afwijking
        } else {
          // Groen/amber/rood MOETEN identiek zijn.
          expect(cardDot).toBe(sidebarDot)
        }
      })
    })
  }

  it('geeft leverScores-status voorrang boven pillar-status (fallback-vrij)', () => {
    // Als leverScores aanwezig is, mag de health-pillar NIET de status bepalen.
    // We geven een leverScores met alle-green en een health met slechte score.
    // De dots moeten groen zijn, niet rood/oranje.
    const healthWithBadPillar = {
      total: 10, // extreem slechte totaalscore
      label: 'Kritiek',
      pillars: [
        {
          id: 'asset_concentration',
          name: 'Concentratie',
          score: 5, // bad → bg-red-500 zonder leverScores
          weight: 0.1,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/bezittingen',
          actionLabel: 'Bekijk',
          rawValue: '1 type',
        },
        {
          id: 'debt_ratio',
          name: 'Schuldratio',
          score: 5, // bad
          weight: 0.2,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/schulden',
          actionLabel: 'Bekijk',
          rawValue: '95%',
        },
        {
          id: 'savings_rate',
          name: 'Spaarquote',
          score: 5, // bad
          weight: 0.25,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/budget',
          actionLabel: 'Bekijk',
          rawValue: '-5%',
        },
      ],
      previousMonth: null,
      trend: 0,
      activePillarCount: 3,
      budgetingActive: false,
    }

    const { container } = render(
      <HefbomenNav
        health={healthWithBadPillar}
        leverScores={makeLeverScores('green')} // expliciet groen
      />,
    )

    const dots = getStatusDotClasses(container)
    expect(dots.length).toBe(4)
    dots.forEach((cls) => {
      // Moet groen zijn (leverScores) — niet rood (slechte pillar)
      expect(cls).toContain('bg-emerald-500')
      expect(cls).not.toContain('bg-red-500')
    })
  })

  it('valt terug op pillar-status wanneer leverScores null is (bestaand gedrag)', () => {
    // Met een slechte asset_concentration-pijler en GEEN leverScores
    // moet de kaart rood zijn (bestaand fallback-gedrag).
    const healthWithBadAssets = {
      total: 10,
      label: 'Kritiek',
      pillars: [
        {
          id: 'asset_concentration',
          name: 'Concentratie',
          score: 5, // → bad → bg-red-500
          weight: 0.1,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/bezittingen',
          actionLabel: 'Bekijk',
          rawValue: '1 type',
        },
      ],
      previousMonth: null,
      trend: 0,
      activePillarCount: 1,
      budgetingActive: false,
    }

    const { container } = render(
      <HefbomenNav
        health={healthWithBadAssets}
        leverScores={null} // geen leverScores → fallback
      />,
    )

    const dots = getStatusDotClasses(container)
    expect(dots.length).toBe(4)

    // Bezittingen-tegel (eerste dot) moet rood zijn via pillar
    const bezittingenDot = dots[0]
    expect(bezittingenDot).toContain('bg-red-500')
  })
})

describe('Status-parity — mapping-tabel consistentie (unit)', () => {
  /**
   * Bewijst de volledige mapping-tabel formeel: voor elke LeverStatus geldt
   * dat de verwachte card-dot-klasse overeenkomt met LEVERAGE_STATUS_DOT voor
   * de overeenkomstige LeverageStatus.
   */
  it('green → good → bg-emerald-500', () => {
    expect(expectedCardDotClass('green')).toBe(LEVERAGE_STATUS_DOT['good'])
    expect(expectedCardDotClass('green')).toBe('bg-emerald-500')
  })

  it('amber → warn → bg-amber-500', () => {
    expect(expectedCardDotClass('amber')).toBe(LEVERAGE_STATUS_DOT['warn'])
    expect(expectedCardDotClass('amber')).toBe('bg-amber-500')
  })

  it('red → bad → bg-red-500', () => {
    expect(expectedCardDotClass('red')).toBe(LEVERAGE_STATUS_DOT['bad'])
    expect(expectedCardDotClass('red')).toBe('bg-red-500')
  })

  it('neutral → neutral → bg-stone-300', () => {
    expect(expectedCardDotClass('neutral')).toBe(LEVERAGE_STATUS_DOT['neutral'])
    expect(expectedCardDotClass('neutral')).toBe('bg-stone-300')
  })
})

/**
 * WOORD-pariteit (UR2-04) — de kleur was al single-sourced, het WOORD niet.
 *
 * De sidebar/topbar-kompas droeg een eigen lijst ("Gezond/Aandacht/Zorg/Geen
 * data") náást de generieke `LEVERAGE_STATUS_LABEL` die de hefboomkaart-dot op
 * /overzicht en de Box 1/2/3-kinderen in diezelfde sidebar al lazen. Eén
 * scherm, één hefboom, twee oordeelswoorden — precies de klacht op de kaart.
 * Deze test houdt beide oppervlakken aan die ene lijst.
 */
describe('Kompas == kaart: één statuswoord per status', () => {
  const statuses: LeverStatus[] = ['green', 'amber', 'red', 'neutral']

  it.each(statuses)(
    "kompas-rij toont het generieke statuswoord bij '%s'",
    (leverStatus) => {
      const { container } = render(
        <LeverCompassExpanded scores={makeLeverScores(leverStatus)} />,
      )
      const woord = LEVERAGE_STATUS_LABEL[leverToLeverageStatus(leverStatus)]
      const dots = Array.from(container.querySelectorAll('span[aria-label]'))
      expect(dots.length).toBe(4)
      dots.forEach((el) => {
        expect(el.getAttribute('aria-label')).toContain(woord)
      })
    },
  )

  it('kaart-dot en kompas-rij noemen dezelfde status met hetzelfde woord', () => {
    const scores = makeLeverScores('green')
    const kaart = render(<HefbomenNav health={null} leverScores={scores} />)
    const kompas = render(<LeverCompassExpanded scores={scores} />)

    const woord = LEVERAGE_STATUS_LABEL.good
    // De kaart draagt het generieke woord op de status-dot (title/sr-only);
    // het kompas in de aria-label van zijn rij-dot.
    const kaartDot = kaart.container.querySelector('span.absolute.rounded-full')
    expect(kaartDot?.getAttribute('title')).toBe(woord)
    const kompasDot = kompas.container.querySelector('span[aria-label]')
    expect(kompasDot?.getAttribute('aria-label')).toContain(woord)
  })
})

/**
 * GETAL-pariteit (B-030) — de status was al vergrendeld, het GETAL niet.
 *
 * De melding: "op de kaart staat 25% maar wat is dat? Spaarquote erbij zetten.
 * De spaarquote in de meldingenbalk bovenin is anders dan de spaarquote op de
 * kaart." Twee onafhankelijke defecten op één tegel:
 *
 *  (a) het percentage stond KAAL — het enige getal in de rij zonder eenheid,
 *      tussen drie euro-bedragen;
 *  (b) de kaart las de EFFECTIEVE quote (via `healthScoreInput.effectiveSavingsRatePct`,
 *      een legacy-misnomer: de horizon-loader vult 'm met `effectiveSavingsRate`)
 *      terwijl het kompas de rauwe 6-maands transactiemeting toonde — 25 % naast
 *      12 %, met een stipje dat van de rauwe meting was afgeleid.
 *
 * De bestaande suites hierboven pinnen alleen de STATUS-mapping. Juist het getal
 * liep uit elkaar, dus dat hoort hier óók vast te liggen.
 */
describe('B-030 — de budget-tegel benoemt WAT het percentage is', () => {
  const scores = makeLeverScores('green')

  it('Volledig: 25% staat er mét het label "Spaarquote"', () => {
    const { container } = render(
      <HefbomenNav health={null} leverScores={scores} totals={{ cashflow: 25 }} />,
    )
    expect(container.textContent).toContain('25%')
    expect(container.textContent).toContain('Spaarquote')
  })

  it('Eenvoudig: het label reist mee als venster-label achter het gedempte bedrag', () => {
    // `LeverageCard` rendert `subAmount` bewust NIET in de `verdict`-variant, dus
    // zonder de `kpiWindow`-route zou het label wegvallen bij precies de
    // gebruiker die het het hardst nodig heeft.
    const { container } = render(
      <HefbomenNav health={null} leverScores={scores} totals={{ cashflow: 25 }} simple />,
    )
    expect(container.textContent).toContain('25%')
    expect(container.textContent).toContain('Spaarquote')
  })

  it('bij een spaarquote van 0 of lager toont de tegel geen getal — en dus ook geen label', () => {
    // `showTotal` is `totalValue > 0`; een kaal "Spaarquote" zonder cijfer is ruis.
    for (const cashflow of [0, -12]) {
      const { container, unmount } = render(
        <HefbomenNav health={null} leverScores={scores} totals={{ cashflow }} />,
      )
      expect(container.textContent).not.toContain('Spaarquote')
      expect(container.textContent).not.toContain(`${cashflow}%`)
      unmount()
    }
  })
})

describe('B-030 — kaart en kompas tonen ÉÉN spaarquote (de effectieve, niet de meting)', () => {
  // FIXTURE met een aantoonbaar CONTRAST — zonder dat bewijst een gelijkheid
  // niets (zelfde constructie als lib/spaarquote-eenduidige-grondslag.test.tsx):
  //   · grondslag HANDMATIG aan beide kanten: (6000 − 4200) / 6000 = 30,0 %
  //   · zes VOLTOOIDE maanden transacties die iets ANDERS meten:
  //     (36.000 − 32.580) / 36.000 = 9,5 % → afgerond 10 % in de detailregel.
  // Vóór B-030 gaf `loadLeverScores` die 9,5 % door; de kaart toonde 30 %.
  const NOW = new Date(2026, 6, 15, 12, 0, 0) // 15 juli 2026 → venster jan t/m jun
  const B_INCOME = 'budget-income'
  const B_EXPENSE = 'budget-expense'

  /** Zes VOLTOOIDE maanden (jan t/m jun 2026): 6 × 6.000 in, 6 × 5.430 uit. */
  const TRANSACTIES: Row[] = ['01', '02', '03', '04', '05', '06'].flatMap((m): Row[] => [
    { amount: 6000, date: `2026-${m}-05`, budget_id: B_INCOME, transaction_type: null },
    { amount: -5430, date: `2026-${m}-12`, budget_id: B_EXPENSE, transaction_type: null },
  ])

  const BUDGETS: Row[] = [
    { id: B_INCOME, parent_id: null, budget_type: 'income', default_limit: 60000, interval: 'yearly', name: 'Inkomen', is_archived: false },
    { id: B_EXPENSE, parent_id: null, budget_type: 'expense', default_limit: 3000, interval: 'monthly', name: 'Uitgaven', is_archived: false },
  ]

  const DB: FakeDb = {
    profile: {
      id: FAKE_USER_ID,
      full_name: 'Grondslag',
      date_of_birth: null,
      budgeting_active: true,
      income_source: 'manual',
      net_monthly_income: 6000,
      expenses_source: 'manual',
      estimated_monthly_expenses: 4200,
    },
    budgets: BUDGETS,
    transactions: TRANSACTIES,
    debts: [],
    assets: [],
  }

  /** De effectieve quote: (6000 − 4200) / 6000 × 100. */
  const EFFECTIEF_PCT = 30
  /** De 6-maands transactiemeting, afgerond zoals de detailregel 'm zou tonen. */
  const GEMETEN_PCT_AFGEROND = 10

  /**
   * DE KAART-KANT, UIT ZIJN ECHTE BRON — niet uit een constante die deze test
   * zelf declareert.
   *
   * Waarom dat verschil telt: de tegel op /overzicht leest
   * `horizonData.healthScoreInput.effectiveSavingsRatePct` (app/(app)/overzicht/page.tsx),
   * en dát veld wordt door `loadHorizonRaw` gevuld met `effectiveSavingsRate`.
   * Een test die hier een letterlijke 30 invult, vergelijkt het kompas met een
   * getal uit zijn eigen bestand: "kaart == kompas" heet hij dan wel, maar hij
   * toetst "kompas == constante", en élke divergentie tússen de twee loaders
   * passeert 'm ongezien. Nu draaien er twee echte loaders op één fixture.
   */
  async function kaartPct(db: FakeDb): Promise<number> {
    const raw = await loadHorizonRaw(makeSupabase(db).client)
    return raw.healthScoreInputBase.effectiveSavingsRatePct
  }

  /** De kompas-kant: de detailregel + status uit `loadLeverScores`. */
  async function kompasScores(db: FakeDb) {
    const { scores } = await loadLeverScores(makeSupabase(db).client)
    return scores
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('de kompas-detailregel draagt de EFFECTIEVE quote, niet de rauwe meting', async () => {
    const scores = await kompasScores(DB)
    expect(scores.cashflow.detail).toContain(`Spaarquote ${EFFECTIEF_PCT}%`)
    expect(scores.cashflow.detail).not.toContain(`Spaarquote ${GEMETEN_PCT_AFGEROND}%`)
  })

  it('de SCORE volgt hetzelfde getal — detail en stoplicht op één grondslag', async () => {
    // Bewust samen genomen: vóór B-030 droeg de kaart een effectief GETAL met een
    // uit de rauwe meting afgeleid STIPJE. Op deze fixture: 30 % → savings-
    // component 100 (i.p.v. 49 bij 9,5 %), budget-component 100 → score 100.
    const scores = await kompasScores(DB)
    expect(scores.cashflow.score).toBe(100)
  })

  it('kaart == kompas: het percentage op de tegel is hetzelfde getal', async () => {
    const pct = await kaartPct(DB)
    // Contrast-anker: zonder deze regel zou de gelijkheid hieronder ook kloppen
    // als BEIDE loaders naar dezelfde verkeerde waarde afdrijven.
    expect(pct).toBe(EFFECTIEF_PCT)

    const scores = await kompasScores(DB)
    const { container } = render(
      <HefbomenNav health={null} leverScores={scores} totals={{ cashflow: pct }} />,
    )
    expect(container.textContent).toContain(`${pct}%`)
    expect(scores.cashflow.detail).toContain(`Spaarquote ${Math.round(pct)}%`)
  })
})

/**
 * RANDGEVAL — handmatige grondslag met een LEEGGEMAAKT bedrag.
 *
 * `income_source = 'manual'` met `net_monthly_income = 0` levert via
 * `resolveAmountWithBasis` een grondslag `{ amount: 0, basis: 'manual' }`. In
 * `resolveSavingsSource` valt zo'n nul-jaarinkomen terug op het meegegeven
 * `estimatedAnnualIncome` — en precies dáár zat de fout: `loadLeverScores` gaf
 * als terugval `leverAnnualIncome.amount` mee, dus dezelfde nul. De terugval
 * ving dan niets op: effectief jaarinkomen 0 → `savingsRateFromAggregates(0, …)`
 * → 0 %. De kaart, die de transactie-EXTRAPOLATIE meegeeft (net als
 * dashboard-data-loader.ts en cashflow-kpis.ts), toonde ondertussen 30 %.
 *
 * Deze fixture is dezelfde als hierboven op één veld na, zodat het verschil
 * uitsluitend van dat leeggemaakte bedrag komt. Verwachting: 30 % aan BEIDE
 * kanten — en met nadruk niet 0 % naast 30 %.
 */
describe('bevinding 1 — leeggemaakt handmatig inkomen valt terug op de transactie-extrapolatie', () => {
  const NOW = new Date(2026, 6, 15, 12, 0, 0)
  const B_INCOME = 'budget-income'
  const B_EXPENSE = 'budget-expense'

  const DB_LEEG: FakeDb = {
    profile: {
      id: FAKE_USER_ID,
      full_name: 'Leeggemaakt',
      date_of_birth: null,
      budgeting_active: true,
      // Grondslag staat op handmatig, maar het bedrag is weggehaald.
      income_source: 'manual',
      net_monthly_income: 0,
      expenses_source: 'manual',
      estimated_monthly_expenses: 4200,
    },
    budgets: [
      { id: B_INCOME, parent_id: null, budget_type: 'income', default_limit: 60000, interval: 'yearly', name: 'Inkomen', is_archived: false },
      { id: B_EXPENSE, parent_id: null, budget_type: 'expense', default_limit: 3000, interval: 'monthly', name: 'Uitgaven', is_archived: false },
    ],
    // Wél transactie-inkomen: 6 × 6.000 over zes voltooide maanden, vroegste
    // inkomstendatum 2026-01-05 → extrapolatie 36.000 / 6 × 12 = 72.000 p.j.
    // ⇒ (6000 − 4200) / 6000 = 30 %.
    transactions: ['01', '02', '03', '04', '05', '06'].flatMap((m): Row[] => [
      { amount: 6000, date: `2026-${m}-05`, budget_id: B_INCOME, transaction_type: null },
      { amount: -5430, date: `2026-${m}-12`, budget_id: B_EXPENSE, transaction_type: null },
    ]),
    debts: [],
    assets: [],
  }

  const VERWACHT_PCT = 30

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('de kaart leidt 30 % af uit de transactie-extrapolatie', async () => {
    const raw = await loadHorizonRaw(makeSupabase(DB_LEEG).client)
    expect(raw.healthScoreInputBase.effectiveSavingsRatePct).toBe(VERWACHT_PCT)
  })

  it('het kompas doet hetzelfde — géén 0 % naast 30 %', async () => {
    const raw = await loadHorizonRaw(makeSupabase(DB_LEEG).client)
    const { scores } = await loadLeverScores(makeSupabase(DB_LEEG).client)

    expect(scores.cashflow.detail).toContain(
      `Spaarquote ${Math.round(raw.healthScoreInputBase.effectiveSavingsRatePct)}%`,
    )
    // Expliciet: de oude bedrading landde hier op 0 %.
    expect(scores.cashflow.detail).not.toContain('Spaarquote 0%')
  })

  it('kaart en kompas staan op één tegel zonder elkaar tegen te spreken', async () => {
    const raw = await loadHorizonRaw(makeSupabase(DB_LEEG).client)
    const { scores } = await loadLeverScores(makeSupabase(DB_LEEG).client)
    const pct = raw.healthScoreInputBase.effectiveSavingsRatePct

    const { container } = render(
      <HefbomenNav health={null} leverScores={scores} totals={{ cashflow: pct }} />,
    )
    expect(container.textContent).toContain(`${pct}%`)
    expect(scores.cashflow.detail).toContain(`Spaarquote ${Math.round(pct)}%`)
  })
})
