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
  /**
   * Budget-id. Optioneel en ALLEEN gebruikt door het lokale privé-modus-pad
   * (createLocalAiResolver), dat de door het model teruggegeven slug direct naar
   * een budget_id moet mappen zonder een aparte slugToId-map. Het cloud-pad
   * bewaart de id juist buiten deze optie (in slugToId, zie
   * categorize-budget-options.ts) en negeert dit veld — de systeemprompt gebruikt
   * het nooit, dus de prompt-output verandert er niet door.
   */
  id?: string | null
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

// ── Snoeigrens voor het LOKALE pad ────────────────────────────────────────────
//
// Het budgetblok groeit LINEAIR met het aantal leaf-budgetten (~15 tokens per
// regel, meer met een lange toelichting). De cloud heeft daar geen last van
// (ruime contextvensters), maar het lokale model deelt één venster van 8192
// tokens (LOCAL_MODEL_TOKEN_BUDGET) tussen systeemprompt én de transacties die
// het moet plaatsen. Bij honderden budgetten verdringt de LIJST dus precies de
// gegevens waarover hij gaat.
//
// Wat we snoeien: alleen de OPTIONELE toelichting. Nooit budgetregels zelf —
// een weggelaten budget kan het model niet meer kiezen, en dat is stille
// kwaliteitsverlies i.p.v. besparing. De toelichting is verrijking; de slug,
// naam, hoofdbudget en het type zijn de eigenlijke keuze-informatie.
//
// Twee trappen, oplopend met de grootte van de lijst:
//   • boven LOCAL_BUDGET_DESC_TRIM_FROM  → toelichtingen ingekort tot
//     LOCAL_BUDGET_DESC_MAX_CHARS tekens (kop behouden, staart weg);
//   • boven LOCAL_BUDGET_DESC_DROP_FROM  → toelichtingen helemaal weg.

/** Vanaf dit aantal leaf-budgetten kort het lokale pad toelichtingen in. */
export const LOCAL_BUDGET_DESC_TRIM_FROM = 40
/** Maximale lengte van een ingekorte toelichting (exclusief het beletselteken). */
export const LOCAL_BUDGET_DESC_MAX_CHARS = 60
/** Vanaf dit aantal leaf-budgetten laat het lokale pad toelichtingen wég. */
export const LOCAL_BUDGET_DESC_DROP_FROM = 120

/** Hoe uitgebreid de toelichting per budgetregel mag zijn. */
type DescriptionMode = 'volledig' | 'ingekort' | 'weg'

/**
 * Bepaal de snoeimodus. Het CLOUD-pad krijgt altijd 'volledig' — het gedrag daar
 * blijft byte-voor-byte gelijk aan vóór deze snoeigrens.
 */
export function descriptionModeFor(aantalBudgetten: number, lokaal: boolean): DescriptionMode {
  if (!lokaal) return 'volledig'
  if (aantalBudgetten > LOCAL_BUDGET_DESC_DROP_FROM) return 'weg'
  if (aantalBudgetten > LOCAL_BUDGET_DESC_TRIM_FROM) return 'ingekort'
  return 'volledig'
}

/** Rendert het toelichting-achtervoegsel van een budgetregel volgens de modus. */
function formatDescription(raw: string | null | undefined, mode: DescriptionMode): string {
  const desc = raw?.trim()
  if (!desc || mode === 'weg') return ''
  if (mode === 'volledig' || desc.length <= LOCAL_BUDGET_DESC_MAX_CHARS) return ` — ${desc}`
  // Op tekengrens afkappen is genoeg: de toelichting is een hint, geen contract.
  return ` — ${desc.slice(0, LOCAL_BUDGET_DESC_MAX_CHARS).trimEnd()}…`
}

function formatBudgetLine(b: CategorizeBudgetOption, mode: DescriptionMode = 'volledig'): string {
  const parent = b.parentName ? ` (onder "${b.parentName}")` : ''
  const desc = formatDescription(b.description, mode)
  return `- ${b.slug} = "${b.name}"${parent} [${TYPE_LABEL[b.type]}]${desc}`
}

export type CategorizeSystemPromptOpts = {
  /**
   * Draait deze prompt op het LOKALE (on-device) pad? Dan geldt de snoeigrens
   * hierboven. Default false = cloud, ongewijzigd gedrag. Alleen
   * `createLocalAiResolver` zet dit aan.
   */
  lokaal?: boolean
}

/**
 * Bouwt de categorisatie-systeemprompt rond de echte toewijsbare budgetten van
 * de gebruiker. Geef de leaf-budgetten mee (eigen + gedeelde huishoudbudgetten;
 * geen parent-met-children). Zonder budgetten valt de prompt terug op de
 * statische variant (geen opties → model geeft altijd null, wat correct is).
 *
 * `opts.lokaal` snoeit de toelichtingen bij een grote budgetlijst — zie de
 * toelichting bij de snoeigrens hierboven. De cloud-uitvoer verandert niet.
 */
export function buildCategorizeSystemPrompt(
  budgets: CategorizeBudgetOption[],
  opts: CategorizeSystemPromptOpts = {},
): string {
  if (!budgets || budgets.length === 0) {
    return CATEGORIZE_SYSTEM_PROMPT
  }

  const mode = descriptionModeFor(budgets.length, !!opts.lokaal)
  const budgetBlock = budgets.map((b) => formatBudgetLine(b, mode)).join('\n')

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

// ── User-message (single source of truth) ─────────────────────────────────────
//
// De opbouw van de user-message (de transactieregels + instructie) leefde inline
// in app/api/ai/categorize/route.ts. Ze is hierheen verplaatst zodat het lokale
// privé-modus-pad exact dezelfde opbouw hergebruikt in plaats van een tweede,
// verwaterende variant. Twee takken:
//
//   1. DEFAULT (geen opts) — byte-voor-byte identiek aan wat de route altijd
//      deed. De route levert de velden AL gesaniteerd aan (sanitizeForAI
//      gebeurt in de route, niet hier), zodat het cloud-gedrag ongewijzigd is en
//      deze functie zelf géén PII-afhankelijkheid heeft.
//   2. LOKAAL (opts.idEcho / opts.kort) — de id-echo-variant voor on-device
//      inferentie: elke transactie krijgt een kort batch-id (t1..tN) dat het
//      model per item terugecho't (mappen op id i.p.v. positie), plus een
//      expliciete JSON-output-instructie (het lokale pad heeft geen zod-schema
//      dat de vorm afdwingt). `kort` laat het reasoning-veld weg (grootste
//      decode-snelheidshefboom). Het lokale pad saniteert bewust NIET (FR-3.5).

/** Minimale transactievorm voor de user-message. Velden zijn al in weergavevorm. */
export type CategorizeUserPromptTx = {
  description?: string | null
  counterparty_name?: string | null
  amount: number
  date?: string | null
  reference?: string | null
}

export type CategorizeUserPromptOpts = {
  /** Elke transactie krijgt een batch-id (t1..tN) dat het model terugecho't. */
  idEcho?: boolean
  /** Laat het reasoning-veld weg uit het gevraagde output-schema (sneller). */
  kort?: boolean
}

/** Batch-lokaal id voor de transactie op index i (t1-based). Gedeeld tussen de
 *  prompt-opbouw en de resolver-id-mapping zodat het schema één bron heeft. */
export function batchItemId(i: number): string {
  return `t${i + 1}`
}

function formatTxParts(tx: CategorizeUserPromptTx): string[] {
  return [
    `beschrijving: ${tx.description ?? ''}`,
    tx.counterparty_name ? `tegenpartij: ${tx.counterparty_name}` : null,
    `bedrag: ${tx.amount > 0 ? '+' : ''}${tx.amount}`,
    tx.date ? `datum: ${tx.date}` : null,
    tx.reference ? `referentie: ${tx.reference}` : null,
  ].filter(Boolean) as string[]
}

/**
 * Bouwt de user-message voor de categorisatie-call.
 *
 * Zonder opts: exact het gedrag van de route (positioneel, geen expliciete
 * JSON-instructie — dat doet het zod-schema in de cloud). Met opts.idEcho/kort:
 * de lokale id-echo-variant.
 */
export function buildCategorizeUserPrompt(
  transactions: CategorizeUserPromptTx[],
  opts: CategorizeUserPromptOpts = {},
): string {
  const n = transactions.length
  const local = !!(opts.idEcho || opts.kort)

  if (!local) {
    // ── DEFAULT (cloud) — byte-voor-byte de bestaande route-opbouw ──
    return `Categoriseer de volgende ${n} transacties.\nRetourneer een array van exact ${n} items in dezelfde volgorde.\n\n${transactions
      .map((tx, i) => `${i + 1}. ${formatTxParts(tx).join('\n   ')}`)
      .join('\n\n')}`
  }

  // ── LOKAAL — id-echo + expliciete JSON-instructie ──
  const kort = !!opts.kort
  const body = transactions
    .map((tx, i) => `${batchItemId(i)}:\n   ${formatTxParts(tx).join('\n   ')}`)
    .join('\n\n')

  const schema = kort
    ? '[{"id": "t1", "budget_slug": "<slug-uit-de-lijst-of-null>", "confidence": <getal 0..1>}]'
    : '[{"id": "t1", "budget_slug": "<slug-uit-de-lijst-of-null>", "confidence": <getal 0..1>, "reasoning": "<max 1 NL-zin>"}]'

  const kortHint = kort
    ? '\nGeef GEEN reasoning-veld — alleen id, budget_slug en confidence per item.'
    : ''

  return `Categoriseer de volgende ${n} transacties.
Geef bij ELK item exact het meegegeven "id" terug (bv. "t3"). Retourneer exact ${n} items; volgorde maakt niet uit, het id koppelt.

${body}

Antwoord UITSLUITEND met een geldige JSON-array van exact ${n} objecten, zonder extra tekst en zonder markdown-fences:
${schema}${kortHint}
BELANGRIJK: past geen enkel budget uit de lijst écht, gebruik dan "budget_slug": null met confidence onder 0.5 — een onzekere gok met hoge confidence is fout. Wees streng op confidence: alleen >= 0.5 wanneer je de tegenpartij of het bestedingsdoel echt herkent.
Begin je antwoord direct met '[' en eindig met ']'.`
}
