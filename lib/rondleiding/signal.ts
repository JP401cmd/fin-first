'use client'

/**
 * rondleiding-signal — twee module-scoped signalen rond de rondleiding op
 * /overzicht (ADR 0130).
 *
 * WAAROM APART VAN `lib/overlay-signal.ts`. De rondleiding is een spotlight:
 * vier scrim-panelen rondom een GAT waarin het uitgelichte element zichtbaar
 * én tikbaar blijft. Ze claimt daarom bewust GEEN `acquireOverlay()` en geen
 * scroll-lock — anders zou de nav-pill zichzelf verbergen en zou de laatste
 * stap ("en hier vind je mij") naar een leeg vlak wijzen. Precies daarom heeft
 * ze een eigen signaal nodig: Fin moet tijdens de tour wél zwijgen (een
 * proactieve melding zou onder de scrim opdoemen), en dat kan hij niet uit de
 * overlay-teller aflezen.
 *
 * TWEE SIGNALEN, TWEE RICHTINGEN:
 *  - `requested` — "start de rondleiding" (van de gidsweergave in Fin of van de
 *    pagina-`i` naar de provider op /overzicht). Een verzoek, geen staat: de
 *    provider leest 'm en wist 'm meteen.
 *  - `active` — "de rondleiding loopt". Gezet door de provider, gelezen door
 *    FinHome (`paused`).
 *
 * SINDS UR3-10 (ADR 0134) leeft `active` niet meer als eigen boolean maar als
 * de claim `'rondleiding'` in het gedeelde aandachtsregister
 * (`lib/attention-signal.ts`). De API hieronder is ONGEWIJZIGD — alle bestaande
 * aanroepers blijven werken — maar de rondleiding sluit zich daarmee aan bij
 * dezelfde regel als Fins melding en de coachmark: één aandachtsvrager tegelijk.
 * Het `requested`-signaal blijft lokaal: dat is een verzoek, geen zichtbare laag.
 *
 * Waarom een module-teller + CustomEvent i.p.v. React-context: net als bij
 * `overlay-signal` staan de lezers en de schrijver in verschillende takken van
 * de boom (de gidsweergave hangt in de chat-portal, de provider op /overzicht),
 * en `useSyncExternalStore` is portal-agnostisch en SSR-veilig.
 */

import { useSyncExternalStore } from 'react'
import {
  claimAttention,
  hasAttentionClaim,
  useAttentionClaimedBy,
} from '@/lib/attention-signal'

/**
 * De kale namen wonen in `./constants` — géén React, dus ook leesbaar vanuit een
 * Server Component (`lib/rondleiding/seed.ts` doet dat, vanaf de /overzicht-page).
 * Ze worden hier ONGEWIJZIGD doorgegeven zodat elke bestaande client-import van
 * `@/lib/rondleiding/signal` blijft werken; wie ze server-side nodig heeft,
 * importeert ze rechtstreeks uit `./constants` en trekt dit bestand (met zijn
 * `useSyncExternalStore`) niet de RSC-graaf in.
 */
export {
  RONDLEIDING_ROUTE,
  RONDLEIDING_QUERY_PARAM,
  RONDLEIDING_COACHMARK_ID,
  RONDLEIDING_PENDING_KEY,
} from './constants'

const REQUEST_EVENT = 'trifinity:rondleiding-request'

let requested = false
/** Release-functie van de actieve `'rondleiding'`-claim, of `null`. */
let rondleidingRelease: (() => void) | null = null

function emit(name: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name))
}

/** Vraag de rondleiding te starten (gidsweergave in Fin, pagina-`i`). */
export function requestRondleiding(): void {
  requested = true
  emit(REQUEST_EVENT)
}

/** Wis het startverzoek — de provider doet dit zodra hij het heeft opgepakt. */
export function clearRondleidingRequest(): void {
  if (!requested) return
  requested = false
  emit(REQUEST_EVENT)
}

/**
 * Meld of de rondleiding loopt. Alleen de provider roept dit aan.
 *
 * Idempotent gehouden bovenop de ref-counted `claimAttention`: de provider zet
 * een STAAT ("de tour loopt"), geen telling. Twee keer `true` mag dus nooit
 * twee claims opleveren die één release niet meer opruimt.
 */
export function setRondleidingActive(next: boolean): void {
  if (next) {
    if (hasAttentionClaim('rondleiding')) return
    rondleidingRelease = claimAttention('rondleiding')
    return
  }
  rondleidingRelease?.()
  rondleidingRelease = null
}

/** Huidige actief-staat. Bedoeld voor tests / niet-React-lezers. */
export function isRondleidingActive(): boolean {
  return hasAttentionClaim('rondleiding')
}

/** Reset beide signalen. ALLEEN voor tests — voorkomt lekken tussen cases. */
export function __resetRondleidingSignal(): void {
  requested = false
  setRondleidingActive(false)
  emit(REQUEST_EVENT)
}

function subscribeTo(name: string) {
  return (onChange: () => void): (() => void) => {
    if (typeof window === 'undefined') return () => {}
    window.addEventListener(name, onChange)
    return () => window.removeEventListener(name, onChange)
  }
}

const subscribeRequest = subscribeTo(REQUEST_EVENT)

function getRequestedSnapshot(): boolean {
  return requested
}

function getServerSnapshot(): boolean {
  return false
}

/** `true` zolang er een onverwerkt startverzoek staat. SSR-veilig. */
export function useRondleidingRequested(): boolean {
  return useSyncExternalStore(subscribeRequest, getRequestedSnapshot, getServerSnapshot)
}

/** `true` zolang de rondleiding loopt. SSR-veilig. */
export function useRondleidingActive(): boolean {
  return useAttentionClaimedBy('rondleiding')
}
