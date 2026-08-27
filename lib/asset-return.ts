// lib/asset-return.ts
// ---------------------------------------------------------------------------
// Rendement over bezittingen — de grondslagen gescheiden.
//
// WAAROM DIT BESTAAT — de bezittingen-pagina rekende `Σ current_value −
// Σ purchase_value` over álle actieve bezittingen. Dat is één aftrekking over
// vier onvergelijkbare soorten getallen, en het leverde een kop-KPI op die
// niemand kon narekenen: een fors NEGATIEF totaal terwijl de marktportefeuille
// tientallen procenten in de plus stond. De regressie-fixture
// (lib/asset-return.test.ts) legt die combinatie vast. Drie dingen liepen door
// elkaar:
//
//   1. BELEGGINGEN/CRYPTO hebben een echte, transactie-onderbouwde kostprijs in
//      `investment_holdings`/`crypto_holdings`, samengeteld door de canonieke
//      motor `sumHoldingTotals` (lib/holdings-totals.ts). Die werd genegeerd
//      ten gunste van het met de hand ingetypte `purchase_value` op de
//      asset-rij — bij crypto een rond getal dat het TEKEN omdraaide.
//   2. CASH/SPAARGELD/PENSIOEN hebben geen kostprijsbegrip. Een saldo is niet
//      "gekocht". Stond `purchase_value` op 0, dan telde het volledige saldo
//      als winst; schreef quick-add `purchase_value = current_value`
//      (lib/quick-add/build-drafts.ts), dan droeg de rij per definitie nul bij
//      en verdunde alleen het percentage.
//   3. DE WAARDE VAN EEN EIGEN WONING en de verkrijgingsprijs van een
//      deelneming zijn waarderingen, geen marktrendement. Ze zijn een orde van
//      grootte groter dan de portefeuille en overstemden daarmee alles.
//
// Daarom drie emmers in plaats van één som. `portfolio` is de kop-KPI: het
// rendement dat de gebruiker daadwerkelijk op zijn belegde geld haalde.
// `valuation` en `withoutBasis` verdwijnen niet — ze staan in de rekenmodal,
// zodat elke bezitting terug te vinden is en de drie emmers samen exact het
// bruto bezittingentotaal vormen. Een bedrag dat nergens landt is precies hoe
// het vorige getal onnavolgbaar werd.
// ---------------------------------------------------------------------------

/** Bezittingen waarvan het rendement uit de markt komt — kop-KPI. */
const PORTFOLIO_TYPES: ReadonlySet<string> = new Set(['investment', 'crypto'])

/**
 * Bezittingen zonder kostprijsbegrip. Een banksaldo, een spaarrekening of een
 * pensioenpot is niet "aangeschaft" — wat er staat is gestort, niet gekocht.
 * Rente/opbouw hoort in de cashflow thuis, niet in een aankoop-delta.
 */
const NO_BASIS_TYPES: ReadonlySet<string> = new Set(['cash', 'savings', 'retirement'])

export type AssetReturnCostSource = 'holdings' | 'purchase_value'

export type AssetReturnReason =
  /** Type kent geen aankoopwaarde (cash/spaargeld/pensioen). */
  | 'geen-kostprijs-begrip'
  /** `purchase_value` is 0/leeg — een delta hierop is geen rendement maar de waarde zelf. */
  | 'geen-aankoopwaarde'
  /** `purchase_value === current_value` — plaatshouder uit quick-add, draagt per definitie nul bij. */
  | 'aankoop-is-waarde'
  /** Samengevoegd partnertotaal (privacy 'totalen') — één bedrag zonder onderliggende bezittingen. */
  | 'samengevoegd-totaal'

/**
 * Hoeveel de gedekte holdings-marktwaarde van `assets.current_value` mag
 * afwijken voordat we de holdings-kostprijs niet meer als grondslag claimen.
 *
 * Waarom een marge en niet exact: `holdings-sync` schrijft `current_value` uit
 * dezelfde posities en koersen, maar de twee lezingen liggen milliseconden tot
 * uren uit elkaar en de seed-fixtures ronden af — een harde gelijkheid zou op
 * ruis omvallen. Waarom niet ruimer: het gat dat we moeten vangen is van een
 * andere orde. Een positie zonder kostprijs (wallet-sync schrijft er geen)
 * verdwijnt hier volledig uit de dekking, dus die valt ver buiten 1%.
 */
const HOLDINGS_VALUE_TOLERANCE = 0.01

export interface AssetReturnInput {
  id: string
  name: string
  assetType: string
  /**
   * Perspectief-gewogen marktwaarde. De AANROEPER weegt dit (spiegelt
   * `perspectiveAssetValue`), zodat deze helper puur blijft en het totaal per
   * constructie aansluit op de figures-strip.
   */
  value: number
  /** Rauwe `purchase_value` van de rij; wordt hier met `shareFraction` gewogen. */
  purchaseValue: number | null
  /**
   * Aandeelfractie voor kostprijs-aggregaten — spiegelt `shareFractionFor`.
   * Default 1. Waarde is al gewogen (zie `value`); kostprijzen nog niet.
   */
  shareFraction?: number
  /**
   * Samengevoegde partnerrij (privacy 'totalen'): één bedrag zonder
   * `asset_type` of `purchase_value`. Zulke rijen tellen wél mee in de totale
   * waarde maar kunnen per constructie geen rendement dragen — zonder deze vlag
   * zouden ze via de gewone route een misleidende reden krijgen
   * ("geen aankoopwaarde ingevuld" suggereert een handeling die hier onmogelijk is).
   */
  aggregated?: boolean
}

/** Kostprijs + marktwaarde uit de holdings-motor, per asset-id. */
export interface AssetHoldingsCost {
  cost: number
  value: number
}

export interface AssetReturnRow {
  id: string
  name: string
  assetType: string
  /** Perspectief-gewogen marktwaarde (ongewijzigd doorgegeven). */
  value: number
  /** Kostprijs waartegen `value` is afgezet; `null` in de `withoutBasis`-emmer. */
  cost: number | null
  /** `value − cost`, of `null` zonder kostprijs. */
  gain: number | null
  /** Waar `cost` vandaan komt — de modal toont dit, zodat het narekenbaar is. */
  costSource: AssetReturnCostSource | null
  /** Alleen gevuld in de `withoutBasis`-emmer. */
  reason?: AssetReturnReason
}

export interface AssetReturnBucket {
  rows: AssetReturnRow[]
  value: number
  cost: number
  gain: number
  /** `gain / cost × 100`; `null` zonder kostprijs (geen noemer, geen percentage). */
  pct: number | null
}

export interface AssetReturnBreakdown {
  /** Kop-KPI — marktrendement op beleggingen + crypto. */
  portfolio: AssetReturnBucket
  /** Waardeveranderingen buiten de markt (woning, deelneming, voertuig, …). */
  valuation: AssetReturnBucket
  /** Bezittingen zonder kostprijs; `cost`/`gain`/`pct` zijn hier 0 resp. null. */
  withoutBasis: AssetReturnBucket
  /** Σ waarde over alle rijen — gelijk aan het bruto bezittingentotaal. */
  totalValue: number
}

function finite(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Rendementspercentage als nl-NL-tekst met expliciet teken ("+86,0%").
 *
 * Eén implementatie voor de KPI-cel én de rekenmodal: die twee tonen hetzelfde
 * getal en mogen het dus niet elk anders afronden of scheiden. `toFixed` is hier
 * bewust NIET gebruikt — dat levert een punt als decimaalteken, terwijl elk ander
 * bedrag op deze pagina een komma draagt.
 *
 * NB: heet bewust niet `formatReturnPct` — `components/widgets/
 * vrijheidsscenario-widget.tsx` heeft een gelijknamige lokale helper die een
 * FRACTIE (jaarrendement) aanneemt in plaats van een percentage. Twee formatters
 * met dezelfde naam en een andere eenheid is een verkeerde import die niemand
 * ziet, want beide typen `number`.
 */
export function formatGainPct(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null
  const body = Math.abs(pct).toLocaleString('nl-NL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${pct < 0 ? '−' : '+'}${body}%`
}

/**
 * DE VIER GRONDSLAGEN ACHTER HET WOORD "RENDEMENT" — één vocabulaire.
 *
 * Aanleiding (kaart H7, testronde 24-08-2026): op /overzicht en
 * /overzicht/bezittingen stonden vier verschillende percentages onder hetzelfde
 * kale woord "Rendement" — een portefeuillerendement sinds aankoop, het
 * rendement van één positie, een 1-daagse koersmutatie en een verwachting per
 * jaar. Ze zijn geen van alle fout; ze meten iets anders. Het label verzweeg
 * dat, dus de gebruiker las vier antwoorden op één vraag.
 *
 * Zelfde principe als ADR 0073 (grondslag in de veldnaam), maar dan voor
 * DISPLAY-labels: het kale woord "rendement" is geen zelfstandig label meer.
 * Het mag alleen nog in een kicker staan waar de grondslag er direct onder
 * hangt. Elke nieuwe rendement-weergave kiest hier een sleutel; wie er geen kan
 * kiezen, heeft een vijfde grondslag te pakken en hoort die hier toe te voegen
 * in plaats van een eigen tekst te bedenken.
 *
 * DRIE VELDEN, ELK MET EEN TAAK:
 * - `label`   — het volle label; gebruik dit waar de ruimte het toelaat.
 * - `compact` — voor een kicker of KPI-cel waar het volle label afkapt. Deze
 *   vier zijn ONDERLING NET ZO ONDERSCHEIDEND als de volle labels; dat is de
 *   hele eis. Een compacte vorm die op twee grondslagen past ("Rendement",
 *   "Sinds aankoop") is precies de fout die deze tabel opheft — twee tegels op
 *   /overzicht tonen naast elkaar een portefeuille- én een positierendement.
 * - `scope`   — het sublabel. Oppervlakken mogen het weglaten, nooit
 *   hérformuleren.
 */
export const RETURN_BASIS_LABELS = {
  /** Gerealiseerd, hele marktportefeuille, sinds aankoop — `portfolio` hieronder. */
  portfolioSincePurchase: {
    label: 'Portefeuille sinds aankoop',
    compact: 'Portefeuille',
    scope: 'beleggingen en crypto',
  },
  /** Gerealiseerd, ÉÉN positie, sinds aankoop — units × (koers − gemiddelde aankoopkoers). */
  positionSincePurchase: {
    label: 'Deze positie sinds aankoop',
    compact: 'Deze positie',
    scope: null,
  },
  /** Koersmutatie over één dag t.o.v. `previous_close`. */
  dayChange: {
    label: 'Vandaag',
    compact: 'Vandaag',
    scope: null,
  },
  /**
   * AANNAME, geen meting: het per bezitting ingevulde `assets.expected_return`,
   * waarde-gewogen. Draagt daarom expliciet "(aanname)" in het label — dit getal
   * is nooit ergens gerealiseerd.
   */
  expectedAnnual: {
    label: 'Verwacht per jaar (aanname)',
    compact: 'Verwacht per jaar',
    scope: 'niet gerealiseerd',
  },
} as const satisfies Record<string, { label: string; compact: string; scope: string | null }>

export type ReturnBasisKey = keyof typeof RETURN_BASIS_LABELS

function emptyBucket(): AssetReturnBucket {
  return { rows: [], value: 0, cost: 0, gain: 0, pct: null }
}

/** Rendement van één asset-type binnen de marktportefeuille. */
export interface PortfolioReturnTypeRollup {
  type: string
  value: number
  cost: number
  gain: number
  /** `gain / cost × 100`; `null` zonder kostprijs. */
  pct: number | null
}

/**
 * DE DASHBOARD-VORM van het portefeuillerendement.
 *
 * Bewust NIET de volle `AssetReturnBreakdown`. Die draagt per bezitting een
 * `id` en een `name`, en alles wat in de dashboardbundel staat gaat als
 * RSC-payload mee naar de browser van élke /overzicht-render. De widgets hebben
 * die namen niet nodig — ze tonen totalen en een uitsplitsing per type — en de
 * rekenmodal die ze wél toont, staat op /overzicht/bezittingen, waar de rijen
 * langs de perspectief-loader komen. Zo blijft het bedrag hetzelfde en reist de
 * bezittingenlijst niet mee naar een scherm dat hem niet toont.
 *
 * `byType` vervangt de eigen groepeerlus die de rendement-widget had: één
 * rollup, in de motor, in plaats van per widget een eigen som (kaart H7).
 */
export interface PortfolioReturnSummary {
  value: number
  cost: number
  gain: number
  /** `gain / cost × 100`; `null` zonder kostprijs (geen noemer, geen percentage). */
  pct: number | null
  byType: PortfolioReturnTypeRollup[]
}

/**
 * Vat de marktportefeuille-emmer samen tot de dashboardvorm: de totalen plus
 * een rollup per `asset_type`, zonder per-bezit rijen.
 *
 * Een type dat geen kostprijs draagt komt hier niet voor — de motor heeft die
 * rijen dan al in `withoutBasis` gezet. Dat is precies waarom de widgets deze
 * rollup consumeren in plaats van zelf over `assetsByType.purchaseValue` te
 * sommeren: een pensioenpot kán per definitie niet in dit lijstje staan.
 */
export function summarizePortfolioReturn(breakdown: AssetReturnBreakdown): PortfolioReturnSummary {
  const { portfolio } = breakdown
  const byType = new Map<string, PortfolioReturnTypeRollup>()
  for (const row of portfolio.rows) {
    const acc = byType.get(row.assetType) ?? { type: row.assetType, value: 0, cost: 0, gain: 0, pct: null }
    acc.value += row.value
    acc.cost += row.cost ?? 0
    acc.gain += row.gain ?? 0
    byType.set(row.assetType, acc)
  }
  const rollups = [...byType.values()]
    .map((g) => ({ ...g, pct: g.cost > 0 ? (g.gain / g.cost) * 100 : null }))
    .sort((a, b) => b.value - a.value)
  return {
    value: portfolio.value,
    cost: portfolio.cost,
    gain: portfolio.gain,
    pct: portfolio.pct,
    byType: rollups,
  }
}

/**
 * Lege samenvatting — voor bundel-fallbacks en testfixtures zonder bezittingen.
 * Eén home, zodat mocks niet elk een eigen (en straks afwijkende) vorm
 * verzinnen; `pct: null` betekent overal hetzelfde: geen noemer, dus geen
 * percentage (niet "0%").
 */
export function emptyPortfolioReturnSummary(): PortfolioReturnSummary {
  return { value: 0, cost: 0, gain: 0, pct: null, byType: [] }
}

function seal(bucket: AssetReturnBucket, sort: (a: AssetReturnRow, b: AssetReturnRow) => number): AssetReturnBucket {
  bucket.rows.sort(sort)
  bucket.pct = bucket.cost > 0 ? (bucket.gain / bucket.cost) * 100 : null
  return bucket
}

/**
 * Splitst een set bezittingen in drie grondslag-emmers en telt per emmer op.
 *
 * @param assets Perspectief-gewogen rijen (zie `AssetReturnInput.value`).
 * @param holdingsCostByAssetId Kostprijs uit `sumHoldingTotals`, per asset-id.
 *   Ontbreekt een asset (bv. een partner-bezit waarvan RLS de holdings niet
 *   vrijgeeft), dan valt die rij terug op `purchase_value` — expliciet
 *   gemarkeerd via `costSource`, nooit stilzwijgend.
 */
export function buildAssetReturnBreakdown(
  assets: readonly AssetReturnInput[],
  holdingsCostByAssetId: Readonly<Record<string, AssetHoldingsCost>> = {},
): AssetReturnBreakdown {
  const portfolio = emptyBucket()
  const valuation = emptyBucket()
  const withoutBasis = emptyBucket()
  let totalValue = 0

  for (const asset of assets) {
    const share = finite(asset.shareFraction) ?? 1
    const value = finite(asset.value) ?? 0
    totalValue += value

    const base = { id: asset.id, name: asset.name, assetType: asset.assetType, value }

    const drop = (reason: AssetReturnReason) => {
      withoutBasis.rows.push({ ...base, cost: null, gain: null, costSource: null, reason })
      withoutBasis.value += value
    }

    if (asset.aggregated) {
      drop('samengevoegd-totaal')
      continue
    }

    if (NO_BASIS_TYPES.has(asset.assetType)) {
      drop('geen-kostprijs-begrip')
      continue
    }

    // Holdings winnen van `purchase_value` — dat is de hele reden dat deze
    // helper bestaat. Een kostprijs van 0 is géén kostprijs: dat betekent
    // "geen posities/prijzen bekend", niet "gratis gekregen".
    const holdings = PORTFOLIO_TYPES.has(asset.assetType) ? holdingsCostByAssetId[asset.id] : undefined
    const holdingsCost = holdings && (finite(holdings.cost) ?? 0) > 0 ? holdings.cost * share : null

    // DEKKINGSPOORT — `gain` zet twee bronnen tegen elkaar af: de waarde van de
    // asset-rij en de kostprijs uit de holdings. Dat mag alleen als ze over
    // DEZELFDE posities gaan. De loader levert daarom naast de kostprijs de
    // marktwaarde die door die kostprijs gedekt wordt; wijkt die af van de
    // waarde van het bezit, dan zit er waarde in zonder kostprijs eronder
    // (een wallet-positie zonder `avg_purchase_price`, een stale sync) en zou
    // dat gat één-op-één als rendement worden gerapporteerd. Liever terugvallen
    // op de ingevulde aankoopwaarde — zichtbaar via `costSource` — dan een
    // getal tonen dat niemand kan narekenen.
    const holdingsValue = holdings ? (finite(holdings.value) ?? 0) * share : null
    const covered =
      holdingsCost != null &&
      holdingsValue != null &&
      Math.abs(holdingsValue - value) <= Math.max(1, Math.abs(value) * HOLDINGS_VALUE_TOLERANCE)

    let cost: number | null = covered ? holdingsCost : null
    let costSource: AssetReturnCostSource | null = covered ? 'holdings' : null

    if (cost == null) {
      const purchase = finite(asset.purchaseValue)
      if (purchase == null || purchase <= 0) {
        drop('geen-aankoopwaarde')
        continue
      }
      const weighted = purchase * share
      // Plaatshouder uit quick-add: aankoop == waarde. Meetellen levert een
      // gegarandeerde nul in de teller én een noemer die het percentage
      // verdunt — beide misleidend.
      if (weighted === value) {
        drop('aankoop-is-waarde')
        continue
      }
      cost = weighted
      costSource = 'purchase_value'
    }

    const bucket = PORTFOLIO_TYPES.has(asset.assetType) ? portfolio : valuation
    const gain = value - cost
    bucket.rows.push({ ...base, cost, gain, costSource })
    bucket.value += value
    bucket.cost += cost
    bucket.gain += gain
  }

  // Grootste bijdrage bovenaan — de modal moet in één blik laten zien wát het
  // getal drijft. Dat is precies wat de oude enkele som verborg.
  const byImpact = (a: AssetReturnRow, b: AssetReturnRow) => Math.abs(b.gain ?? 0) - Math.abs(a.gain ?? 0)
  const byValue = (a: AssetReturnRow, b: AssetReturnRow) => b.value - a.value

  return {
    portfolio: seal(portfolio, byImpact),
    valuation: seal(valuation, byImpact),
    withoutBasis: seal(withoutBasis, byValue),
    totalValue,
  }
}
