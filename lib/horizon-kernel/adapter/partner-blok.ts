/**
 * Horizon-kernel adapter — het PARTNERBLOK als ÉÉN helper (TPR-07, 13 sep 2026).
 *
 * Twee routes draaien een huishouden-run met de partner via de PT-laag (`box3.personen
 * = 2`, `leefsituatie = 'Samenwonend'`, partner-inkomen/-AOW — `household.ts#
 * buildPartnerParams`):
 *
 *  1. de **huishoud-FIRE-sectie** (`lib/household-projection.ts` → `household-router.ts`),
 *     die het partnerprofiel uit de privacy-gated RPC `household_member_profiles` leest;
 *  2. de **convergentie-route** (`convergentie-router.ts`, gevoed door
 *     `lib/fire-target-shared.ts#computeHorizonFireSim(supabase, 'household')`), die tot
 *     TPR-07 in huishoudperspectief een SOLO-run op de gecombineerde potten draaide —
 *     Box 3 heffingvrij ×1, geen partner-inkomen/-AOW — en daarmee een ándere grondslag
 *     had dan de sectie ernaast.
 *
 * Beide routes bouwen het blok sinds TPR-07 hier: één mapping van het RPC-profiel naar
 * `KernelAdapterProfile` (`memberProfileToKernelAdapterProfile`) en één samenstelling
 * van het `KernelAdapterPartner`-blok (`buildKernelPartnerBlok`). Een veld dat hier
 * bijkomt, komt op beide oppervlakken bij; een tweede uitgeschreven mapping is per
 * definitie toekomstige drift.
 *
 * ## Privacy — hier wordt NIETS verruimd
 * De RPC `household_member_profiles` (SECURITY DEFINER) past de privacy van de partner
 * al toe: bij `future = 'hidden'` zijn álle projectievelden NULL en is `future_hidden`
 * true; bij inkomen-privacy ≠ 'full' zijn `net_monthly_income`/`estimated_monthly_expenses`
 * NULL. Deze helper mapt uitsluitend wat die RPC al vrijgaf — géén tweede bron, géén
 * service-role — en levert `null` zodra de partner zijn toekomst verbergt of geen
 * geboortedatum heeft (zonder tijdas kan de PT-laag niet bouwen). Dezelfde velden
 * bereiken de browser vandaag al via de client-aanroep van dezelfde RPC in
 * `buildHouseholdProjectionInput`; het blok voegt dus geen partnerdetail toe aan wat de
 * gebruiker al kon zien.
 *
 * App-zijde, pure functies; geen Supabase/Date.now/Math.random.
 */

import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { LifeEvent } from '@/lib/horizon-data'
import type { KernelAdapterPartner } from './household'
import type { KernelAdapterProfile } from './params'

/**
 * De projectie-velden van één huishoudlid zoals de RPC `household_member_profiles` ze
 * levert (privacy reeds toegepast). Bewust een SUBSET: alleen wat de kernel-adapter
 * nodig heeft. Ontbrekende kern-velden (box3-methode, woning-/onttrekkings-config,
 * guardrails) blijven undefined → adapter-defaults.
 */
export interface KernelMemberProfileRow {
  date_of_birth?: string | null
  net_monthly_income?: number | string | null
  estimated_monthly_expenses?: number | string | null
  expected_return?: number | string | null
  inflation_rate?: number | string | null
  fire_end_strategy?: string | null
  fire_end_age?: number | null
  fire_legacy_amount?: number | string | null
  retirement_expense_method?: string | null
  retirement_expense_custom_amount?: number | string | null
  /** ADR 0149 — de EIGEN planvoorwaarde van het lid ("geen tekort-lening"); NULL → uit. */
  fire_no_deficit_loan?: boolean | null
  /** Lid verbergt z'n toekomst-gegevens voor het huishouden (privacy 'future' = 'hidden'). */
  future_hidden?: boolean | null
}

/** NUMERIC-kolommen komen via PostgREST/MCP als string terug — expliciet casten. */
function num(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Huishoudlid-profiel (RPC-rij) → `KernelAdapterProfile`. Mapt UITSLUITEND de al-geladen
 * velden — géén data-verbreding. De kolom-hernoeming `retirement_expense_custom_amount`
 * → `retirement_custom_amount` volgt de convergentie-mapper (`buildConvergentieAdapterProfile`).
 *
 * Tot TPR-07 stond deze mapping als private `toKernelAdapterProfile` in
 * `lib/household-projection.ts`; dit is dezelfde functie, nu gedeeld.
 */
export function memberProfileToKernelAdapterProfile(
  p: KernelMemberProfileRow | null | undefined,
): KernelAdapterProfile {
  return {
    date_of_birth: p?.date_of_birth ?? null,
    net_monthly_income: num(p?.net_monthly_income),
    estimated_monthly_expenses: num(p?.estimated_monthly_expenses),
    expected_return: num(p?.expected_return),
    inflation_rate: num(p?.inflation_rate),
    fire_end_strategy: p?.fire_end_strategy ?? null,
    fire_end_age: p?.fire_end_age ?? null,
    fire_legacy_amount: num(p?.fire_legacy_amount),
    retirement_expense_method: p?.retirement_expense_method ?? null,
    retirement_custom_amount: num(p?.retirement_expense_custom_amount),
    // ADR 0149 — de partner draagt zijn EIGEN profielwaarde (geen erfenis van het
    // hoofdlid); de RPC-rij moet de kolom dan wel leveren.
    fire_no_deficit_loan: p?.fire_no_deficit_loan ?? null,
  }
}

/** Invoer voor `buildKernelPartnerBlok`. */
export interface KernelPartnerBlokSource {
  /** Het partnerprofiel als `KernelAdapterProfile` (al gemapt) of als rauwe RPC-rij. */
  readonly profile: KernelAdapterProfile | KernelMemberProfileRow | null | undefined
  /** Partner-eigen AOW-tabel; weggelaten → de adapter valt terug op de top-level `aowRows`. */
  readonly aowRows?: readonly AowLeeftijdRow[]
  /** Partner-eigen levensgebeurtenissen (alleen relevant voor de partner-solo-run). */
  readonly lifeEvents?: readonly LifeEvent[]
}

/** Onderscheid rauwe RPC-rij vs. al-gemapt adapter-profiel (die kent `retirement_custom_amount`). */
function isRawMemberRow(
  p: KernelAdapterProfile | KernelMemberProfileRow,
): p is KernelMemberProfileRow {
  return 'future_hidden' in p || 'retirement_expense_custom_amount' in p
}

/**
 * Stel het `partner`-blok voor `KernelAdapterInput` samen — de ENIGE plek waar dat
 * gebeurt (huishoud-router én convergentie-route).
 *
 * `null` (= solo-run, byte-identiek aan een invoer zónder partnerblok) wanneer:
 *  - er geen partnerprofiel is;
 *  - de partner zijn toekomst verbergt (`future_hidden`) — de RPC heeft dan toch al alle
 *    projectievelden op NULL gezet, maar we maken het expliciet zodat de run niet op een
 *    profiel zonder inhoud een PT-laag bouwt;
 *  - de geboortedatum ontbreekt — zonder tijdas gooit `buildPartnerParams`; liever geen
 *    partnerlaag dan een kern-fout die het hele oppervlak degradeert.
 *
 * Optionele velden die `undefined` zijn worden WEGGELATEN (geen `aowRows: undefined`-
 * sleutels), zodat het blok structureel gelijk is aan wat de huishoud-router vóór TPR-07
 * inline bouwde en structured-clone/`toEqual`-vergelijkingen niet op spook-sleutels stuiten.
 */
export function buildKernelPartnerBlok(src: KernelPartnerBlokSource): KernelAdapterPartner | null {
  const raw = src.profile
  if (!raw) return null
  if (isRawMemberRow(raw) && raw.future_hidden === true) return null
  const profile = isRawMemberRow(raw) ? memberProfileToKernelAdapterProfile(raw) : raw
  if (!profile.date_of_birth) return null
  return {
    profile,
    ...(src.aowRows !== undefined ? { aowRows: src.aowRows } : {}),
    ...(src.lifeEvents !== undefined ? { lifeEvents: src.lifeEvents } : {}),
  }
}
