/**
 * DGA-leentotaal voor de Wet excessief lenen (Box 2).
 *
 * Pure aggregatie-module — geen Supabase/`server-only`/`next/headers` in de
 * import-graaf — zodat de route (`app/api/household/box2/route.ts`) én de
 * UAT/regressietests dezelfde logica delen (één bron van waarheid, testbaar
 * zonder DB). De pure drempel/excess-motor blijft `calculateBox2`
 * (`lib/box2-data.ts`); deze module bepaalt UITSLUITEND hoe het
 * `dgaLeningenTotal` dat die motor voedt wordt opgebouwd.
 *
 * OPTIE B (productbesluit kaart 39bf9e8d, gebruiker koos 'B'):
 * `dgaLeningenTotal` = som(DGA-schulden `dga_schuld`) + som(DGA-vorderingen
 * `vordering`+subtype `dga_lening`), beide OPGETELD. De Wet excessief lenen
 * belast wat de DGA (per saldo) van/via de eigen BV geleend heeft; het
 * bestaande aanmaakformulier (`components/core/assets-client.tsx`) behandelt een
 * `dga_lening`-vordering al als volwaardig leenbedrag dat bij de €500k-grens
 * optelt. Vóór deze fix trok de route de vorderingen juist AF van de schulden
 * (teken omgekeerd), waardoor een DGA met een pure rekening-courant-SCHULD aan
 * de eigen BV boven de drempel géén waarschuwing kreeg — precies het scenario
 * dat de wet target.
 */

/** Eén DGA-leenpost (schuld of vordering), genormaliseerd naar bedrag +
 *  eigenaarschap zodat de perspectief-filters (own/shared/hidden) werken. */
export interface DgaLeningItem {
  /** Eigenaar van de post (`assets.user_id` / `debts.user_id`). */
  userId: string
  /** `'shared'` = gedeeld huishoud-bezit; anders persoonlijk. */
  ownership: string
  /** Openstaand bedrag (schuld: `current_balance`; vordering: `current_value`). */
  amount: number
}

/** De twee bronnen die samen het DGA-leentotaal vormen. */
export interface DgaLeningSources {
  /** DGA-schulden aan de eigen BV (`debt_type = 'dga_schuld'`). */
  schulden: DgaLeningItem[]
  /** DGA-vorderingen (`asset_type = 'vordering'`, `subtype = 'dga_lening'`). */
  vorderingen: DgaLeningItem[]
}

function sumWhere(items: DgaLeningItem[], keep: (it: DgaLeningItem) => boolean): number {
  return items.reduce((s, it) => (keep(it) ? s + Number(it.amount) : s), 0)
}

/**
 * DGA-leentotaal voor één persoon: diens persoonlijke (niet-gedeelde) posten +
 * alle gedeelde posten. `max(0, …)` als guard tegen negatieve invoer.
 */
export function dgaLeningTotalForUser(sources: DgaLeningSources, userId: string): number {
  const keep = (it: DgaLeningItem) => it.ownership === 'shared' || it.userId === userId
  const total = sumWhere(sources.schulden, keep) + sumWhere(sources.vorderingen, keep)
  return Math.max(0, total)
}

/**
 * Gecombineerd huishoud-DGA-leentotaal over de ZICHTBARE set. Verbergt de
 * partner zijn/haar vermogen (privacy 'hidden'), dan vallen diens persoonlijke
 * (niet-gedeelde) posten weg; gedeelde posten blijven. Spiegelt de
 * `visibleVorderingen`/`visibleSchulden`-filtering die de route eerder inline
 * deed.
 */
export function dgaLeningTotalCombined(
  sources: DgaLeningSources,
  currentUserId: string,
  partnerHidesVermogen: boolean,
): number {
  const keep = (it: DgaLeningItem) =>
    !partnerHidesVermogen || it.ownership === 'shared' || it.userId === currentUserId
  const total = sumWhere(sources.schulden, keep) + sumWhere(sources.vorderingen, keep)
  return Math.max(0, total)
}
