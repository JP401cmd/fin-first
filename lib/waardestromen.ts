import { z } from 'zod'
import { ACTIVITY_MODULES, type ActivityModule } from '@/lib/activity/modules'

/**
 * Waardestromen — de gebruikstypen waarop beheer vragenlijsten kan richten
 * (ADR 0147, fase 2).
 *
 * Een waardestroom is een door beheer benoemde bundel app-delen ("Vermogen" =
 * overzicht + bezittingen + schulden + belasting + rapportages). De dominante
 * stroom van een gebruiker is de stroom waarin hij de afgelopen 30 dagen op de
 * meeste DAGEN actief was. Alleen dagen tellen — geen kliks, geen tijd.
 *
 * OPSLAG: één globale `app_settings`-rij (`waardestromen`, zonder uuid in de
 * sleutel). Die is leesbaar voor elke ingelogde gebruiker (tak 2 van de
 * app_settings-policy) — nodig, want de dominante stroom wordt per gebruiker in
 * GET /api/questionnaires berekend met diens eigen sessie. De config bevat
 * alleen namen en modulesleutels, geen persoonsgegevens.
 *
 * STROOM-ID IS STABIEL. Een verspreidingsregel verwijst naar `id`, niet naar de
 * naam: hernoemen breekt geen regels. Een verwijderde stroom laat een regel
 * achter die nooit meer matcht (fail-closed), niet een die op iedereen matcht.
 */

export const WAARDESTROMEN_SLEUTEL = 'waardestromen'
export const WAARDESTROMEN_MIN = 1
export const WAARDESTROMEN_MAX = 6

/** Minimaal zoveel actieve dagen in een stroom om er "dominant" in te zijn. */
export const DOMINANT_MIN_DAGEN = 3

export const WaardestroomSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Alleen kleine letters, cijfers en streepjes'),
  naam: z.string().trim().min(1, 'Geef de stroom een naam').max(40),
  modules: z.array(z.enum(ACTIVITY_MODULES)).min(1, 'Kies minstens één app-deel').max(ACTIVITY_MODULES.length),
})
export type Waardestroom = z.infer<typeof WaardestroomSchema>

export const WaardestromenSchema = z
  .object({
    stromen: z.array(WaardestroomSchema).min(WAARDESTROMEN_MIN).max(WAARDESTROMEN_MAX),
  })
  .superRefine((v, ctx) => {
    const gezien = new Set<string>()
    v.stromen.forEach((s, i) => {
      if (gezien.has(s.id)) {
        ctx.addIssue({ code: 'custom', path: ['stromen', i, 'id'], message: 'Deze stroom-id bestaat al' })
      }
      gezien.add(s.id)
    })
  })
export type Waardestromen = z.infer<typeof WaardestromenSchema>

/** De standaardindeling (eigenaarsbesluit 15 sep 2026). */
export const STANDAARD_WAARDESTROMEN: Waardestromen = {
  stromen: [
    { id: 'vermogen', naam: 'Vermogen', modules: ['overzicht', 'bezittingen', 'schulden', 'belasting', 'rapportages'] },
    { id: 'budget', naam: 'Budget', modules: ['budget'] },
    { id: 'toekomst', naam: 'Toekomst', modules: ['toekomst'] },
    { id: 'fin', naam: 'Fin', modules: ['fin', 'berichten', 'nieuws'] },
  ],
}

/**
 * Lees de config uit `app_settings.value` (een JSON-string) of een al geparst
 * object. Ontbrekend of ongeldig → de standaardindeling, nooit een throw.
 */
export function parseWaardestromen(raw: unknown): Waardestromen {
  let waarde: unknown = raw
  if (typeof raw === 'string') {
    try {
      waarde = JSON.parse(raw)
    } catch {
      return structuredClone(STANDAARD_WAARDESTROMEN)
    }
  }
  if (waarde == null) return structuredClone(STANDAARD_WAARDESTROMEN)
  const parsed = WaardestromenSchema.safeParse(waarde)
  return parsed.success ? parsed.data : structuredClone(STANDAARD_WAARDESTROMEN)
}

/** Maak een stabiele id van een naam ("Budget & sparen" → "budget-sparen"). */
export function stroomIdVanNaam(naam: string, bestaand: readonly string[] = []): string {
  const basis =
    naam
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 34) || 'stroom'
  if (!bestaand.includes(basis)) return basis
  for (let n = 2; n < 1000; n++) {
    const kandidaat = `${basis}-${n}`
    if (!bestaand.includes(kandidaat)) return kandidaat
  }
  return `${basis}-${Date.now().toString(36)}`.slice(0, 40)
}

export interface ModuleDag {
  day: string
  module: string
}

export interface DominanteStroomUitkomst {
  /** De winnende stroom-id, of null (te weinig activiteit of gelijkspel). */
  stroom: string | null
  /** Aantal verschillende actieve dagen per stroom-id. */
  dagenPerStroom: Record<string, number>
}

/**
 * De dominante waardestroom uit eigen module-dagen.
 *
 * Per stroom: het aantal VERSCHILLENDE dagen waarop minstens één van zijn
 * modules gebruikt werd. Winnaar = het hoogste aantal, mits ≥ `minDagen`.
 * Gelijkspel om de eerste plaats → geen winnaar: een regel "dominante stroom is
 * Toekomst" hoort niet te matchen op iemand die net zo vaak in Budget zit.
 */
export function dominanteStroom(
  rijen: readonly ModuleDag[],
  config: Waardestromen,
  minDagen: number = DOMINANT_MIN_DAGEN,
): DominanteStroomUitkomst {
  const dagenPerModule = new Map<string, Set<string>>()
  for (const r of rijen) {
    if (!r?.day || !r?.module) continue
    const set = dagenPerModule.get(r.module) ?? new Set<string>()
    set.add(r.day)
    dagenPerModule.set(r.module, set)
  }

  const dagenPerStroom: Record<string, number> = {}
  for (const stroom of config.stromen) {
    const dagen = new Set<string>()
    for (const m of stroom.modules as readonly ActivityModule[]) {
      for (const d of dagenPerModule.get(m) ?? []) dagen.add(d)
    }
    dagenPerStroom[stroom.id] = dagen.size
  }

  const gesorteerd = Object.entries(dagenPerStroom).sort((a, b) => b[1] - a[1])
  const [eerste, tweede] = gesorteerd
  if (!eerste || eerste[1] < minDagen) return { stroom: null, dagenPerStroom }
  if (tweede && tweede[1] === eerste[1]) return { stroom: null, dagenPerStroom }
  return { stroom: eerste[0], dagenPerStroom }
}
