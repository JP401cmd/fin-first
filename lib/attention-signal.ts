'use client'

/**
 * attention-signal — het gedeelde AANDACHTSREGISTER: welke uitleglaag vraagt op
 * dít moment de aandacht van de gebruiker? (UR3-10, ADR 0134)
 *
 * WAAROM. De app had precies één pauze-regel — de unie in `FinHome` — maar die
 * was lokaal aan dat component. De euro-weergave-coachmark en de check-in-banner
 * hadden elk hun eigen zichtbaarheidslogica zonder die unie, met als gevolg dat
 * een nieuwe gebruiker in zijn eerste minuut drie tot vier meldingen tegelijk
 * over elkaar heen kreeg. Een unie-hook alleen lost dat voor vandaag op; het
 * REGISTER lost het ook op voor de vierde melding die er over een half jaar
 * bijkomt: die claimt een naam en is daarmee automatisch onderdeel van de regel.
 *
 * DIT IS GEEN OVERLAY-TELLER. `lib/overlay-signal.ts` telt pill-verbergende
 * overlays (modale lagen met scrim/focus-trap). Een aandachtsvrager is iets
 * anders: de rondleiding is een spotlight zónder scrim-claim (ADR 0130 D6) en
 * Fins melding is een niet-modale kaart. Beide moeten elkaar wél uitsluiten.
 * Vandaar een tweede, benoemd register naast de overlay-teller — de gedeelde
 * hook `lib/hooks/use-attention-quiet.ts` legt beide (plus chat en immersieve
 * routes) op één hoop.
 *
 * MECHANIEK identiek aan `overlay-signal`/`rondleiding/signal`: module-scoped
 * teller + CustomEvent + `useSyncExternalStore`. De lezers en schrijvers staan
 * in verschillende takken van de boom (zijbalk, portal, /overzicht-provider),
 * dus context zou hier niet reiken; `useSyncExternalStore` is portal-agnostisch
 * en SSR-veilig.
 *
 * RANGORDE. Het register kent geen prioriteiten: wie er eerst is, spreekt. De
 * volgorde in de eerste minuut ontstaat uit de timing die de lagen zelf al
 * hebben (rondleiding start op ~400 ms, Fins melding op 1,5 s, de coachmark
 * daarná). Een expliciete prioriteitentabel zou een tweede waarheid zijn naast
 * die timing.
 */

import { useSyncExternalStore } from 'react'

/**
 * De benoemde aandachtsvragers. Een nieuwe uitleglaag voegt hier zijn naam toe
 * en claimt 'm zolang hij zichtbaar is — dat is de hele aansluiting.
 *
 * - `rondleiding` — de spotlight-tour op /overzicht (ADR 0130).
 * - `fin-melding` — Fins proactieve meldkaart (`FinHome`, mode `melding`).
 *
 * DE EURO-COACHMARK CLAIMT BEWUST NIETS. Hij LEEST het register (via
 * `useAttentionQuiet`) en zwijgt zolang een ander spreekt, maar meldt zich niet
 * zelf aan. Dat ís zijn plek in de rangorde: onderaan. Zou hij wél claimen, dan
 * hield een popover die tot de eerste routewissel blijft staan Fin een hele
 * pagina lang stil — precies omgekeerd aan de bedoelde volgorde
 * (rondleiding > Fin-melding > coachmark).
 */
export type AttentionClaimId = 'rondleiding' | 'fin-melding'

const EVENT_NAME = 'trifinity:attention-change'

const claims = new Map<AttentionClaimId, number>()

function emit() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

/**
 * Meld een zichtbare aandachtsvrager aan. Geeft een idempotente release-functie
 * terug — roep 'm aan in de effect-cleanup zodra de laag verdwijnt. Ref-counted
 * per naam, zodat React StrictMode (mount → cleanup → mount) en twee exemplaren
 * van dezelfde laag elkaar niet vroegtijdig vrijgeven.
 */
export function claimAttention(id: AttentionClaimId): () => void {
  claims.set(id, (claims.get(id) ?? 0) + 1)
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    const next = (claims.get(id) ?? 0) - 1
    if (next > 0) claims.set(id, next)
    else claims.delete(id)
    emit()
  }
}

/** Claimt deze specifieke laag op dit moment de aandacht? */
export function hasAttentionClaim(id: AttentionClaimId): boolean {
  return (claims.get(id) ?? 0) > 0
}

/**
 * Is er een aandachtsvrager actief? `exclude` laat de aanvrager zichzelf
 * buiten beschouwing laten — anders zou Fin zichzelf het zwijgen opleggen zodra
 * zijn eigen melding openstaat.
 */
export function isAttentionClaimed(exclude?: AttentionClaimId): boolean {
  for (const [id, count] of claims) {
    if (count > 0 && id !== exclude) return true
  }
  return false
}

/** Huidige claimers. Bedoeld voor tests / debugging. */
export function getAttentionClaims(): AttentionClaimId[] {
  return [...claims.keys()].filter((id) => (claims.get(id) ?? 0) > 0)
}

/** Reset het register. ALLEEN voor tests — voorkomt lekken tussen cases. */
export function __resetAttentionSignal(): void {
  claims.clear()
  emit()
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT_NAME, onChange)
  return () => window.removeEventListener(EVENT_NAME, onChange)
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * `true` zolang er minstens één aandachtsvrager actief is (m.u.v. `exclude`).
 * SSR-veilig.
 */
export function useAttentionClaimed(exclude?: AttentionClaimId): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isAttentionClaimed(exclude),
    getServerSnapshot,
  )
}

/** `true` zolang deze specifieke laag de aandacht claimt. SSR-veilig. */
export function useAttentionClaimedBy(id: AttentionClaimId): boolean {
  return useSyncExternalStore(subscribe, () => hasAttentionClaim(id), getServerSnapshot)
}
