/**
 * Zod-contract voor de grenzenpot-mutatieroutes (ADR 0044: `parseBody`).
 *
 * Eén schema voor POST én PATCH. Dat is bewust: het formulier stuurt altijd de
 * volledige configuratie terug, en twee half-overlappende schema's zouden
 * onvermijdelijk uit elkaar lopen. "Pauzeren" is dus geen apart endpoint maar
 * dezelfde body met `isActive: false`.
 *
 * De tegenpartij-SLEUTEL komt hier bewust NIET uit de body: de client stuurt
 * alleen het label (wat de gebruiker koos of typte), en de server leidt de
 * genormaliseerde sleutel af met dezelfde functie die de uitleg in de UI voedt.
 * Zo kan een client geen sleutel meesturen die afwijkt van zijn eigen label —
 * en blijft de sleutel per definitie in het formaat dat de SQL-functie verwacht.
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

// Alle drie de kalenderperiodes die de motor uitrekent (zie
// SpendLimitPeriodKind in lib/spend-limits/engine.ts). De check-constraint van de
// tabel liet ze al toe; sinds fase 5 kan de motor ze ook. `.default('month')`
// houdt bestaande clients die geen `period` meesturen ongewijzigd werkend.
const PERIOD = z.enum(['month', 'quarter', 'year']).default('month')

export const SpendLimitInputSchema = z.discriminatedUnion('ruleType', [
  z.object({
    ruleType: z.literal('budget'),
    name: NAME,
    purpose: PURPOSE,
    limitAmount: LIMIT,
    period: PERIOD,
    isActive: z.boolean().default(true),
    budgetId: z.string().uuid('Kies een geldig budget'),
    includeChildBudgets: z.boolean().default(true),
  }),
  z.object({
    ruleType: z.literal('counterparty'),
    name: NAME,
    purpose: PURPOSE,
    limitAmount: LIMIT,
    period: PERIOD,
    isActive: z.boolean().default(true),
    counterpartyLabel: z
      .string()
      .trim()
      .min(2, 'Geef minstens twee tekens om op te matchen')
      .max(120, 'Tegenpartij is te lang'),
  }),
])

export type SpendLimitInput = z.infer<typeof SpendLimitInputSchema>

/**
 * Body van de match-preview (POST /api/spend-limits/preview).
 *
 * ── WAAROM DEZELFDE DISCRIMINATOR ALS HET HOOFDSCHEMA ───────────────────────
 * De preview beantwoordt "wat raakt deze regel eigenlijk?" — en er zijn twee
 * regelsoorten. Een preview die alleen tegenpartij-regels kent, laat de gebruiker
 * bij een budget-pot blind opslaan, precies wat B3 wilde wegnemen. De vorm van de
 * body volgt daarom `SpendLimitInputSchema`: `ruleType` als discriminator, met per
 * tak exact de velden die de match bepalen. Één invoervorm voor "wat ga ik
 * opslaan" en "wat raakt dat", zodat het formulier niet hoeft te vertalen.
 *
 * De tegenpartij-tak draagt alleen het LABEL: de server leidt de genormaliseerde
 * sleutel af met `spendLimitCounterpartyKey`, zodat de preview per definitie
 * dezelfde match toont als de pot straks telt. De minimumlengte staat daar bewust
 * op 1 en niet op 2 — een te kort label mag geen validatiefout opleveren maar een
 * expliciete "te kort om te matchen"-uitkomst, anders leest een gebruiker
 * halverwege het typen een misleidend "0 matches".
 *
 * `period` bepaalt uitsluitend hoe ver het preview-venster terugkijkt (via
 * SPEND_LIMIT_WINDOW_BY_PERIOD), niet wélke transacties matchen.
 */
const PREVIEW_SHARED = {
  period: PERIOD,
  /**
   * De pot die je aan het BEWERKEN bent. Die mag zichzelf niet als overlappende
   * pot terugkrijgen ("deze uitgaven kunnen ook meetellen in <deze pot>") — dat
   * leest als een waarschuwing terwijl het de regel zelf is.
   */
  excludeLimitId: z.string().uuid('Ongeldig ID').nullish(),
}

export const spendLimitPreviewSchema = z.discriminatedUnion('ruleType', [
  z.object({
    ruleType: z.literal('counterparty'),
    counterpartyLabel: z
      .string()
      .trim()
      .min(1, 'Geef een tegenpartij op')
      .max(120, 'Tegenpartij is te lang'),
    ...PREVIEW_SHARED,
  }),
  z.object({
    ruleType: z.literal('budget'),
    budgetId: z.string().uuid('Kies een geldig budget'),
    // Zelfde default als het hoofdschema: de preview moet dezelfde subboom
    // optellen als de pot die eruit ontstaat.
    includeChildBudgets: z.boolean().default(true),
    ...PREVIEW_SHARED,
  }),
])

export type SpendLimitPreviewInput = z.infer<typeof spendLimitPreviewSchema>
