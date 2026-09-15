import { z } from 'zod'
import {
  evalueerRegels,
  RegelSchema,
  REGELS_MAX,
  type GebruikerContext,
  type Regel,
} from '@/lib/questionnaires/verspreiding'

/**
 * Gebruikersgroepen — herbruikbare doelgroepen voor vragenlijsten (ADR 0147,
 * fase 3).
 *
 * Twee soorten, zoals de gangbare onderzoekstools ze kennen:
 *  - **statisch**: een door beheer samengestelde ledenlijst (interviewwerving,
 *    een beta-cohort). Leden staan in `user_group_members`.
 *  - **dynamisch**: een regelset (AND), telkens opnieuw geëvalueerd bij het
 *    lezen — geen ledenlijst, dus nooit verouderd.
 *
 * COMPUTE-ON-READ, OOK VOOR STATISCH. Een vragenlijst op "groepen" matcht in
 * GET /api/questionnaires als de gebruiker lid is van een van de statische
 * groepen (eigen-rij lezen van `user_group_members`) OF voldoet aan de regels
 * van een van de dynamische groepen. Er worden bij het opslaan geen
 * uitnodigingen gematerialiseerd: een lid toevoegen aan een groep werkt meteen
 * door in elke lijst die die groep gebruikt, en verwijderen ook.
 *
 * PRIVACY. Een gebruiker kan zijn eigen lidmaatschap-rijen lezen (dat is zijn
 * persoonsgegeven) en van dynamische groepen alleen `id`, `soort` en `regels`
 * (kolomrecht) — nooit de naam of omschrijving die beheer eraan gaf.
 */

export const GROEP_SOORTEN = ['statisch', 'dynamisch'] as const
export type GroepSoort = (typeof GROEP_SOORTEN)[number]

export const GROEP_NAAM_MAX = 100
export const GROEP_OMSCHRIJVING_MAX = 500
export const GROEP_LEDEN_MAX = 2000

const uuid = z.uuid('Ongeldige verwijzing')

/** Body van POST /api/admin/user-groups en PUT /api/admin/user-groups/[id]. */
export const GroepInvoerSchema = z
  .object({
    naam: z.string().trim().min(1, 'Geef de groep een naam').max(GROEP_NAAM_MAX),
    omschrijving: z.string().trim().max(GROEP_OMSCHRIJVING_MAX).nullable().default(null),
    soort: z.enum(GROEP_SOORTEN),
    regels: z.array(RegelSchema).max(REGELS_MAX).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.soort === 'dynamisch' && v.regels.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['regels'], message: 'Een dynamische groep heeft minstens één regel' })
    }
    if (v.soort === 'statisch' && v.regels.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['regels'], message: 'Een statische groep heeft geen regels, maar leden' })
    }
  })
export type GroepInvoer = z.infer<typeof GroepInvoerSchema>

/** Body van PUT /api/admin/user-groups/[id]/leden — de volledige ledenlijst. */
export const GroepLedenSchema = z.object({
  user_ids: z.array(uuid).max(GROEP_LEDEN_MAX),
})
export type GroepLeden = z.infer<typeof GroepLedenSchema>

/** Wat de gebruikersroute van een dynamische groep mag en hoeft te lezen. */
export interface DynamischeGroep {
  id: string
  regels: Regel[]
}

/** Null-veilige lezer van `user_groups.regels`; ongeldig → geen regels (matcht nooit). */
export function parseGroepRegels(raw: unknown): Regel[] {
  const parsed = z.array(RegelSchema).max(REGELS_MAX).safeParse(raw)
  return parsed.success ? parsed.data : []
}

export interface GroepMatch {
  match: boolean
  /** De groepen (uit `groepIds`) waar de gebruiker in valt — voor de bevroren naslag. */
  groepIds: string[]
}

/**
 * Valt de gebruiker in minstens één van `groepIds`? OR over groepen; binnen een
 * dynamische groep AND over de regels. Een groep die niet (meer) bestaat, of een
 * dynamische groep zonder geldige regels, matcht nooit.
 */
export function groepMatch(
  groepIds: readonly string[],
  eigenStatischeGroepen: ReadonlySet<string>,
  dynamischeGroepen: readonly DynamischeGroep[],
  ctx: GebruikerContext,
): GroepMatch {
  const dynamischPerId = new Map(dynamischeGroepen.map((g) => [g.id, g]))
  const gematcht: string[] = []
  for (const id of groepIds) {
    if (eigenStatischeGroepen.has(id)) {
      gematcht.push(id)
      continue
    }
    const dyn = dynamischPerId.get(id)
    if (dyn && evalueerRegels(dyn.regels, ctx).match) gematcht.push(id)
  }
  return { match: gematcht.length > 0, groepIds: gematcht }
}

/** Heeft een regelset een regel die de dominante waardestroom nodig heeft? */
export function vraagtStromen(regels: readonly Regel[]): boolean {
  return regels.some((r) => r.soort === 'dominante_stroom')
}
