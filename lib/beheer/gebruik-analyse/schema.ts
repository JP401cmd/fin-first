import { z } from 'zod'
import { ACTIVITY_MODULES } from '@/lib/activity/modules'

/**
 * De vorm die `admin_gebruik_analyse(p_dagen, p_intern, p_config)` teruggeeft
 * (migratie 20260917121000, ADR 0153). Elke `n` is een telling van
 * verschillende gebruikers die de database al k-onderdrukt heeft: `null` =
 * 1 t/m k-1, nooit een verstopte 0.
 *
 * Het schema is bewust STRIKT op de sleutels waar een gebruikers-id of datum
 * zou kunnen binnensluipen: weken zijn een ISO-weeklabel, maanden `YYYY-MM`,
 * vrije strings zijn begrensd. Een afwijkende vorm is een fout, geen stille
 * weergave.
 */

const n = z.number().int().nonnegative().nullable()
const week = z.string().regex(/^\d{4}-W\d{2}$/)
const maand = z.string().regex(/^\d{4}-\d{2}$/)
const stroomId = z.string().regex(/^[a-z0-9-]{1,40}$/)
const moduleSleutel = z.enum(ACTIVITY_MODULES)

/** De band van de periodefilter (disjunct, eigenaarsbesluit 17-09-2026). */
export const BandSchema = z
  .object({
    van_dagen_geleden: z.union([z.literal(0), z.literal(30), z.literal(90)]),
    tot_dagen_geleden: z.union([z.literal(29), z.literal(89), z.literal(364)]),
  })
  .strict()

export const LAATST_ACTIEF = ['vandaag', '1_6', '7_29', '30_89', '90_plus', 'nooit'] as const

export const GebruikAnalyseRuwSchema = z
  .object({
    k: z.number().int().positive(),
    venster_dagen: z.union([z.literal(30), z.literal(90), z.literal(365)]),
    band: BandSchema,
    intern: z.boolean(),
    gemeten_sinds_week: week.nullable(),
    modules_gemeten_sinds_week: week.nullable(),
    kerncijfers: z
      .object({
        segment_totaal: n,
        // Band-onafhankelijk: partitie van het segment op de láátste actieve dag.
        // Vervangt de geneste "actief vandaag / 7 / 30 dagen" (verschil-aanval).
        laatst_actief: z
          .array(z.object({ wanneer: z.enum(LAATST_ACTIEF), gebruikers: n }).strict())
          .length(LAATST_ACTIEF.length),
        actief_venster: n,
        nieuw_venster: n,
      })
      .strict(),
    weektrend: z.array(z.object({ week, actief: n, nieuw: n }).strict()),
    stromen: z.array(
      z
        .object({
          id: stroomId,
          gebruikers: n,
          weken: z.array(z.object({ week, actief: n }).strict()),
        })
        .strict(),
    ),
    dominant: z
      .object({
        totaal: n,
        verdeling: z.array(z.object({ stroom: stroomId.nullable(), gebruikers: n }).strict()),
      })
      .strict(),
    overlap: z
      .object({
        totaal: n,
        verdeling: z.array(z.object({ aantal_stromen: z.number().int().min(0).max(6), gebruikers: n }).strict()),
      })
      .strict(),
    ritme: z.array(
      z
        .object({
          id: stroomId,
          ritme_dagen: z.number().int().positive().nullable(),
          geschikt: n,
          terug: n,
          niet_terug: n,
          mediaan_dagen: z.number().nonnegative().nullable(),
          gaten_gebruikers: n,
        })
        .strict(),
    ),
    samen: z
      .object({
        modules: z.array(z.object({ module: moduleSleutel, gebruikers: n }).strict()),
        paren: z.array(z.object({ a: moduleSleutel, b: moduleSleutel, gebruikers: n }).strict()),
      })
      .strict(),
    cohorten: z.array(
      z
        .object({
          maand: maand.nullable(),
          aangemeld: n,
          onboarding_afgerond: n,
          dekking: z.enum(['geen', 'deels', 'volledig']),
          gemeten: n,
          eerste_dag: n,
          tweede_dag: n,
          week2_5_noemer: n,
          week2_5: n,
          maand2_noemer: n,
          maand2: n,
        })
        .strict(),
    ),
    eerste_ervaring: z
      .object({
        totaal: n,
        onboarding_afgerond: n,
        rondleiding: z.array(
          z
            .object({
              uitkomst: z.enum(['voltooid', 'overgeslagen', 'onderbroken', 'tegoed', 'geen']),
              gebruikers: n,
            })
            .strict(),
        ),
        gids: z.array(
          z
            .object({
              stand: z.enum(['niet_gestart', 'afgesloten', '0_stappen', '1_3_stappen', '4_plus_stappen']),
              gebruikers: n,
            })
            .strict(),
        ),
        // Gesloten lijst: DeferredField (lib/coach-suggestions.ts).
        uitgesteld: z.array(z.object({ veld: z.enum(['income', 'assets', 'spaardoel']), gebruikers: n }).strict()),
        briefing_mail_aan: n,
        checkin_minstens_een: n,
        // Beide kolommen hebben een CHECK in de database.
        home_screen: z.array(z.object({ waarde: z.enum(['overzicht', 'budget']), gebruikers: n }).strict()),
        display_mode: z.array(z.object({ waarde: z.enum(['simple', 'full']), gebruikers: n }).strict()),
      })
      .strict(),
  })
  .strict()

export type GebruikAnalyseRuw = z.infer<typeof GebruikAnalyseRuwSchema>
