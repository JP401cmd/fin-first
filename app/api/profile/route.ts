import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { VALID_HOUSEHOLD_TYPES, type HouseholdType } from '@/lib/household-type'

/**
 * PUT /api/profile — de persoonlijke gegevens en het huishoudprofiel van
 * /mijn/profiel (TPR-14, 13 sep 2026).
 *
 * Waarom een route en geen client-upsert meer: `date_of_birth` bepaalt de
 * startleeftijd én de AOW-leeftijd waarmee de horizon-kernel rekent, en
 * `household_type` bepaalt via `hasPartner` o.a. de Box 3-vrijstelling. Dat zijn
 * geen smaakvoorkeuren (de client-direct-uitzondering van ADR 0058) maar
 * rekenmotor-invoer — die hoort achter validatie (zod, ADR 0044) in plaats van
 * dat de browser elke waarde ongetoetst in de rij zet.
 *
 * Eigen rij only: de sessie-client (anon key + cookies, RLS op `profiles` =
 * `auth.uid()`) schrijft; nooit service-role. De `id` komt uit de geverifieerde
 * sessie (`getUser()`, zoals voorgeschreven voor schrijvende routes), nooit uit de
 * body. Het schema is een allowlist: onbekende sleutels (bv. `role`) worden door
 * zod gestript en bereiken de upsert niet.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Oudste geboortejaar dat we als plausibel accepteren. */
const MIN_BIRTH_YEAR = 1900

const INVALID_DATE_OF_BIRTH = 'Vul een geldige geboortedatum in.'

/**
 * Een echte kalenderdatum (geen 2026-02-31), niet in de toekomst en niet vóór
 * `MIN_BIRTH_YEAR`. De string-vergelijking op ISO-datums is lexicografisch gelijk
 * aan de chronologische, dus "niet in de toekomst" is `<= vandaag`.
 */
function isPlausibleDateOfBirth(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  const date = new Date(Date.UTC(year, month - 1, day))
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  if (!roundTrips || year < MIN_BIRTH_YEAR) return false
  const today = new Date().toISOString().slice(0, 10)
  return value <= today
}

/** Lege string → null, zodat een leeggehaald veld de kolom leegt i.p.v. '' schrijft. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .transform((v) => (v ? v : null))

const HOUSING_TYPES = ['huur_sociaal', 'huur_vrij', 'koop'] as const

const ProfileSchema = z.object({
  full_name: optionalText(200, 'Je naam mag maximaal 200 tekens zijn.'),
  marketplace_display_name: optionalText(40, 'Je bibliotheeknaam mag maximaal 40 tekens zijn.'),
  date_of_birth: z
    .string()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isPlausibleDateOfBirth(v), INVALID_DATE_OF_BIRTH),
  country: z
    .string()
    .trim()
    .max(100, 'Land mag maximaal 100 tekens zijn.')
    .nullable()
    .transform((v) => (v ? v : 'NL')),
  household_type: z.enum(VALID_HOUSEHOLD_TYPES as readonly [HouseholdType, ...HouseholdType[]], {
    message: 'Kies solo, samen of gezin.',
  }),
  number_of_children: z
    .number()
    .int('Aantal kinderen moet een heel getal zijn.')
    .min(0, 'Aantal kinderen kan niet negatief zijn.')
    .max(20, 'Aantal kinderen mag maximaal 20 zijn.'),
  children_ages: z
    .array(
      z
        .number()
        .int('Een leeftijd moet een heel getal zijn.')
        .min(0, 'Een leeftijd kan niet negatief zijn.')
        .max(30, 'Een leeftijd mag maximaal 30 zijn.'),
    )
    .max(20, 'Maximaal 20 leeftijden.'),
  housing_type: z.enum(HOUSING_TYPES, { message: 'Kies een geldig woningtype.' }).nullable(),
  net_monthly_income: z
    .number()
    .min(0, 'Netto maandinkomen kan niet negatief zijn.')
    .max(10_000_000, 'Netto maandinkomen is onrealistisch hoog.')
    .nullable(),
})

export async function PUT(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(ProfileSchema, request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    full_name: body.full_name,
    date_of_birth: body.date_of_birth,
    country: body.country,
    household_type: body.household_type,
    marketplace_display_name: body.marketplace_display_name,
    number_of_children: body.number_of_children,
    children_ages: body.children_ages,
    housing_type: body.housing_type,
    net_monthly_income: body.net_monthly_income,
    // De BRON hoort bij het bedrag (ADR 0103/0131). Zonder deze regel bleef een
    // `income_source = 'estimate'` uit de onboarding-knop "Schat het voor me"
    // staan nadat de gebruiker hier zijn eigen bedrag invulde — en dan blijft het
    // voorbehoud "geschat op je leeftijd" app-breed hangen op een getal dat hij
    // zélf koos. Een bedrag hier is per definitie eigen invoer; leeggehaald laten
    // we de bron met rust (dan bepaalt de resolver 'unknown' op het lege bedrag).
    ...(body.net_monthly_income !== null ? { income_source: 'manual' } : {}),
    updated_at: new Date().toISOString(),
  })
  if (error) return serverError(error, 'profile:PUT')

  // Feature #830: is het inkomen nu ingevuld, dan vervalt 'income' uit de
  // uitgestelde onboarding-velden (feature_preferences.deferred_onboarding_fields)
  // en verdwijnt de coach-suggestie. Best effort: het profiel is al opgeslagen,
  // dus een fout hier mag die opslag niet als mislukt melden.
  if (body.net_monthly_income !== null && body.net_monthly_income > 0) {
    await clearDeferredIncomeField(supabase, user.id)
  }

  return NextResponse.json({ success: true })
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

async function clearDeferredIncomeField(supabase: ServerSupabase, userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('feature_preferences')
      .eq('id', userId)
      .single()
    if (error) return
    const prefs = (data?.feature_preferences as Record<string, unknown> | null) ?? {}
    const deferred = Array.isArray(prefs.deferred_onboarding_fields)
      ? (prefs.deferred_onboarding_fields as unknown[])
      : []
    if (!deferred.includes('income')) return
    // Read-modify-write op de eigen rij: alleen de ene sub-sleutel verandert,
    // de rest van feature_preferences blijft staan.
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        feature_preferences: {
          ...prefs,
          deferred_onboarding_fields: deferred.filter((f) => f !== 'income'),
        },
      })
      .eq('id', userId)
    if (updateError) console.warn('[profile:PUT] deferred-velden niet bijgewerkt', updateError.message)
  } catch (err) {
    console.warn('[profile:PUT] deferred-velden niet bijgewerkt', err)
  }
}
