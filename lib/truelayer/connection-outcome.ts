/**
 * De uitkomst van één koppelpoging, afgeleid uit de `bank_connections`-rij die
 * `auth-link` aanmaakte (B-051). Puur, zodat de route dun blijft en de grenzen
 * testbaar zijn.
 *
 * De callback zet de rij op `active` zodra de code is ingewisseld en schrijft
 * dáárna pas de koppelrijen. Een actieve rij zonder koppelrij is dus eerst "nog
 * bezig" en pas na {@link LINKING_GRACE_MS} een mislukking: de callback redirect
 * dan naar `?error=geen_koppeling` of `drager_bezet` en schrijft niets meer.
 */

export type ConnectionOutcome = 'wachten' | 'gelukt' | 'mislukt'

/** Ruim boven de looptijd van een callback, die meerdere bankaanroepen doet. */
export const LINKING_GRACE_MS = 90_000

export function deriveConnectionOutcome(input: {
  status: string | null
  authorizedAt: string | null
  linkedAccounts: number
  now: Date
}): ConnectionOutcome {
  if (input.status === 'pending') return 'wachten'
  if (input.status !== 'active') return 'mislukt'
  if (input.linkedAccounts > 0) return 'gelukt'

  const authorizedMs = input.authorizedAt ? Date.parse(input.authorizedAt) : NaN
  if (Number.isNaN(authorizedMs)) return 'wachten'
  return input.now.getTime() - authorizedMs > LINKING_GRACE_MS ? 'mislukt' : 'wachten'
}
