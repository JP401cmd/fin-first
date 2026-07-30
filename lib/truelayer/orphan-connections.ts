/**
 * Welke bankverbindingen ruimt de OAuth-callback op? Puur en zonder database,
 * zodat route én regressietest exact dezelfde regel consumeren.
 */

/**
 * Hoe lang een `pending` verbinding met rust wordt gelaten.
 *
 * Elke klik op "Verbind" maakt via /api/bank-connect/auth-link zo'n rij aan. Een
 * gebruiker kan een tweede koppeling open hebben staan (bank B in een ander
 * tabblad) terwijl de callback van bank A binnenkomt. Zonder drempel zou dát
 * verzoek de nog lopende poging expiren, waarna de gebruiker bij hervatting door
 * de `status='pending'`-guard heen valt naar ?error=connection_not_found.
 */
export const PENDING_ORPHAN_GRACE_MS = 60 * 60 * 1000

/** De velden die de opruiming van een verbinding nodig heeft. */
export type OrphanCandidate = {
  id: string
  status: string | null
  created_at: string | null
}

/**
 * Selecteert de verbindingen die als verweesd mogen worden afgesloten.
 *
 * Verweesd = draagt geen enkele bankrekening meer. Dat gebeurt na een
 * herautorisatie (de rekeningen zijn naar de nieuwe verbinding verhangen, de
 * oude blijft achter met een levend token) en na een afgebroken koppelpoging.
 *
 * - `expired`/`revoked` blijven ongemoeid: die zijn al afgesloten.
 * - `active` zonder rekeningen gaat altijd mee, ongeacht ouderdom. Dat een
 *   actieve verbinding geen rekeningen meer heeft, is het bewijs dat ze zojuist
 *   is opgevolgd — juist daar willen we het levende token meteen doden.
 * - `pending` gaat alleen mee als de rij ouder is dan {@link PENDING_ORPHAN_GRACE_MS};
 *   een verse pending hoort bij een andere, nog lopende koppeling.
 * - **Elke andere of onbekende status gaat mee.** Bewust een deny-list: bij een
 *   status die we niet herkennen falen we richting intrekken, niet richting een
 *   token dat blijft leven. Voegt iemand later een status toe die juist moet
 *   blíjven staan (bv. `reauthorizing`), dan hoort die hier expliciet bij de
 *   uitzonderingen — de test dekt deze tak af.
 *
 * @param connections alle verbindingen van de gebruiker
 * @param inUse ids die nog wél een rekening dragen (plus de verbinding die het
 *   huidige callback-verzoek zelf verwerkt)
 */
export function selectOrphanConnectionIds(
  connections: readonly OrphanCandidate[],
  inUse: ReadonlySet<string>,
  now: number = Date.now(),
): string[] {
  const cutoff = now - PENDING_ORPHAN_GRACE_MS

  return connections
    .filter((c) => {
      if (inUse.has(c.id)) return false
      if (c.status === 'expired' || c.status === 'revoked') return false

      if (c.status === 'pending') {
        // Ontbrekende/onleesbare created_at nooit als "oud" behandelen: bij
        // twijfel laten we een pending poging liever staan dan haar te slopen.
        const createdAt = c.created_at ? new Date(c.created_at).getTime() : NaN
        return Number.isFinite(createdAt) && createdAt < cutoff
      }

      return true
    })
    .map((c) => c.id)
}
