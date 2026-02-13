import type { NibudHouseholdType } from './types'

/**
 * NIBUD betaalde API client (Uitgaven API v6).
 *
 * Maps a user profile to the NIBUD API request format and returns
 * category-level reference amounts. Falls back to static data on error.
 *
 * Requires NIBUD_API_KEY environment variable.
 */

type NibudApiInput = {
  Hoofdpersonen: number
  Kinderen: { Leeftijd: number }[]
  Woning: 'HuurSociaal' | 'HuurVrij' | 'Koop'
  NettoBesteedbaarInkomenPerMaand: number
}

type NibudApiCategory = {
  Naam: string
  BedragPerMaand: number
  Code: string
}

type NibudApiResponse = {
  Categorien: NibudApiCategory[]
}

function mapHousingType(housing_type: string | null): NibudApiInput['Woning'] {
  switch (housing_type) {
    case 'huur_sociaal': return 'HuurSociaal'
    case 'huur_vrij': return 'HuurVrij'
    case 'koop': return 'Koop'
    default: return 'Koop'
  }
}

export function buildNibudApiInput(profile: {
  household_type?: string | null
  number_of_children?: number | null
  children_ages?: number[] | null
  housing_type?: string | null
  net_monthly_income?: number | null
}): NibudApiInput | null {
  const income = Number(profile.net_monthly_income)
  if (!income || income <= 0) return null

  const hoofdpersonen = profile.household_type === 'solo' ? 1 : 2
  const ages = profile.children_ages ?? []
  const kinderen = ages.map(a => ({ Leeftijd: a }))

  return {
    Hoofdpersonen: hoofdpersonen,
    Kinderen: kinderen,
    Woning: mapHousingType(profile.housing_type ?? null),
    NettoBesteedbaarInkomenPerMaand: income,
  }
}

// Simple mapping from NIBUD API category codes to our budget slugs
const NIBUD_API_CODE_TO_SLUG: Record<string, string> = {
  voeding: 'boodschappen',
  energie: 'gas-water-licht',
  water: 'gas-water-licht',
  huur: 'huur-hypotheek',
  hypotheek: 'huur-hypotheek',
  zorgverzekering: 'verzekeringen-wonen',
  verzekeringen: 'verzekeringen-wonen',
  gemeentelijke_belastingen: 'gemeentelijke-lasten',
  kleding: 'kleding-overige',
  vervoer: 'brandstof-ov',
  telecom: 'vrije-tijd-sport',
  recreatie: 'leuke-dingen',
  inventaris: 'huishouden-verzorging',
  kinderen: 'kinderen-school',
}

/**
 * Call the NIBUD Uitgaven API. Returns null if no API key or on error.
 */
export async function fetchNibudApi(
  profile: {
    household_type?: string | null
    number_of_children?: number | null
    children_ages?: number[] | null
    housing_type?: string | null
    net_monthly_income?: number | null
  },
  _householdType: NibudHouseholdType,
): Promise<{ slug: string; name: string; amount: number }[] | null> {
  const apiKey = process.env.NIBUD_API_KEY
  if (!apiKey) return null

  const input = buildNibudApiInput(profile)
  if (!input) return null

  try {
    const res = await fetch('https://api.nibud.nl/v6/uitgaven', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(input),
      // 24h cache via Next.js fetch cache
      next: { revalidate: 86400 },
    })

    if (!res.ok) return null

    const data = (await res.json()) as NibudApiResponse
    if (!data.Categorien) return null

    return data.Categorien.map(cat => ({
      slug: NIBUD_API_CODE_TO_SLUG[cat.Code.toLowerCase()] ?? cat.Code.toLowerCase(),
      name: cat.Naam,
      amount: cat.BedragPerMaand,
    }))
  } catch {
    // Silently fall back to static data
    return null
  }
}
