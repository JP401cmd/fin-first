/**
 * Server-side partnerblok voor de canonieke huishouden-FIRE-run (TPR-07, 13 sep 2026).
 *
 * `computeHorizonFireSim(supabase, 'household')` (lib/fire-target-shared.ts) draaide tot
 * TPR-07 een SOLO-kernel-run op de gecombineerde huishoud-potten: Box 3 heffingvrij ×1,
 * geen partner-inkomen/-AOW. De huishoud-FIRE-sectie op /toekomst
 * (`lib/household-projection.ts` → `household-router.ts`) draaide wél de PT-partnerlaag.
 * Twee grondslagen voor hetzelfde huishouden. Deze loader levert het partnerblok voor de
 * convergentie-route, gebouwd met DEZELFDE helper als de sectie
 * (`adapter/partner-blok.ts#buildKernelPartnerBlok`).
 *
 * ## Bron en privacy
 * Uitsluitend de privacy-gated RPC `household_member_profiles` op de RLS-client van de
 * ingelogde gebruiker (SECURITY DEFINER; géén service-role). Die RPC zet bij
 * `future = 'hidden'` álle projectievelden van de partner op NULL (+ `future_hidden`) en
 * bij inkomen-privacy ≠ 'full' het inkomen op NULL — het blok kan dus nooit méér dragen
 * dan wat de partner deelt, en `buildKernelPartnerBlok` levert `null` zodra de partner
 * zijn toekomst verbergt of geen geboortedatum vrijgeeft (→ solo-run, zoals voorheen).
 * Dezelfde RPC wordt vandaag al vanuit de browser aangeroepen (huishoud-sectie), dus dit
 * pad verbreedt de blootstelling niet. Het blok verlaat deze module alleen als onderdeel
 * van `HorizonFireSim.rawContext`, die niet op `HorizonPageData` staat.
 *
 * ## Bewuste grens
 * De partner-eigen levensgebeurtenissen (RPC `household_partner_life_events`) reizen NIET
 * mee: de adapter gebruikt `partner.lifeEvents` alleen voor de partner-SOLO-run
 * (`buildPerspectiefInputs`), niet voor de gecombineerde run. Ze in de top-level
 * `lifeEvents` van de convergentie-context mengen is de vervolgfase (zie de kaart).
 *
 * React `cache()` op de client-instantie: binnen één render één RPC-ronde, hoe vaak
 * consumenten ook een huishoud-run opvragen.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedPerspectiveContext } from '@/lib/household/perspective-loader-server'
import {
  buildKernelPartnerBlok,
  type KernelMemberProfileRow,
} from '@/lib/horizon-kernel/adapter/partner-blok'
import type { KernelAdapterPartner } from '@/lib/horizon-kernel/adapter/household'

/** RPC-rij met de lid-id erbij (de rest is de kernel-subset). */
type MemberProfileRpcRow = KernelMemberProfileRow & { id: string }

const loadPartnerKernelBlokCached = cache(async function loadPartnerKernelBlokInner(
  supabase: SupabaseClient,
): Promise<KernelAdapterPartner | null> {
  let partnerId: string | null
  try {
    const ctx = await getCachedPerspectiveContext(supabase)
    partnerId = ctx.hasHousehold ? ctx.partnerId : null
  } catch {
    // Niet ingelogd / geen context → geen huishouden → solo.
    return null
  }
  if (!partnerId) return null

  const { data, error } = await supabase.rpc('household_member_profiles')
  if (error || !Array.isArray(data)) {
    // Server-side signaal met grep-bare tag (security-review TPR-07): een kapotte RPC
    // degradeert élk huishoud-FIRE-cijfer stil naar solo — dat mag niet onzichtbaar zijn.
    // Alleen de foutcode/boodschap server-side; er verlaat niets deze functie.
    console.warn('[partner-kernel-blok:rpc]', error?.message ?? 'geen rijen')
    return null
  }
  const row = (data as MemberProfileRpcRow[]).find((m) => m.id === partnerId) ?? null
  return buildKernelPartnerBlok({ profile: row })
})

/**
 * Het partnerblok van de huidige gebruiker voor een HUISHOUDEN-kernel-run, of `null`
 * (solo, geen partner, toekomst verborgen, geen geboortedatum, RPC-fout). Nooit een
 * throw: een ontbrekend blok degradeert naar de solo-run, precies het gedrag vóór TPR-07.
 */
export function loadPartnerKernelBlok(
  supabase: SupabaseClient,
): Promise<KernelAdapterPartner | null> {
  return loadPartnerKernelBlokCached(supabase)
}
