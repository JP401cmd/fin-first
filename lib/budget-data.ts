/**
 * Budget types, default seed data, and mock spending/history.
 *
 * 8 hoofdcategorieën + 27 subcategorieën (incl. Inkomen en Eigen rekening).
 * Totaal uitgaven (excl. inkomen/archief) ~€2.580/mnd — past bij het
 * mock-persona (€3.367/mnd netto).
 *
 * Namen, iconen en omschrijvingen van álle slugs zijn éénmalig gecureerd in
 * de catalogus `BUDGET_PARENT_META` + `BUDGET_LEAF_META` (single source of
 * truth). `getDefaultBudgets()` en de template-builder lezen daaruit, zodat
 * een naam/icoon op één plek staat. De catalogus bevat óók leaf-slugs die in
 * de standaard-seed (nog) niet voorkomen — die hangen alleen aan templates.
 */

export type Budget = {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  slug: string | null
  icon: string
  description: string | null
  default_limit: number
  budget_type: 'income' | 'expense' | 'savings' | 'debt' | 'archive'
  interval: 'monthly' | 'quarterly' | 'yearly'
  rollover_type: 'reset' | 'carry-over' | 'invest-sweep'
  limit_type: 'soft' | 'hard'
  alert_threshold: number
  max_single_transaction_amount: number
  is_essential: boolean
  priority_score: number
  is_inflation_indexed: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Household fields
  ownership: 'personal' | 'shared'
  household_id: string | null
  // Goal type fields
  goal_type: string | null
  goal_amount: number | null
  goal_date: string | null
  goal_frequency: string | null
  is_favorite: boolean
  is_archived?: boolean
}

/** Stable budget slugs — use these for matching instead of display names. */
export const BUDGET_SLUGS = {
  // Inkomen
  INKOMEN: 'inkomen',
  SALARIS_UITKERING: 'salaris-uitkering',
  TOESLAGEN_KINDERBIJSLAG: 'toeslagen-kinderbijslag',
  TERUGGAVE_BELASTING: 'teruggave-belasting',
  OVERIGE_INKOMSTEN: 'overige-inkomsten',
  // Vaste lasten
  VASTE_LASTEN_WONEN: 'vaste-lasten-wonen',
  HUUR_HYPOTHEEK: 'huur-hypotheek',
  GAS_WATER_LICHT: 'gas-water-licht',
  VERZEKERINGEN_WONEN: 'verzekeringen-wonen',
  GEMEENTELIJKE_LASTEN: 'gemeentelijke-lasten',
  TELEFOON_INTERNET_TV: 'telefoon-internet-tv',
  ABONNEMENTEN_CONTRIBUTIES: 'abonnementen-contributies',
  ONDERHOUD_HUIS_TUIN: 'onderhoud-huis-tuin',
  INVENTARIS_APPARATEN: 'inventaris-apparaten',
  // Dagelijkse uitgaven
  DAGELIJKSE_UITGAVEN: 'dagelijkse-uitgaven',
  BOODSCHAPPEN: 'boodschappen',
  HUISHOUDEN_VERZORGING: 'huishouden-verzorging',
  KINDEREN_SCHOOL: 'kinderen-school',
  MEDISCHE_KOSTEN: 'medische-kosten',
  HUISDIEREN: 'huisdieren',
  // Vervoer
  VERVOER: 'vervoer',
  BRANDSTOF_OV: 'brandstof-ov',
  AUTO_VASTE_LASTEN: 'auto-vaste-lasten',
  AUTO_ONDERHOUD: 'auto-onderhoud',
  FIETS_DEELVERVOER: 'fiets-deelvervoer',
  // Leuke dingen
  LEUKE_DINGEN: 'leuke-dingen',
  UIT_ETEN_HORECA: 'uit-eten-horeca',
  VRIJE_TIJD_SPORT: 'vrije-tijd-sport',
  VAKANTIE: 'vakantie',
  KLEDING_OVERIGE: 'kleding-overige',
  CADEAUS_FEESTDAGEN: 'cadeaus-feestdagen',
  // Sparen
  SPAREN_SCHULDEN: 'sparen-schulden',
  SPAREN_NOODBUFFER: 'sparen-noodbuffer',
  INVESTEREN_FIRE: 'investeren-fire',
  SCHULDEN_AFLOSSINGEN_PARENT: 'schulden-aflossingen-parent',
  SCHULDEN_AFLOSSINGEN: 'schulden-aflossingen',
  EXTRA_AFLOSSING_HYPOTHEEK: 'extra-aflossing-hypotheek',
  EIGEN_REKENING: 'eigen-rekening',
  EIGEN_REKENING_SUB: 'eigen-rekening-sub',
} as const

export type BudgetAmount = {
  id: string
  budget_id: string
  effective_from: string
  amount: number
  created_at: string
}

export type BudgetWithChildren = Budget & {
  children: Budget[]
}

/** Eén deelbudget (leaf) in een seed-boom. */
export type SeedChild = {
  name: string
  slug: string
  icon: string
  description: string
  default_limit: number
}

/** Eén hoofdbudget (parent) met optionele deelbudgetten in een seed-boom. */
export type SeedBudget = {
  name: string
  slug: string
  icon: string
  description: string
  default_limit: number
  budget_type: 'income' | 'expense' | 'savings' | 'debt' | 'archive'
  is_essential: boolean
  priority_score: number
  sort_order: number
  children?: SeedChild[]
}

// ── Canonieke metadata-catalogus ─────────────────────────────────
//
// Single source of truth voor naam/icoon/omschrijving van élk budget.
// `getDefaultBudgets()` en `buildTemplateSeed()` (in onboarding-presets)
// lezen hieruit, zodat dezelfde slug overal dezelfde naam/icoon krijgt.

/** Vaste eigenschappen van een hoofdbudget (los van bedragen). */
export type BudgetParentMeta = {
  name: string
  icon: string
  description: string
  budget_type: SeedBudget['budget_type']
  is_essential: boolean
  priority_score: number
  sort_order: number
}

/** Vaste eigenschappen van een deelbudget — `parentSlug` verankert het onder een hoofdbudget. */
export type BudgetLeafMeta = {
  name: string
  icon: string
  description: string
  parentSlug: string
}

const SS = BUDGET_SLUGS

/** Canonieke hoofdbudget-metadata, in canonieke `sort_order`. */
export const BUDGET_PARENT_META: Record<string, BudgetParentMeta> = {
  [SS.INKOMEN]: {
    name: 'Inkomen',
    icon: 'Wallet',
    description: 'Alle inkomstenbronnen',
    budget_type: 'income',
    is_essential: true,
    priority_score: 5,
    sort_order: 0,
  },
  [SS.VASTE_LASTEN_WONEN]: {
    name: 'Vaste lasten wonen & energie',
    icon: 'Home',
    description: 'Alle vaste woonlasten',
    budget_type: 'expense',
    is_essential: true,
    priority_score: 5,
    sort_order: 1,
  },
  [SS.DAGELIJKSE_UITGAVEN]: {
    name: 'Dagelijkse uitgaven',
    icon: 'ShoppingCart',
    description: 'Dagelijkse boodschappen en huishouden',
    budget_type: 'expense',
    is_essential: true,
    priority_score: 5,
    sort_order: 2,
  },
  [SS.VERVOER]: {
    name: 'Vervoer',
    icon: 'Car',
    description: 'Alle vervoerskosten',
    budget_type: 'expense',
    is_essential: true,
    priority_score: 4,
    sort_order: 3,
  },
  [SS.LEUKE_DINGEN]: {
    name: 'Leuke dingen & lifestyle',
    icon: 'PartyPopper',
    description: 'Ontspanning, hobby\'s en plezier',
    budget_type: 'expense',
    is_essential: false,
    priority_score: 2,
    sort_order: 4,
  },
  [SS.SPAREN_SCHULDEN]: {
    name: 'Sparen & investeren',
    icon: 'PiggyBank',
    description: 'Vermogensopbouw en buffer',
    budget_type: 'savings',
    is_essential: true,
    priority_score: 4,
    sort_order: 5,
  },
  [SS.SCHULDEN_AFLOSSINGEN_PARENT]: {
    name: 'Schulden & aflossingen',
    icon: 'CreditCard',
    description: 'Schulden aflossen en hypotheek',
    budget_type: 'debt',
    is_essential: true,
    priority_score: 4,
    sort_order: 6,
  },
  [SS.EIGEN_REKENING]: {
    name: 'Eigen rekening',
    icon: 'ArrowLeftRight',
    description: 'Overboekingen tussen eigen rekeningen — geen invloed op resultaten',
    budget_type: 'archive',
    is_essential: false,
    priority_score: 1,
    sort_order: 99,
  },
}

/** Canonieke deelbudget-metadata (alle ~25 bestaande + de 6 nieuwe slugs). */
export const BUDGET_LEAF_META: Record<string, BudgetLeafMeta> = {
  // Inkomen
  [SS.SALARIS_UITKERING]: { name: 'Salaris & uitkering', icon: 'Banknote', description: 'Netto salaris of uitkering', parentSlug: SS.INKOMEN },
  [SS.TOESLAGEN_KINDERBIJSLAG]: { name: 'Toeslagen & kinderbijslag', icon: 'Baby', description: 'Overheidstoeslagen en kinderbijslag', parentSlug: SS.INKOMEN },
  [SS.TERUGGAVE_BELASTING]: { name: 'Teruggave belasting', icon: 'Receipt', description: 'Belastingteruggave', parentSlug: SS.INKOMEN },
  [SS.OVERIGE_INKOMSTEN]: { name: 'Overige inkomsten', icon: 'HandCoins', description: 'Bijverdiensten en overig', parentSlug: SS.INKOMEN },
  // Vaste lasten wonen & energie
  [SS.HUUR_HYPOTHEEK]: { name: 'Huur / hypotheek', icon: 'Building2', description: 'Maandelijkse woonkosten', parentSlug: SS.VASTE_LASTEN_WONEN },
  [SS.GAS_WATER_LICHT]: { name: 'Gas, water, licht', icon: 'Zap', description: 'Energie en waterrekening', parentSlug: SS.VASTE_LASTEN_WONEN },
  [SS.VERZEKERINGEN_WONEN]: { name: 'Verzekeringen wonen & gezondheid', icon: 'ShieldCheck', description: 'Zorg-, woon- en inboedelverzekering', parentSlug: SS.VASTE_LASTEN_WONEN },
  [SS.GEMEENTELIJKE_LASTEN]: { name: 'Gemeentelijke & overige vaste lasten', icon: 'Landmark', description: 'OZB, afvalstoffenheffing, rioolheffing', parentSlug: SS.VASTE_LASTEN_WONEN },
  [SS.TELEFOON_INTERNET_TV]: { name: 'Telefoon, internet & tv', icon: 'Wifi', description: 'Mobiel, internet- en tv-abonnement', parentSlug: SS.VASTE_LASTEN_WONEN },
  [SS.ABONNEMENTEN_CONTRIBUTIES]: { name: 'Abonnementen & contributies', icon: 'Repeat', description: 'Streaming, lidmaatschappen, contributies', parentSlug: SS.VASTE_LASTEN_WONEN },
  [SS.ONDERHOUD_HUIS_TUIN]: { name: 'Onderhoud huis & tuin', icon: 'Hammer', description: 'Reparaties, schilderwerk, tuin', parentSlug: SS.VASTE_LASTEN_WONEN },
  [SS.INVENTARIS_APPARATEN]: { name: 'Inventaris & apparaten', icon: 'Armchair', description: 'Meubels, witgoed, vervanging inboedel', parentSlug: SS.VASTE_LASTEN_WONEN },
  // Dagelijkse uitgaven
  [SS.BOODSCHAPPEN]: { name: 'Boodschappen', icon: 'Store', description: 'Supermarkt en voeding', parentSlug: SS.DAGELIJKSE_UITGAVEN },
  [SS.HUISHOUDEN_VERZORGING]: { name: 'Huishouden & verzorging', icon: 'SprayCan', description: 'Schoonmaak en persoonlijke verzorging', parentSlug: SS.DAGELIJKSE_UITGAVEN },
  [SS.KINDEREN_SCHOOL]: { name: 'Kinderen & school/opvang', icon: 'Baby', description: 'Schoolgeld, opvang, kinderkosten', parentSlug: SS.DAGELIJKSE_UITGAVEN },
  [SS.MEDISCHE_KOSTEN]: { name: 'Medische kosten', icon: 'HeartPulse', description: 'Eigen risico, medicijnen, tandarts', parentSlug: SS.DAGELIJKSE_UITGAVEN },
  [SS.HUISDIEREN]: { name: 'Huisdieren', icon: 'PawPrint', description: 'Voer, dierenarts, verzekering', parentSlug: SS.DAGELIJKSE_UITGAVEN },
  // Vervoer
  [SS.BRANDSTOF_OV]: { name: 'Brandstof / laden & OV', icon: 'Fuel', description: 'Benzine, elektrisch laden, OV', parentSlug: SS.VERVOER },
  [SS.AUTO_VASTE_LASTEN]: { name: 'Auto vaste lasten', icon: 'CarFront', description: 'Wegenbelasting, verzekering, leasekosten', parentSlug: SS.VERVOER },
  [SS.AUTO_ONDERHOUD]: { name: 'Auto onderhoud & parkeren', icon: 'Wrench', description: 'APK, reparaties, parkeren', parentSlug: SS.VERVOER },
  [SS.FIETS_DEELVERVOER]: { name: 'Fiets / deelvervoer', icon: 'Bike', description: 'Fietsonderhoud, deelscooter', parentSlug: SS.VERVOER },
  // Leuke dingen & lifestyle
  [SS.UIT_ETEN_HORECA]: { name: 'Uit eten, horeca & afhalen', icon: 'UtensilsCrossed', description: 'Restaurants, cafés, bezorging', parentSlug: SS.LEUKE_DINGEN },
  [SS.VRIJE_TIJD_SPORT]: { name: 'Vrije tijd, hobby\'s & sport', icon: 'Dumbbell', description: 'Sport, streaming, hobby\'s', parentSlug: SS.LEUKE_DINGEN },
  [SS.VAKANTIE]: { name: 'Vakantie & weekendjes weg', icon: 'Palmtree', description: 'Vakanties en uitstapjes', parentSlug: SS.LEUKE_DINGEN },
  [SS.KLEDING_OVERIGE]: { name: 'Kleding & overige', icon: 'Shirt', description: 'Kleding, schoenen, accessoires', parentSlug: SS.LEUKE_DINGEN },
  [SS.CADEAUS_FEESTDAGEN]: { name: 'Cadeaus & feestdagen', icon: 'Gift', description: 'Verjaardagen, Sinterklaas, kerst', parentSlug: SS.LEUKE_DINGEN },
  // Sparen & investeren
  [SS.SPAREN_NOODBUFFER]: { name: 'Sparen & noodbuffer', icon: 'Vault', description: 'Noodfonds en spaargeld', parentSlug: SS.SPAREN_SCHULDEN },
  [SS.INVESTEREN_FIRE]: { name: 'Investeren / FIRE / pensioen', icon: 'TrendingUp', description: 'Beleggingen en pensioenopbouw', parentSlug: SS.SPAREN_SCHULDEN },
  // Schulden & aflossingen
  [SS.SCHULDEN_AFLOSSINGEN]: { name: 'Schulden & aflossingen', icon: 'CreditCard', description: 'Leningen en schulden aflossen', parentSlug: SS.SCHULDEN_AFLOSSINGEN_PARENT },
  [SS.EXTRA_AFLOSSING_HYPOTHEEK]: { name: 'Extra aflossing hypotheek', icon: 'HomeIcon', description: 'Vrijwillige extra hypotheekaflossing', parentSlug: SS.SCHULDEN_AFLOSSINGEN_PARENT },
  // Eigen rekening (archive)
  [SS.EIGEN_REKENING_SUB]: { name: 'Eigen rekening', icon: 'ArrowLeftRight', description: 'Overboekingen tussen eigen rekeningen', parentSlug: SS.EIGEN_REKENING },
}

/**
 * Bouw een deelbudget uit de catalogus + een limiet. Eén plek waar
 * naam/icoon/omschrijving vandaan komen, zodat `getDefaultBudgets()` en de
 * template-builder niet uit elkaar lopen.
 */
export function leafSeed(slug: string, defaultLimit: number): SeedChild {
  const meta = BUDGET_LEAF_META[slug]
  if (!meta) throw new Error(`Onbekende leaf-slug in catalogus: ${slug}`)
  return {
    name: meta.name,
    slug,
    icon: meta.icon,
    description: meta.description,
    default_limit: defaultLimit,
  }
}

/**
 * Bouw een hoofdbudget-romp (zonder children) uit de catalogus + een limiet.
 * Children worden door de caller toegevoegd.
 */
export function parentSeed(slug: string, defaultLimit: number): Omit<SeedBudget, 'children'> {
  const meta = BUDGET_PARENT_META[slug]
  if (!meta) throw new Error(`Onbekende parent-slug in catalogus: ${slug}`)
  return {
    name: meta.name,
    slug,
    icon: meta.icon,
    description: meta.description,
    default_limit: defaultLimit,
    budget_type: meta.budget_type,
    is_essential: meta.is_essential,
    priority_score: meta.priority_score,
    sort_order: meta.sort_order,
  }
}

export function getDefaultBudgets(): SeedBudget[] {
  const S = BUDGET_SLUGS
  return [
    {
      ...parentSeed(S.INKOMEN, 3367),
      children: [
        leafSeed(S.SALARIS_UITKERING, 2800),
        leafSeed(S.TOESLAGEN_KINDERBIJSLAG, 200),
        leafSeed(S.TERUGGAVE_BELASTING, 167),
        leafSeed(S.OVERIGE_INKOMSTEN, 200),
      ],
    },
    {
      // 6 children (sum 1220): de 4 oorspronkelijke + 2 nieuwe vaste lasten
      // (telefoon-internet-tv €45, abonnementen-contributies €25). Parent
      // gelijk aan de som van de children (invariant in deze seed).
      ...parentSeed(S.VASTE_LASTEN_WONEN, 1220),
      children: [
        leafSeed(S.HUUR_HYPOTHEEK, 750),
        leafSeed(S.GAS_WATER_LICHT, 200),
        leafSeed(S.VERZEKERINGEN_WONEN, 150),
        leafSeed(S.GEMEENTELIJKE_LASTEN, 50),
        leafSeed(S.TELEFOON_INTERNET_TV, 45),
        leafSeed(S.ABONNEMENTEN_CONTRIBUTIES, 25),
      ],
    },
    {
      ...parentSeed(S.DAGELIJKSE_UITGAVEN, 550),
      children: [
        leafSeed(S.BOODSCHAPPEN, 400),
        leafSeed(S.HUISHOUDEN_VERZORGING, 60),
        leafSeed(S.KINDEREN_SCHOOL, 50),
        leafSeed(S.MEDISCHE_KOSTEN, 40),
      ],
    },
    {
      ...parentSeed(S.VERVOER, 200),
      children: [
        leafSeed(S.BRANDSTOF_OV, 80),
        leafSeed(S.AUTO_VASTE_LASTEN, 70),
        leafSeed(S.AUTO_ONDERHOUD, 30),
        leafSeed(S.FIETS_DEELVERVOER, 20),
      ],
    },
    {
      ...parentSeed(S.LEUKE_DINGEN, 350),
      children: [
        leafSeed(S.UIT_ETEN_HORECA, 100),
        leafSeed(S.VRIJE_TIJD_SPORT, 80),
        leafSeed(S.VAKANTIE, 100),
        leafSeed(S.KLEDING_OVERIGE, 70),
      ],
    },
    {
      ...parentSeed(S.SPAREN_SCHULDEN, 180),
      children: [
        leafSeed(S.SPAREN_NOODBUFFER, 100),
        leafSeed(S.INVESTEREN_FIRE, 80),
      ],
    },
    {
      ...parentSeed(S.SCHULDEN_AFLOSSINGEN_PARENT, 80),
      children: [
        leafSeed(S.SCHULDEN_AFLOSSINGEN, 60),
        leafSeed(S.EXTRA_AFLOSSING_HYPOTHEEK, 20),
      ],
    },
    {
      ...parentSeed(S.EIGEN_REKENING, 0),
      children: [
        leafSeed(S.EIGEN_REKENING_SUB, 0),
      ],
    },
  ]
}

/** Minimale vorm van een budget-groep (hoofdcategorie + subbudgetten) voor de keuzelijst. */
export type BudgetSelectGroup = {
  parent: { id: string; name: string; budget_type: Budget['budget_type']; ownership?: 'personal' | 'shared' }
  children: { id: string; name: string; ownership?: 'personal' | 'shared' }[]
}

/** Eén regel in een budget-keuzelijst: óf een optgroup-kop met opties, óf een losse optie. */
export type BudgetSelectEntry =
  | {
      kind: 'group'
      id: string
      label: string
      ownership?: 'personal' | 'shared'
      options: { id: string; name: string; ownership?: 'personal' | 'shared' }[]
    }
  | { kind: 'option'; id: string; name: string; ownership?: 'personal' | 'shared' }

/**
 * Weergavelabel voor een budget-optie in een keuzelijst: gedeelde budgetten
 * krijgen het suffix "· Gezamenlijk" zodat in elk categoriseer-scherm zichtbaar
 * is dat een keuze het huishoudbudget raakt.
 */
export function budgetOptionLabel(option: { name: string; ownership?: 'personal' | 'shared' }): string {
  return option.ownership === 'shared' ? `${option.name} · Gezamenlijk` : option.name
}

/**
 * Bouw de keuzelijst voor het toewijzen van een transactie aan een budget.
 *
 * Normale hoofdcategorieën met subbudgetten worden als <optgroup> getoond — de
 * hoofdcategorie zelf is dan een niet-selecteerbaar label en de subbudgetten zijn
 * de selecteerbare opties.
 *
 * Archive-"emmers" zoals **Eigen rekening** zijn conceptueel één platte categorie.
 * Hun subpost(en) worden als losse, direct-selecteerbare opties getoond (geen
 * optgroup-kop). Anders verschijnt "Eigen rekening" als niet-klikbare kop met een
 * gelijknamig subitem eronder — waardoor het lijkt alsof de eigen rekening "niet
 * te kiezen" is. Heeft de emmer (nog) geen subpost, dan valt de optie terug op de
 * hoofdpost zelf (zelfde fallback als `resolveEigenRekeningBudgetId`).
 *
 * Hoofdbudgetten zónder subbudgetten (bv. het Minimalistisch-template: je boekt
 * direct op het hoofdbudget) zijn zelf een direct-selecteerbare optie — anders
 * zou een minimalistisch plan onbruikbaar zijn in de handmatige toewijs-UI's
 * terwijl de AI-categorisatie ze wél kan kiezen.
 */
export function buildBudgetSelectEntries(groups: BudgetSelectGroup[]): BudgetSelectEntry[] {
  const entries: BudgetSelectEntry[] = []
  for (const group of groups) {
    if (group.parent.budget_type === 'archive' || group.children.length === 0) {
      const leaves = group.children.length > 0 ? group.children : [group.parent]
      for (const leaf of leaves) {
        entries.push({ kind: 'option', id: leaf.id, name: leaf.name, ownership: leaf.ownership })
      }
    } else {
      entries.push({
        kind: 'group',
        id: group.parent.id,
        label: group.parent.name,
        ownership: group.parent.ownership,
        options: group.children.map((c) => ({ id: c.id, name: c.name, ownership: c.ownership })),
      })
    }
  }
  return entries
}

/**
 * Resolve de budget-id van de "Eigen rekening"-post (archive) waar
 * eigen-rekening-verschuivingen op landen. Voorkeur voor de leaf-subpost
 * (`eigen-rekening-sub`), val terug op de parent (`eigen-rekening`); null als
 * geen van beide bestaat.
 */
export function resolveEigenRekeningBudgetId(
  budgets: { id: string; slug: string | null }[],
): string | null {
  const sub = budgets.find((b) => b.slug === BUDGET_SLUGS.EIGEN_REKENING_SUB)
  if (sub) return sub.id
  const parent = budgets.find((b) => b.slug === BUDGET_SLUGS.EIGEN_REKENING)
  return parent?.id ?? null
}

/**
 * Generates mock spending data for budgets in a given month.
 * Returns a map of budget name -> spent amount.
 */
export function getMockSpending(monthOffset = 0): Record<string, number> {
  const variance = (base: number, seed: number) => {
    const factor = 0.7 + ((seed * 17 + monthOffset * 31) % 60) / 100
    return Math.round(base * factor)
  }

  return {
    // Inkomen
    'Salaris & uitkering': 2800,
    'Toeslagen & kinderbijslag': variance(200, 1),
    'Teruggave belasting': variance(167, 2),
    'Overige inkomsten': variance(200, 3),
    // Vaste lasten
    'Huur / hypotheek': 750,
    'Gas, water, licht': variance(200, 4),
    'Verzekeringen wonen & gezondheid': 150,
    'Gemeentelijke & overige vaste lasten': 50,
    // Dagelijkse uitgaven
    'Boodschappen': variance(400, 5),
    'Huishouden & verzorging': variance(60, 6),
    'Kinderen & school/opvang': variance(50, 7),
    'Medische kosten': variance(40, 8),
    // Vervoer
    'Brandstof / laden & OV': variance(80, 9),
    'Auto vaste lasten': 70,
    'Auto onderhoud & parkeren': variance(30, 10),
    'Fiets / deelvervoer': variance(20, 11),
    // Leuke dingen
    'Uit eten, horeca & afhalen': variance(100, 12),
    "Vrije tijd, hobby's & sport": variance(80, 13),
    'Vakantie & weekendjes weg': variance(100, 14),
    'Kleding & overige': variance(70, 15),
    // Sparen
    'Sparen & noodbuffer': 100,
    'Investeren / FIRE / pensioen': 80,
    'Schulden & aflossingen': 60,
    'Extra aflossing hypotheek': 20,
  }
}

/**
 * Generates 12 months of mock spending history for a budget name.
 */
export function getMockHistory(budgetName: string): { month: string; budget: number; spent: number }[] {
  const now = new Date()
  const months: { month: string; budget: number; spent: number }[] = []

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = date.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
    const spending = getMockSpending(i)
    const defaults = getDefaultBudgets()

    let limit = 0
    for (const parent of defaults) {
      if (parent.name === budgetName) {
        limit = parent.default_limit
        break
      }
      for (const child of parent.children ?? []) {
        if (child.name === budgetName) {
          limit = child.default_limit
          break
        }
      }
      if (limit > 0) break
    }

    months.push({
      month: label,
      budget: limit,
      spent: spending[budgetName] ?? 0,
    })
  }

  return months
}
