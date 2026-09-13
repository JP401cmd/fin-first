import { z } from 'zod'

/**
 * Vragenlijsten in de chat bij Fin — het antwoordcontract.
 *
 * Eén plek die bepaalt wat een geldig antwoord is per vraagtype, zodat de route
 * (die opslaat) en de weergave (die invoer toestaat) nooit uit elkaar lopen.
 * De route vertrouwt de client niet: type, opties, bereik en vraagtekst komen
 * uit de database, de client levert alleen de ruwe invoer.
 *
 * Opslagvorm per type (tabel `questionnaire_responses`):
 *   open            → answer_text
 *   scale           → answer_scale (binnen scale_min..scale_max van de vraag)
 *   yes_no          → answer_choice 'Ja' | 'Nee'
 *   multiple_choice → answer_choice (één: de optie; meer: JSON-array);
 *                     bij "Anders, namelijk" staat die optie in de keuze en de
 *                     eigen tekst in answer_text
 *   ranking         → answer_choice als JSON-array van álle opties, in volgorde
 */

export type VraagType = 'open' | 'scale' | 'multiple_choice' | 'yes_no' | 'ranking'

export const VRAAG_TYPES: readonly VraagType[] = ['open', 'scale', 'multiple_choice', 'yes_no', 'ranking']

/** De velden van een vraag die nodig zijn om een antwoord te toetsen en te tonen. */
export interface VraagDefinitie {
  id: string
  type: VraagType
  question_text: string
  options: string[] | null
  scale_min_label: string | null
  scale_max_label: string | null
  /** Ontbreekt bij rijen van vóór migratie `questionnaire_vraagtypes` → 1. */
  scale_min?: number | null
  /** Ontbreekt bij rijen van vóór migratie `questionnaire_vraagtypes` → 10. */
  scale_max?: number | null
  allow_other?: boolean | null
  is_required: boolean
  is_multi_select: boolean
}

/** Het opgeslagen antwoord zoals de tabel `questionnaire_responses` het draagt. */
export interface OpgeslagenAntwoord {
  answer_text: string | null
  answer_scale: number | null
  answer_choice: string | null
}

export const OPEN_ANTWOORD_MAX = 2000
export const JA = 'Ja'
export const NEE = 'Nee'
/** De extra optie bij meerkeuze met `allow_other`. Mag geen gewone optie zijn. */
export const ANDERS_LABEL = 'Anders, namelijk'

/** Het bereik van een schaalvraag, met de oude vaste 1–10 als terugval. */
export function schaalBereik(vraag: Pick<VraagDefinitie, 'scale_min' | 'scale_max'>): { min: number; max: number } {
  return { min: vraag.scale_min ?? 1, max: vraag.scale_max ?? 10 }
}

/** De opties van een vraag, defensief gelezen: `options` is JSONB. */
export function optiesVan(vraag: Pick<VraagDefinitie, 'options'>): string[] {
  return Array.isArray(vraag.options) ? vraag.options.filter((o): o is string => typeof o === 'string') : []
}

const uuid = z.uuid('Ongeldige verwijzing')

/** Body van POST /api/questionnaires/[id]/respond. */
export const AntwoordBodySchema = z.object({
  session_id: uuid,
  question_id: uuid,
  answer_text: z.string().max(OPEN_ANTWOORD_MAX, 'Je antwoord is te lang').optional(),
  answer_scale: z.number().int().min(0).max(10).optional(),
  answer_choices: z.array(z.string().max(500)).max(50).optional(),
  /** De eigen tekst bij "Anders, namelijk". */
  answer_other: z.string().max(OPEN_ANTWOORD_MAX, 'Je antwoord is te lang').optional(),
})
export type AntwoordBody = z.infer<typeof AntwoordBodySchema>
export type AntwoordInvoer = Omit<AntwoordBody, 'session_id' | 'question_id'>

/**
 * Het `[id]`-routesegment. Een niet-uuid laat Postgres een 22P02 gooien; die
 * hoort als "bestaat niet" (404) terug te komen, niet als 500.
 */
export function isGeldigVragenlijstId(id: string): boolean {
  return uuid.safeParse(id).success
}

/** Body van PATCH /api/questionnaires/[id]/respond (afronden). */
export const AfrondBodySchema = z.object({ session_id: uuid })

export type AntwoordToets =
  | { ok: true; antwoord: OpgeslagenAntwoord }
  | { ok: false; fout: string }

/** Toetst de ruwe invoer aan de vraag en zet 'm om naar de opslagvorm. */
export function toetsAntwoord(vraag: VraagDefinitie, invoer: AntwoordInvoer): AntwoordToets {
  const leeg: OpgeslagenAntwoord = { answer_text: null, answer_scale: null, answer_choice: null }
  const gekozen = [...new Set(invoer.answer_choices ?? [])]

  switch (vraag.type) {
    case 'open': {
      const tekst = invoer.answer_text?.trim() ?? ''
      if (!tekst) return { ok: false, fout: 'Vul een antwoord in' }
      return { ok: true, antwoord: { ...leeg, answer_text: tekst } }
    }

    case 'scale': {
      const { min, max } = schaalBereik(vraag)
      const cijfer = invoer.answer_scale
      if (cijfer === undefined || cijfer < min || cijfer > max) {
        return { ok: false, fout: `Kies een cijfer van ${min} tot ${max}` }
      }
      return { ok: true, antwoord: { ...leeg, answer_scale: cijfer } }
    }

    case 'yes_no': {
      if (gekozen.length !== 1 || (gekozen[0] !== JA && gekozen[0] !== NEE)) {
        return { ok: false, fout: 'Kies ja of nee' }
      }
      return { ok: true, antwoord: { ...leeg, answer_choice: gekozen[0] } }
    }

    case 'ranking': {
      const opties = optiesVan(vraag)
      const volgorde = invoer.answer_choices ?? []
      const isPermutatie =
        volgorde.length === opties.length &&
        new Set(volgorde).size === volgorde.length &&
        volgorde.every((c) => opties.includes(c))
      if (!isPermutatie) return { ok: false, fout: 'Zet alle opties in een volgorde' }
      return { ok: true, antwoord: { ...leeg, answer_choice: JSON.stringify(volgorde) } }
    }

    case 'multiple_choice': {
      const opties = optiesVan(vraag)
      const toegestaan = vraag.allow_other ? [...opties, ANDERS_LABEL] : opties
      if (gekozen.length === 0) return { ok: false, fout: 'Kies een antwoord' }
      if (gekozen.some((c) => !toegestaan.includes(c))) return { ok: false, fout: 'Dat antwoord hoort niet bij deze vraag' }
      if (!vraag.is_multi_select && gekozen.length > 1) return { ok: false, fout: 'Kies één antwoord' }

      let anders: string | null = null
      if (gekozen.includes(ANDERS_LABEL)) {
        anders = invoer.answer_other?.trim() ?? ''
        if (!anders) return { ok: false, fout: 'Vul in wat je bij "Anders" bedoelt' }
      }

      // Volgorde van de opties aanhouden, niet die van de klikken; "Anders" achteraan.
      const geordend = toegestaan.filter((o) => gekozen.includes(o))
      return {
        ok: true,
        antwoord: {
          ...leeg,
          answer_text: anders,
          answer_choice: vraag.is_multi_select ? JSON.stringify(geordend) : geordend[0],
        },
      }
    }
  }
}

/** Omgekeerde richting: een opgeslagen keuze terug naar de lijst van opties. */
export function keuzesUitOpslag(answerChoice: string | null): string[] {
  if (!answerChoice) return []
  try {
    const parsed: unknown = JSON.parse(answerChoice)
    if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === 'string')
  } catch {
    /* gewone string */
  }
  return [answerChoice]
}

/**
 * Leesbare weergave van een opgeslagen antwoord — zoals Fin het terugspiegelt
 * en zoals de resultaten het per deelnemer tonen. Zonder vraag (bv. een
 * antwoord op een inmiddels verwijderde vraag) vallen we terug op de opslag.
 */
export function antwoordAlsTekst(
  antwoord: OpgeslagenAntwoord,
  vraag?: Pick<VraagDefinitie, 'type' | 'scale_min' | 'scale_max'>,
): string {
  if (antwoord.answer_scale != null) {
    const max = vraag ? schaalBereik(vraag).max : 10
    return `${antwoord.answer_scale} van ${max}`
  }
  const keuzes = keuzesUitOpslag(antwoord.answer_choice)
  if (keuzes.length > 0) {
    if (vraag?.type === 'ranking') return keuzes.map((k, i) => `${i + 1}. ${k}`).join(' · ')
    return keuzes
      .map((k) => (k === ANDERS_LABEL && antwoord.answer_text ? `Anders: ${antwoord.answer_text}` : k))
      .join(', ')
  }
  return antwoord.answer_text ?? ''
}

/** Welke verplichte vragen hebben nog geen antwoord? */
export function openVerplichteVragen(vragen: Pick<VraagDefinitie, 'id' | 'is_required'>[], beantwoord: Set<string>): string[] {
  return vragen.filter((v) => v.is_required && !beantwoord.has(v.id)).map((v) => v.id)
}
