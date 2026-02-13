/**
 * Mapping from NIBUD category keys to app budget slugs.
 *
 * Some NIBUD categories map to the same budget slug (e.g. gas + elektriciteit + water
 * all map to 'gas-water-licht'). When comparing, we aggregate NIBUD amounts per slug.
 */
export const NIBUD_TO_BUDGET_SLUG: Record<string, string> = {
  voeding: 'boodschappen',
  gas: 'gas-water-licht',
  elektriciteit: 'gas-water-licht',
  water: 'gas-water-licht',
  huur_hypotheek: 'huur-hypotheek',
  zorgverzekering: 'verzekeringen-wonen',
  inboedel_opstal: 'verzekeringen-wonen',
  gemeentelijke_lasten: 'gemeentelijke-lasten',
  kleding: 'kleding-overige',
  vervoer: 'brandstof-ov',
  telefoon_internet: 'vrije-tijd-sport',
  recreatie: 'leuke-dingen',
  inventaris: 'huishouden-verzorging',
  persoonlijke_verzorging: 'huishouden-verzorging',
  kinderen: 'kinderen-school',
  niet_dagelijks_voeding: 'uit-eten-horeca',
}

/**
 * Aggregate NIBUD references by mapped budget slug.
 * Multiple NIBUD categories (gas, elektriciteit, water) sum into one slug.
 */
export function aggregateBySlug(
  references: { nibud_category_key: string; nibud_category_name: string; basis_amount: number; voorbeeld_amount: number | null; mapped_budget_slug: string | null }[],
): { slug: string; label: string; basis_total: number; voorbeeld_total: number | null }[] {
  const map = new Map<string, { label: string; basis: number; voorbeeld: number; hasVoorbeeld: boolean; keys: string[] }>()

  for (const ref of references) {
    const slug = ref.mapped_budget_slug ?? ref.nibud_category_key
    const existing = map.get(slug)
    if (existing) {
      existing.basis += Number(ref.basis_amount)
      if (ref.voorbeeld_amount != null) {
        existing.voorbeeld += Number(ref.voorbeeld_amount)
        existing.hasVoorbeeld = true
      }
      existing.keys.push(ref.nibud_category_name)
    } else {
      map.set(slug, {
        label: ref.nibud_category_name,
        basis: Number(ref.basis_amount),
        voorbeeld: ref.voorbeeld_amount != null ? Number(ref.voorbeeld_amount) : 0,
        hasVoorbeeld: ref.voorbeeld_amount != null,
        keys: [ref.nibud_category_name],
      })
    }
  }

  return Array.from(map.entries()).map(([slug, data]) => ({
    slug,
    label: data.keys.length > 1 ? data.keys.join(' + ') : data.label,
    basis_total: data.basis,
    voorbeeld_total: data.hasVoorbeeld ? data.voorbeeld : null,
  }))
}
