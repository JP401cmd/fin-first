// ── Categorize System Prompt — transaction → budget categorization ────────────
//
// Single source of truth voor de AI-systeemprompt die banktransacties toewijst
// aan budgetten.
//
// Twee exports, bewust naast elkaar:
//
//   1. buildCategorizeSystemPrompt(budgets)  ← CANONIEK, gebruik dit.
//      Bouwt de prompt rond de ÉCHTE toewijsbare budgetten van de gebruiker
//      (eigen + gedeelde huishoudbudgetten; leaf-budgetten, een parent mét
//      children is geen optie). Het model kiest exact één aangeboden slug of
//      null. De route valideert het antwoord tegen dezelfde aangeboden set.
//
//   2. CATEGORIZE_SYSTEM_PROMPT  ← STATISCHE FALLBACK / AUDIT.
//      De prompt zonder budgetlijst — domeinkennis en regels, maar geen
//      concrete opties. Gebruikt door de admin-auditview
//      (app/api/admin/ai-prompts) als representatieve weergave en bruikbaar als
//      degenererende fallback wanneer er (nog) geen budgetten zijn. Op zichzelf
//      coherent zodat ai_system_prompt_override-vergelijkingen zinvol blijven.
//
// Imported by:
//   - app/api/ai/categorize/route.ts (categorisatie — buildCategorizeSystemPrompt)
//   - app/api/admin/ai-prompts/route.ts (admin audit view — CATEGORIZE_SYSTEM_PROMPT)

export type CategorizeBudgetOption = {
  slug: string
  name: string
  /** Naam van het hoofdbudget waaronder dit deelbudget valt, of null als het zelf top-level is. */
  parentName: string | null
  type: 'income' | 'expense' | 'savings' | 'debt'
  /** Optionele toelichting van de gebruiker bij dit budget. */
  description?: string | null
}

// ── Gedeelde domeinkennis & regels ────────────────────────────────────────────
// Nederlandse merkenkennis blijft als ALGEMENE richtlijn behouden, maar wordt
// nu geprojecteerd op de aangeboden budgetnamen i.p.v. op vaste slugs.

const DOMEINKENNIS = `NEDERLANDSE MERKEN- EN PATROONKENNIS (richtlijn — projecteer op de aangeboden budgetten):
- Boodschappen/supermarkt: Albert Heijn, Jumbo, Lidl, Aldi, Plus, Dirk, Spar, Picnic, Crisp, Gorillas.
- Drogist/verzorging: Etos, Kruidvat, DA, schoonmaakmiddelen, persoonlijke verzorging.
- Energie: Vattenfall, Eneco, Nuon, Greenchoice, Essent, Budget Thuis.
- Wonen vast: huur, hypotheek, woon-/inboedel-/opstalverzekering, gemeentebelasting, OZB, rioolheffing, afvalstoffen.
- Vervoer: tankstations (Shell, BP, Esso, Tango), OV (NS, Connexxion, Arriva, OV-chip), deelvervoer (Swapfiets, OV-fiets, Donkey, Bolt, Tier).
- Auto: wegenbelasting, autoverzekering, lease, garage, APK, banden, ANWB, parkeren.
- Uit eten/horeca: restaurants, cafés, snackbar, fastfood, bezorging (Thuisbezorgd, Uber Eats, Deliveroo).
- Vrije tijd/abonnementen: Netflix, Spotify, Disney+, sportschool, bioscoop, theater, games, niet-essentiële Bol.com.
- Vakantie: hotels, vliegtickets (KLM, Transavia, Ryanair), Booking.com, Airbnb, vakantieparken.
- Kleding/overig: H&M, Zara, Nike, Zalando, schoenen, accessoires, cadeaus.
- Medisch: apotheek, tandarts, huisarts, ziekenhuis, eigen risico, brillen/lenzen.
- Kinderen: school, kinderopvang, KDV, BSO, sportclub kinderen, schoolspullen.
- Inkomen: salaris, loon, uitkering, AOW, WW, toeslagen, belastingteruggave, freelance, dividend, rente.
- Sparen/beleggen: spaarrekening, noodbuffer, DEGIRO, Fidelity, Brand New Day, pensioenstorting.
- Schulden: leningaflossing, creditcard, studieschuld, persoonlijke lening, extra hypotheekaflossing.`

const REGELS = `REGELS:
1. Kies als budget_slug EXACT één slug uit de aangeboden budgetlijst, of null als geen enkel budget past. Verzin nooit een slug die niet in de lijst staat.
2. Liever null dan een gok: past geen enkel budget echt, geef dan null (de import laat de transactie dan ongecategoriseerd).
3. Geef alleen een slug terug bij confidence ≥ 0.5, anders null. Bij twijfel tussen opties: lagere confidence.
4. Tegenpartij/beschrijving + bedragrichting bepalen de match. Projecteer de merkenkennis hierboven op de NAAM (en het hoofdbudget) van de aangeboden budgetten — niet op vaste categorienamen.
5. Hiërarchie geeft betekenis: "Eten thuis" onder "Huishouden" ≠ "Eten buiten" onder "Leuke dingen". Kies bij meerdere plausibele opties het MEEST SPECIFIEke/passende deelbudget.
6. Bedragrichting: positief bedrag = inkomst → alleen naar een budget van type 'income'. Negatief bedrag = uitgave → nooit naar een 'income'-budget.
7. Geef je redenering in het Nederlands, max 1 zin.
8. Retourneer een array van exact N items in DEZELFDE VOLGORDE als de invoer. Geen extra velden.`

const PROJECTIE_VOORBEELDEN = `PROJECTIE-VOORBEELDEN (pas merkenkennis toe op de budgetnamen van DEZE gebruiker):
- Transactie "Albert Heijn" (uitgave) + gebruiker heeft 'Eten thuis' (eten-thuis) onder 'Huishouden' → eten-thuis.
- Transactie "NS Reizen" (uitgave) + gebruiker heeft 'Openbaar vervoer' (ov) onder 'Mobiliteit' → ov.
- Transactie "Thuisbezorgd.nl" (uitgave) + gebruiker heeft 'Uit eten & bezorgen' (uit-eten) onder 'Leuke dingen' → uit-eten (niet het boodschappen-budget).
- Transactie "Salaris werkgever" (positief) + gebruiker heeft 'Loon' (loon, type income) → loon (positief = inkomst, alleen income-budgetten).
- Geen passend budget aanwezig (bv. een onbekende eenmalige betaling) → null.`

// ── Dynamische budgetlijst → compact prompt-blok ──────────────────────────────

const TYPE_LABEL: Record<CategorizeBudgetOption['type'], string> = {
  income: 'inkomsten',
  expense: 'uitgave',
  savings: 'sparen',
  debt: 'schuld',
}

function formatBudgetLine(b: CategorizeBudgetOption): string {
  const parent = b.parentName ? ` (onder "${b.parentName}")` : ''
  const desc = b.description?.trim() ? ` — ${b.description.trim()}` : ''
  return `- ${b.slug} = "${b.name}"${parent} [${TYPE_LABEL[b.type]}]${desc}`
}

/**
 * Bouwt de categorisatie-systeemprompt rond de echte toewijsbare budgetten van
 * de gebruiker. Geef de leaf-budgetten mee (eigen + gedeelde huishoudbudgetten;
 * geen parent-met-children). Zonder budgetten valt de prompt terug op de
 * statische variant (geen opties → model geeft altijd null, wat correct is).
 */
export function buildCategorizeSystemPrompt(budgets: CategorizeBudgetOption[]): string {
  if (!budgets || budgets.length === 0) {
    return CATEGORIZE_SYSTEM_PROMPT
  }

  const budgetBlock = budgets.map(formatBudgetLine).join('\n')

  return `Je bent een Nederlandse financiële assistent die banktransacties categoriseert.

Wijs elke transactie toe aan ÉÉN van de budgetten van de gebruiker hieronder (of null als geen enkel budget past). Gebruik de slug links als budget_slug.

BUDGETTEN VAN DE GEBRUIKER (slug = "naam" (onder "hoofdbudget") [type] — toelichting):
${budgetBlock}

${DOMEINKENNIS}

${PROJECTIE_VOORBEELDEN}

${REGELS}`
}

/**
 * Statische fallback / audit-weergave: dezelfde domeinkennis en regels, maar
 * zonder concrete budgetlijst. Op zichzelf coherent. Wordt door de route als
 * fallback gebruikt wanneer er geen budgetten zijn (model geeft dan null).
 */
export const CATEGORIZE_SYSTEM_PROMPT = `Je bent een Nederlandse financiële assistent die banktransacties categoriseert.

Wijs elke transactie toe aan ÉÉN van de budgetten van de gebruiker (of null als geen enkel budget past). De toewijsbare budgetten van de gebruiker worden per verzoek meegegeven als een lijst van "slug = naam (onder hoofdbudget) [type]"; kies daaruit exact één slug als budget_slug, of null.

${DOMEINKENNIS}

${PROJECTIE_VOORBEELDEN}

${REGELS}`
