// lib/transactions/bulk-schemas.ts
//
// De zod-schema's van de vijf `/api/transactions/**`-routes, gebouwd op de types
// uit `bulk-contract.ts`.
//
// Waarom hier en niet per route: het criterium wordt door de zoek- én de
// manifest-route geaccepteerd, en die twee MOETEN exact hetzelfde accepteren.
// Zou de manifest-route een filter honoreren dat de zoekroute stil negeert (of
// omgekeerd), dan bevriest het manifest een andere verzameling dan de gebruiker
// beoordeeld heeft — precies het gat dat ADR 0104 dichttimmert. De validatie
// hoort dus bij het criterium, niet bij de route.
//
// Bewust NIET in `bulk-contract.ts`: dat bestand wordt ook door de clientbundel
// gelezen (de overlay leest de drempels) en zod hoort daar niet in.

import { z } from 'zod'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SEARCH_TERM_MAX_LENGTH,
  SELECTION_MAX,
} from './bulk-contract'
import { MIN_RULE_MATCH_LENGTH } from './rule-target'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Bovengrens op de filterlijsten: ruim boven elk realistisch aantal, ver onder een URL-probleem. */
const MAX_FILTER_IDS = 200

export const TransactionSearchCriteriaSchema = z.object({
  q: z.string().max(SEARCH_TERM_MAX_LENGTH, `Zoekterm is langer dan ${SEARCH_TERM_MAX_LENGTH} tekens`).optional(),
  accountIds: z.array(z.uuid()).max(MAX_FILTER_IDS).optional(),
  budgetIds: z.array(z.uuid().nullable()).max(MAX_FILTER_IDS).optional(),
  direction: z.enum(['expense', 'income']).optional(),
  amountMin: z.number().nonnegative().optional(),
  amountMax: z.number().nonnegative().optional(),
  dateFrom: z.string().regex(ISO_DATE, 'Ongeldige datum').optional(),
  dateTo: z.string().regex(ISO_DATE, 'Ongeldige datum').optional(),
})

export const TransactionSearchRequestSchema = TransactionSearchCriteriaSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

/** De criteriumvelden, als sleutellijst — zodat de check hieronder niet kan verouderen. */
const CRITERIA_KEYS = Object.keys(TransactionSearchCriteriaSchema.shape) as (keyof typeof TransactionSearchCriteriaSchema.shape)[]

/**
 * Het manifest krijgt hetzelfde criterium — zonder paginatie, want het
 * materialiseert alles — óf een expliciete id-lijst.
 *
 * De twee sluiten elkaar HARD uit. Zou een body allebei dragen, dan bepaalt de
 * routevolgorde welke wint en is dat verschil onzichtbaar tot iemand een
 * verkeerde verzameling verwijdert. Liever een 400 die niemand ooit ziet dan een
 * stille voorrangsregel op een pad dat hard delete voedt.
 */
export const SelectionManifestRequestSchema = TransactionSearchCriteriaSchema.extend({
  ids: z
    .array(z.uuid())
    .min(1, 'Geen transacties geselecteerd')
    .max(SELECTION_MAX, `Een selectie kan hoogstens ${SELECTION_MAX} transacties bevatten`)
    .optional(),
}).superRefine((data, ctx) => {
  if (!data.ids) return
  const meegestuurd = CRITERIA_KEYS.filter((key) => data[key] !== undefined)
  if (meegestuurd.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['ids'],
      message: `Een expliciete selectie draagt geen criterium mee (${meegestuurd.join(', ')}).`,
    })
  }
})

/**
 * Id-lijsten worden op `SELECTION_MAX` begrensd. Dat is dezelfde bodem onder de
 * blast radius als op het manifest: welke filterfout er ook optreedt, meer dan
 * dit aantal rijen kan één actie niet raken.
 */
const SelectionIdsSchema = z
  .array(z.uuid())
  .min(1, 'Geen transacties geselecteerd')
  .max(SELECTION_MAX, `Een selectie kan hoogstens ${SELECTION_MAX} transacties bevatten`)

export const BulkBudgetSchema = z.object({
  ids: SelectionIdsSchema,
  expectedCount: z.number().int().min(1),
  budgetId: z.uuid().nullable(),
})

export const BulkDeleteSchema = z.object({
  ids: SelectionIdsSchema,
  expectedCount: z.number().int().min(1),
  confirmCount: z.number().int().min(0).optional(),
  includeLinkedCounterparts: z.boolean(),
})

/**
 * Het regelaanbod na hercategoriseren (F20).
 *
 * `matchValue` draagt de ondergrens uit `rule-target.ts` óók op schema-niveau.
 * Dat is bewust dubbel: de helper is de plek waar de norm woont en waar geen
 * schrijfpad omheen kan, dit is de vroege, goedkope weigering — en zonder deze
 * regel accepteerde het schema een zoekterm van één teken, die als
 * `category_corrections`-regel élke volgende import zou sturen.
 */
export const BulkRuleSchema = z.object({
  matchField: z.enum(['counterparty_name', 'description']),
  matchValue: z
    .string()
    .trim()
    .min(MIN_RULE_MATCH_LENGTH, `Een regel moet minstens ${MIN_RULE_MATCH_LENGTH} tekens hebben, anders herkent hij te veel.`)
    .max(200),
  budgetId: z.uuid(),
})
