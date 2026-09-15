import type { GroepSoort } from '@/lib/gebruikersgroepen'
import type { Regel } from '@/lib/questionnaires/verspreiding'

/** Eén rij uit `GET /api/admin/user-groups` (ADR 0147 fase 3). */
export interface GroepSamenvatting {
  id: string
  naam: string
  omschrijving: string | null
  soort: GroepSoort
  regels: Regel[] | null
  leden: number
  created_at: string
  updated_at: string
}

/** Hoe groot een groep is, in de maat die bij de soort hoort. */
export function groepOmvang(g: Pick<GroepSamenvatting, 'soort' | 'leden' | 'regels'>): string {
  if (g.soort === 'statisch') return g.leden === 1 ? '1 lid' : `${g.leden} leden`
  const n = g.regels?.length ?? 0
  return n === 1 ? '1 regel' : `${n} regels`
}

export const SOORT_LABEL: Record<GroepSoort, string> = {
  statisch: 'Statisch',
  dynamisch: 'Dynamisch',
}

/** Lees `{ error }` uit een envelope, met een nette terugval. */
export async function foutUit(res: Response, wat: string): Promise<string> {
  const data: unknown = await res.json().catch(() => null)
  return (data as { error?: string } | null)?.error ?? `${wat} mislukt (HTTP ${res.status})`
}
