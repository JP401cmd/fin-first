/**
 * Schrijfcontract voor de drie beheerde levensstrategieën — AOW, werk en pensioenpotten —
 * gedeeld door `PUT /api/life-events/strategie` en de editor-bodies (TPR-15 stap 3).
 *
 * Eén module voor schema én rijopbouw, zodat de rij die de preview doorrekent dezelfde is
 * als de rij die de route opslaat. De afgeleide velden (maandbedrag, duur, icoon,
 * indexatie) bepaalt de SERVER uit de invoer; de client stuurt alleen wat de gebruiker
 * kiest. Pure module (geen 'use client', geen IO).
 *
 * ## Metadata
 *
 * Bij een bestaande rij blijven sleutels die dit formulier niet beheert staan (bv.
 * `mijnpensioenBron`, waarop de UPO-import een pot herkent). Eén uitzondering:
 * `tot_stopmoment` (ADR 0143) wordt op deze typen altijd verwijderd. De kern leest die
 * sleutel generiek op elke gebeurtenis; op AOW of pensioen zou hij een inkomen dat pas ná
 * het stoppen begint volledig wegstrepen, en de gebeurtenis-editor biedt de keuze op deze
 * typen bewust niet aan (`stopmomentKeuzeTeltMee`).
 */

import { z } from 'zod'
import {
  computeAowMonthly,
  LIFE_EVENT_TOT_STOPMOMENT_KEY,
  type CanonicalPensionType,
  type WerkMetadata,
} from '@/lib/horizon-data'
import { allowedDuur, eventFromPot, type PotDraft } from '@/lib/pension/pot-draft'

export const STRATEGIE_EVENT_TYPES = ['aow', 'werk', 'pension'] as const
export type StrategieEventType = (typeof STRATEGIE_EVENT_TYPES)[number]

/** De typen waarvan een rij via deze route verwijderd mag worden (AOW niet: zonder AOW rekent de kern met €0). */
export const VERWIJDERBARE_STRATEGIE_TYPES = ['werk', 'pension'] as const

const leeftijd = z.number().int().min(0).max(120)
const bedrag = (max: number) => z.number().min(0).max(max)

const AowSchema = z
  .object({
    event_type: z.literal('aow'),
    /** Ruime sanity-grens rond de wettelijke AOW-leeftijd (de tabel loopt tot ~70). */
    target_age: z.number().int().min(60).max(75),
    leefsituatie: z.enum(['alleenstaand', 'samenwonend']),
    jarenBuitenNL: z.number().int().min(0).max(50),
  })
  .strict()

const WerkSchema = z
  .object({
    event_type: z.literal('werk'),
    target_age: leeftijd,
    metadata: z
      .object({
        huidigNettoMaand: bedrag(50_000),
        reeleGroeiPct: z.number().min(0).max(0.15),
        groeiTotLeeftijd: leeftijd.optional(),
        plafondNettoMaand: bedrag(50_000).optional(),
        faseStappen: z
          .array(z.object({ fromAge: leeftijd, pct: z.number().min(0).max(100) }).strict())
          .max(20),
        sprongen: z
          .array(
            z.object({ atAge: leeftijd, deltaNettoMaand: z.number().min(-10_000).max(10_000) }).strict(),
          )
          .max(20),
      })
      .strict(),
  })
  .strict()

const PENSIOEN_TYPES = [
  'bedrijf',
  'lijfrente_levenslang',
  'lijfrente_bancair',
  'tijdelijke_oudedagslijfrente',
] as const satisfies readonly CanonicalPensionType[]

const PotSchema = z
  .object({
    // Ruimer dan het invoerveld (60): de mijnpensioen-import zet langere namen
    // ("… (deels indicatief)"), en die pot moet opnieuw op te slaan zijn.
    name: z.string().trim().min(1, 'Geef de pot een naam.').max(120),
    pensioenType: z.enum(PENSIOEN_TYPES),
    ingangLeeftijd: z.number().int().min(55).max(75),
    invoermodus: z.enum(['maand', 'pot']),
    brutoBedrag: bedrag(20_000),
    inlegBedrag: bedrag(2_000_000),
    uitkeringsduur: z.enum(['levenslang', '20', '10', '5']),
    isGeindexeerd: z.boolean(),
    partnerUitkeringPct: z.number().min(0).max(100),
  })
  .strict()
  .refine((p) => allowedDuur(p.pensioenType).includes(p.uitkeringsduur), {
    message: 'Deze uitkeringsduur past niet bij dit type pensioen',
  })

const PensioenSchema = z
  .object({
    event_type: z.literal('pension'),
    /** Bestaande pot; weglaten = nieuwe pot. */
    id: z.uuid().optional(),
    pot: PotSchema,
  })
  .strict()

export const StrategieBodySchema = z.discriminatedUnion('event_type', [AowSchema, WerkSchema, PensioenSchema])
export type StrategieBody = z.infer<typeof StrategieBodySchema>

/**
 * Waarom de route deze invoer zou weigeren, in een zin voor onder het formulier; `null` = geldig.
 * Dezelfde validatie als de route, zodat "Opslaan" uit blijft tot de route het accepteert.
 */
export function strategieInvoerFout(body: unknown): string | null {
  const res = StrategieBodySchema.safeParse(body)
  if (res.success) return null
  const issue = res.error.issues[0]
  if (!issue) return 'Controleer de ingevulde waarden.'
  if (issue.path.at(-1) === 'name') {
    return issue.code === 'too_big' ? 'De naam van de pot mag hoogstens 120 tekens zijn.' : 'Geef de pot een naam.'
  }
  if (issue.code === 'custom') return `${issue.message}.`
  const eventType = (body as { event_type?: unknown } | null)?.event_type
  const veld = issue.path.find((p): p is string => typeof p === 'string' && p in VELD_LABELS)
  const label = veld === 'target_age' && eventType === 'aow' ? 'AOW-ingangsleeftijd' : veld ? VELD_LABELS[veld] : null
  if (!label) return 'Een van de ingevulde waarden valt buiten wat de app kan opslaan. Controleer de getallen.'
  const bereik = issue as { code: string; minimum?: unknown; maximum?: unknown }
  // De groei staat in het formulier als procent, in het schema als fractie.
  const alsInFormulier = (n: number) => (veld === 'reeleGroeiPct' ? `${Math.round(n * 1000) / 10}%` : String(n))
  if (bereik.code === 'too_small' && typeof bereik.minimum === 'number') {
    return `"${label}" moet minstens ${alsInFormulier(bereik.minimum)} zijn.`
  }
  if (bereik.code === 'too_big' && typeof bereik.maximum === 'number') {
    return `"${label}" mag hoogstens ${alsInFormulier(bereik.maximum)} zijn.`
  }
  return `"${label}" moet een heel getal zijn.`
}

/** Veldnamen zoals de formulieren ze tonen, voor `strategieInvoerFout`. */
const VELD_LABELS: Record<string, string> = {
  target_age: 'Leeftijd',
  jarenBuitenNL: 'Jaren buiten Nederland',
  ingangLeeftijd: 'Gaat in op leeftijd',
  brutoBedrag: 'Bruto per maand',
  inlegBedrag: 'Opgebouwd kapitaal',
  partnerUitkeringPct: 'Partner ontvangt na overlijden',
  huidigNettoMaand: 'Huidig netto maandinkomen',
  reeleGroeiPct: 'Verwachte reële stijging',
  groeiTotLeeftijd: 'Groei stopt op leeftijd',
  plafondNettoMaand: 'Salarisplafond',
  fromAge: 'Vanaf leeftijd',
  atAge: 'Op leeftijd',
  deltaNettoMaand: 'Erbij (netto/mnd)',
}

/** De kolommen die de route schrijft (zonder `user_id`, `id` en `sort_order`). */
export interface StrategieRij {
  name: string
  event_type: StrategieEventType
  target_age: number
  target_date: null
  one_time_cost: 0
  monthly_cost_change: 0
  monthly_income_change: number
  duration_months: number
  icon: string
  is_active: true
  is_indexed: boolean
  metadata: Record<string, unknown>
}

function metMetadata(bestaand: unknown, eigen: Record<string, unknown>): Record<string, unknown> {
  const basis = bestaand && typeof bestaand === 'object' && !Array.isArray(bestaand) ? { ...(bestaand as object) } : {}
  delete (basis as Record<string, unknown>)[LIFE_EVENT_TOT_STOPMOMENT_KEY]
  return { ...basis, ...eigen }
}

/**
 * De rij zoals hij opgeslagen wordt. `bestaandeMetadata` = de metadata van de rij die
 * bijgewerkt wordt (`undefined` bij een nieuwe rij).
 */
export function bouwStrategieRij(body: StrategieBody, bestaandeMetadata?: unknown): StrategieRij {
  switch (body.event_type) {
    case 'aow':
      return {
        name: 'AOW',
        event_type: 'aow',
        target_age: body.target_age,
        target_date: null,
        one_time_cost: 0,
        monthly_cost_change: 0,
        monthly_income_change: computeAowMonthly(body.leefsituatie, body.jarenBuitenNL),
        duration_months: 0,
        icon: 'Landmark',
        is_active: true,
        is_indexed: true,
        metadata: metMetadata(bestaandeMetadata, {
          leefsituatie: body.leefsituatie,
          jarenBuitenNL: body.jarenBuitenNL,
        }),
      }
    case 'werk': {
      const m = body.metadata
      const eigen: WerkMetadata = {
        huidigNettoMaand: m.huidigNettoMaand,
        reeleGroeiPct: m.reeleGroeiPct,
        groeiTotLeeftijd: m.groeiTotLeeftijd,
        plafondNettoMaand: m.plafondNettoMaand != null && m.plafondNettoMaand > 0 ? m.plafondNettoMaand : undefined,
        faseStappen: [...m.faseStappen].sort((a, b) => a.fromAge - b.fromAge),
        sprongen: [...m.sprongen].sort((a, b) => a.atAge - b.atAge),
        source: 'werk-strategy',
        schemaVersie: 1,
      }
      // Een weggehaalde optionele waarde moet ook uit de opgeslagen metadata verdwijnen:
      // zonder die twee sleutels uit de basis bleef een oud plafond na het wissen staan.
      const basis = metMetadata(bestaandeMetadata, {})
      delete basis.groeiTotLeeftijd
      delete basis.plafondNettoMaand
      const gezet = Object.fromEntries(Object.entries(eigen).filter(([, v]) => v !== undefined))
      return {
        name: 'Werk & inkomen',
        event_type: 'werk',
        target_age: body.target_age,
        target_date: null,
        one_time_cost: 0,
        monthly_cost_change: 0,
        monthly_income_change: 0,
        duration_months: 0,
        icon: 'Briefcase',
        is_active: true,
        is_indexed: true,
        metadata: { ...basis, ...gezet },
      }
    }
    case 'pension': {
      const pot: PotDraft = { ...body.pot, id: body.id ?? null, name: body.pot.name.trim() }
      const ev = eventFromPot(pot)
      return {
        name: pot.name,
        event_type: 'pension',
        target_age: pot.ingangLeeftijd,
        target_date: null,
        one_time_cost: 0,
        monthly_cost_change: 0,
        monthly_income_change: ev.monthly_income_change,
        duration_months: ev.duration_months,
        icon: ev.icon,
        is_active: true,
        is_indexed: ev.is_indexed,
        metadata: metMetadata(bestaandeMetadata, ev.metadata ?? {}),
      }
    }
  }
}
