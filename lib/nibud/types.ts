export type NibudHouseholdType = 'alleenstaand' | 'paar' | 'gezin_jong' | 'gezin_tiener'

export type NibudReference = {
  nibud_category_key: string
  nibud_category_name: string
  basis_amount: number
  voorbeeld_amount: number | null
  mapped_budget_slug: string | null
}

export type NibudBenchmark = NibudReference & {
  user_spending: number
  delta: number // positief = boven NIBUD
  freedom_days_potential: number
  mapped_budget_id: string | null
}
