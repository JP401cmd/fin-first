/**
 * Horizon-kernel — feature-flags (FASE 5, gap-besluit V13, ADR 0032 §6).
 *
 * Tijdens de FASE 5-flag-periode wordt de nieuwe horizon-kernel gefaseerd naar
 * de echte consumenten gebracht achter vier **per-gebruiker** vlaggen. De stand
 * leeft in de user-writable JSONB-kolom `profiles.feature_preferences` (één sleutel
 * per vlag, zie `KERNEL_FLAG_KEYS`). Er is geen globale/omgevings-schakelaar: elke
 * gebruiker flipt onafhankelijk, zodat we per account kunnen uitrollen en terugrollen.
 *
 * **Convergentie-set-invariant (ADR 0032 §6).** De vlag `convergentie` schakelt de
 * kern-getallen als één GEHEEL om: /overzicht-hero, de /toekomst-grafiek, de
 * dashboard-loader (`freedomPct`) én de AI-context lezen dan allemaal uit de kernel.
 * Dat is bewust één vlag i.p.v. vier losse — anders zou dezelfde gebruiker op de ene
 * pagina een oud en op de andere een nieuw getal zien (drift). `whatif`, `household`
 * en `scalar` schakelen hun eigen, apart uitrolbare oppervlak.
 *
 * **Default = alles UIT.** Anders dan de oude v2-flip (die default AAN was en met een
 * expliciete `false` uitschakelde) telt hier uitsluitend een letterlijke `true` als
 * aan. Een ontbrekende kolom, `null`, een ontbrekende sleutel, of een truthy-maar-niet-
 * boolean-waarde (`'true'`, `1`) laat de vlag UIT. Zo blijft de kernel inert tot een
 * account 'm bewust aanzet.
 *
 * **Puur & isomorf.** Geen imports behalve types, geen `'use client'`, geen fs/Supabase/
 * Date/Math.random — server- én client-side bruikbaar. Bewust NIET geëxporteerd via
 * `lib/horizon-kernel/index.ts`: de barrel blijft domein-/rekenkern-zuiver (de adapter
 * zit er ook niet in). Consumenten importeren dit direct: `@/lib/horizon-kernel/flag`.
 */

/**
 * Contract-lock: de vier `feature_preferences`-sleutels. Getest op exacte waarden —
 * ze zijn onderdeel van het opslagcontract en mogen niet stilletjes hernoemen.
 */
export const KERNEL_FLAG_KEYS = {
  convergentie: 'horizon_kernel_convergentie',
  whatif: 'horizon_kernel_whatif',
  household: 'horizon_kernel_household',
  scalar: 'horizon_kernel_scalar',
} as const

/** Logische vlagnaam (de sleutel van `KERNEL_FLAG_KEYS`), niet de opslag-string. */
export type KernelFlagName = keyof typeof KERNEL_FLAG_KEYS

/** Volledige, opgeloste stand van alle vier de kernel-vlaggen. */
export interface KernelFlags {
  convergentie: boolean
  whatif: boolean
  household: boolean
  scalar: boolean
}

/**
 * Minimaal profiel-vorm: alles wat we nodig hebben is de JSONB-preferences-kolom.
 * Losstaand type zodat de helper geen DB-/rij-type hoeft te importeren (isomorf).
 */
type ProfileWithPrefs =
  | { feature_preferences?: Record<string, unknown> | null }
  | null
  | undefined

/**
 * Is één specifieke kernel-vlag aan voor dit profiel?
 *
 * Alleen een letterlijke boolean `true` telt als aan (default UIT — zie module-doc).
 * `null`/`undefined` profiel, ontbrekende `feature_preferences`, ontbrekende sleutel
 * of een niet-boolean-truthy-waarde geven allemaal `false`.
 */
export function isKernelFlagEnabled(
  profile: ProfileWithPrefs,
  flag: KernelFlagName,
): boolean {
  const fp = profile?.feature_preferences
  if (!fp) return false
  return fp[KERNEL_FLAG_KEYS[flag]] === true
}

/**
 * Lost alle vier de vlaggen in één keer op tot een volledige `KernelFlags`-stand.
 * Handig voor de beheer-toggle-route en context-builders die de complete set willen.
 */
export function readKernelFlags(profile: ProfileWithPrefs): KernelFlags {
  return {
    convergentie: isKernelFlagEnabled(profile, 'convergentie'),
    whatif: isKernelFlagEnabled(profile, 'whatif'),
    household: isKernelFlagEnabled(profile, 'household'),
    scalar: isKernelFlagEnabled(profile, 'scalar'),
  }
}
