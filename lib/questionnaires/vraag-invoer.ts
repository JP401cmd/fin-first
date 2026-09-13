import { z } from 'zod'
import { ANDERS_LABEL, OPEN_ANTWOORD_MAX, VRAAG_TYPES, type VraagType } from './antwoord'

/**
 * Vragenlijsten — het invoercontract van BEHEER (POST/PUT /api/admin/questionnaires).
 *
 * Wat hier niet door de keuring komt, kan in de chat niet vastlopen: een
 * verplichte meerkeuzevraag zonder opties, een lege vraagtekst of een schaal
 * met een onmogelijk bereik bestaan voor de gebruiker dan simpelweg niet.
 * De database draagt dezelfde grenzen als CHECK (migratie
 * `questionnaire_vraagtypes`); dit is de vriendelijke, Nederlandse voorkant.
 */

export const OPTIES_MIN = 2
export const OPTIES_MAX_MEERKEUZE = 20
/** Rangschikken in een chatvenster: meer dan tien is op mobiel niet te doen. */
export const OPTIES_MAX_RANGSCHIKKEN = 10
export const VRAGEN_MAX = 30

/** De schaalbereiken die de editor aanbiedt. */
export const SCHAAL_VOORINSTELLINGEN = [
  { min: 1, max: 10, label: '1–10' },
  { min: 0, max: 10, label: '0–10 (NPS)' },
  { min: 1, max: 7, label: '1–7' },
  { min: 1, max: 5, label: '1–5' },
] as const

const optieTekst = z.string().trim().min(1, 'Een optie mag niet leeg zijn').max(200, 'Een optie is te lang')

export const VraagInvoerSchema = z
  .object({
    id: z.uuid().optional(),
    type: z.enum(VRAAG_TYPES as [VraagType, ...VraagType[]]),
    question_text: z.string().trim().min(1, 'Een vraag mag niet leeg zijn').max(OPEN_ANTWOORD_MAX, 'Een vraag is te lang'),
    options: z.array(optieTekst).max(OPTIES_MAX_MEERKEUZE).optional().nullable(),
    scale_min: z.number().int().optional().nullable(),
    scale_max: z.number().int().optional().nullable(),
    scale_min_label: z.string().trim().max(100).optional().nullable(),
    scale_max_label: z.string().trim().max(100).optional().nullable(),
    is_required: z.boolean().optional(),
    is_multi_select: z.boolean().optional(),
    allow_other: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const fout = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] })

    if (v.type === 'multiple_choice' || v.type === 'ranking') {
      const opties = v.options ?? []
      const max = v.type === 'ranking' ? OPTIES_MAX_RANGSCHIKKEN : OPTIES_MAX_MEERKEUZE
      if (opties.length < OPTIES_MIN) fout(`Geef minstens ${OPTIES_MIN} opties`, 'options')
      if (opties.length > max) fout(`Maximaal ${max} opties`, 'options')
      const genormaliseerd = opties.map((o) => o.toLocaleLowerCase('nl-NL'))
      if (new Set(genormaliseerd).size !== genormaliseerd.length) fout('Twee opties zijn gelijk', 'options')
      if (genormaliseerd.includes(ANDERS_LABEL.toLocaleLowerCase('nl-NL'))) {
        fout(`"${ANDERS_LABEL}" is geen gewone optie — zet daarvoor "Anders" aan`, 'options')
      }
    }

    if (v.type === 'scale') {
      const min = v.scale_min ?? 1
      const max = v.scale_max ?? 10
      if (!(min === 0 || min === 1) || max < 2 || max > 10 || min >= max) {
        fout('Kies een geldig schaalbereik', 'scale_min')
      }
    }
  })

export type VraagInvoer = z.infer<typeof VraagInvoerSchema>

export const VragenlijstAanmaakSchema = z.object({
  title: z.string().trim().min(1, 'Geef de vragenlijst een titel').max(200, 'De titel is te lang'),
  description: z.string().trim().max(1000, 'De beschrijving is te lang').optional().nullable(),
  questions: z.array(VraagInvoerSchema).min(1, 'Voeg minstens één vraag toe').max(VRAGEN_MAX, `Maximaal ${VRAGEN_MAX} vragen`),
})

export const VragenlijstWijzigSchema = z.object({
  title: VragenlijstAanmaakSchema.shape.title.optional(),
  description: VragenlijstAanmaakSchema.shape.description,
  is_active: z.boolean().optional(),
  questions: VragenlijstAanmaakSchema.shape.questions.optional(),
})

/**
 * `parseBody` zet het veldpad vóór de melding ("questions.0.options.1: …").
 * Voor de beheerder is "Vraag 1: …" leesbaarder.
 */
export function vertaalVeldpad(melding: string): string {
  return melding.replace(/^questions\.(\d+)(?:\.[\w.]+)?: /, (_, i: string) => `Vraag ${Number(i) + 1}: `)
}

/**
 * Van gekeurde invoer naar de kolommen van `questionnaire_questions`. Velden die
 * niet bij het type horen gaan expliciet op null/default, zodat een vraag die
 * van meerkeuze naar open wisselt geen oude opties blijft meeslepen.
 */
export function vraagNaarRij(v: VraagInvoer, sortOrder: number) {
  const metOpties = v.type === 'multiple_choice' || v.type === 'ranking'
  return {
    sort_order: sortOrder,
    type: v.type,
    question_text: v.question_text,
    options: metOpties ? (v.options ?? []) : null,
    scale_min: v.type === 'scale' ? (v.scale_min ?? 1) : 1,
    scale_max: v.type === 'scale' ? (v.scale_max ?? 10) : 10,
    scale_min_label: v.type === 'scale' ? (v.scale_min_label || null) : null,
    scale_max_label: v.type === 'scale' ? (v.scale_max_label || null) : null,
    is_required: v.is_required ?? true,
    is_multi_select: v.type === 'multiple_choice' ? (v.is_multi_select ?? false) : false,
    allow_other: v.type === 'multiple_choice' ? (v.allow_other ?? false) : false,
  }
}
