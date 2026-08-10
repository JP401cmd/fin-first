/**
 * Zod-contract voor de grenzenpot-mutatieroutes (ADR 0044: `parseBody`).
 *
 * Eén schema voor POST én PATCH. Dat is bewust: het formulier stuurt altijd de
 * volledige configuratie terug, en twee half-overlappende schema's zouden
 * onvermijdelijk uit elkaar lopen. "Pauzeren" is dus geen apart endpoint maar
 * dezelfde body met `isActive: false`.
 *
 * ── WAAROM DIT SINDS 10-08-2026 GÉÉN DISCRIMINATED UNION MEER IS ────────────
 * Tot fase 5 was een pot óf een budget-regel óf een tegenpartij-regel, en dat
 * liet zich netjes als `z.discriminatedUnion('ruleType', …)` schrijven. Een pot
 * draagt nu een LIJST regels, en elke regel kan beide dimensies tegelijk
 * gebruiken (budget X én tegenpartij Y). Er is dus niets meer om op te
 * discrimineren: de vorm is één object met een `rules`-array, en de betekenis
 * van een regel volgt uit wélke lijsten gevuld zijn.
 *
 * De tegenpartij-SLEUTEL komt hier bewust NIET uit de body: de client stuurt
 * alleen de labels (wat de gebruiker koos of typte), en de server leidt de
 * genormaliseerde sleutels af — sinds deze wijziging zelfs in SQL, in
 * `public.spend_limit_replace_rules`. Zo kan een client geen sleutel meesturen
 * die afwijkt van zijn eigen label, en zit de sleutel per definitie in het
 * formaat dat de aggregaat-functie en de CHECK verwachten.
 */

import { z } from 'zod'

// Naam-NEUTRAAL: de weergavenaam van een pot is een gebruikersvoorkeur
// (grenzenpot/schaamtepot, lib/spend-limits/copy.ts) en hoort dus niet in een
// validatiemelding vast te staan.
const NAME = z.string().trim().min(1, 'Geef een naam op').max(60, 'Naam is te lang')
const PURPOSE = z.string().trim().max(240, 'Omschrijving is te lang').nullish()
const LIMIT = z
  .number()
  .finite('Grensbedrag moet een getal zijn')
  .min(0, 'Grensbedrag kan niet negatief zijn')
  .max(10_000_000, 'Grensbedrag is onrealistisch hoog')

/**
 * Alle vijf de periodesoorten die de motor uitrekent (zie `SpendLimitPeriodKind`
 * in lib/spend-limits/engine.ts). `.default('month')` houdt bestaande clients die
 * geen `period` meesturen ongewijzigd werkend.
 */
const PERIOD = z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month')

/**
 * Bovengrenzen per regel — dezelfde getallen als de CHECK
 * `spend_limit_rules_size` in de migratie. Ze staan hier zodat een gebruiker een
 * begrijpelijke 400 krijgt in plaats van een rauwe constraint-fout, en dáár
 * omdat de tabel onder own-row RLS ook rechtstreeks beschrijfbaar is.
 */
const MAX_BUDGETS_PER_RULE = 200
const MAX_COUNTERPARTIES_PER_RULE = 50
/** Bovengrens op het aantal regels per pot; ruim boven elk realistisch gebruik. */
const MAX_RULES = 20

const BUDGET_IDS = z
  .array(z.string().uuid('Kies een geldig budget'))
  .max(MAX_BUDGETS_PER_RULE, 'Te veel budgetten in één regel')
  .default([])

const COUNTERPARTY_LABELS = z
  .array(
    z
      .string()
      .trim()
      .min(2, 'Geef minstens twee tekens om op te matchen')
      .max(120, 'Tegenpartij is te lang'),
  )
  .max(MAX_COUNTERPARTIES_PER_RULE, 'Te veel tegenpartijen in één regel')
  .default([])

/**
 * Eén regel. De `refine` is de TS-kant van de CHECK `spend_limit_rules_not_empty`:
 * een regel zonder enige dimensie zou op álle zichtbare transacties matchen, en
 * dat is nooit wat iemand bedoelt.
 */
const RULE = z
  .object({
    budgetIds: BUDGET_IDS,
    includeChildBudgets: z.boolean().default(true),
    counterpartyLabels: COUNTERPARTY_LABELS,
  })
  .refine((r) => r.budgetIds.length > 0 || r.counterpartyLabels.length > 0, {
    message: 'Kies minstens één budget of tegenpartij in elke regel',
  })

export const SpendLimitInputSchema = z.object({
  name: NAME,
  purpose: PURPOSE,
  limitAmount: LIMIT,
  period: PERIOD,
  isActive: z.boolean().default(true),
  rules: z
    .array(RULE)
    .min(1, 'Een grens heeft minstens één regel nodig')
    .max(MAX_RULES, 'Te veel regels in één pot'),
})

export type SpendLimitInput = z.infer<typeof SpendLimitInputSchema>
export type SpendLimitRuleInput = SpendLimitInput['rules'][number]

/**
 * Body van de match-preview (POST /api/spend-limits/preview).
 *
 * ── WAAROM DEZELFDE REGELVORM ALS HET HOOFDSCHEMA ──────────────────────────
 * De preview beantwoordt "wat raakt deze regel eigenlijk?" — en dat moet exact
 * dezelfde vraag zijn als "wat gaat deze regel straks tellen". De body draagt
 * daarom één regel in precies de vorm van `RULE`, zodat het formulier niets hoeft
 * te vertalen en de preview per definitie dezelfde match toont als de pot.
 *
 * TWEE BEWUSTE AFWIJKINGEN t.o.v. `RULE`:
 *  - de minimumlengte op een label staat hier op 1 en niet op 2. Een te kort
 *    label mag geen validatiefout opleveren maar een expliciete "te kort om te
 *    matchen"-uitkomst, anders leest een gebruiker halverwege het typen een
 *    misleidend "0 matches" — of erger, een rode melding terwijl hij nog bezig is.
 *  - er is GEEN `refine` op "minstens één dimensie". Een leeg formulier hoort
 *    een lege preview te geven, geen 400.
 *
 * `period` bepaalt uitsluitend hoe ver het preview-venster terugkijkt (via
 * SPEND_LIMIT_WINDOW_BY_PERIOD) en op welke korrel de sommen komen, niet wélke
 * transacties matchen.
 */
export const spendLimitPreviewSchema = z.object({
  budgetIds: BUDGET_IDS,
  includeChildBudgets: z.boolean().default(true),
  counterpartyLabels: z
    .array(z.string().trim().min(1, 'Geef een tegenpartij op').max(120, 'Tegenpartij is te lang'))
    .max(MAX_COUNTERPARTIES_PER_RULE, 'Te veel tegenpartijen in één regel')
    .default([]),
  period: PERIOD,
  /**
   * De pot die je aan het BEWERKEN bent. Die mag zichzelf niet als overlappende
   * pot terugkrijgen ("deze uitgaven kunnen ook meetellen in <deze pot>") — dat
   * leest als een waarschuwing terwijl het de regel zelf is.
   */
  excludeLimitId: z.string().uuid('Ongeldig ID').nullish(),
})

export type SpendLimitPreviewInput = z.infer<typeof spendLimitPreviewSchema>
