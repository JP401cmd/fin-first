// ── Jaarruimte-facts: gedeelde afleiding voor cloud- én lokale Fin ─────────────
//
// Composeert de canonieke jaarruimte-motoren (`lib/jaarruimte.ts`) met één
// netto→bruto-inkomensschatting tot een klein feiten-object dat zowel
// `tax-context` (cloud-Fin) als `local-chat-context` (lokale Fin) consumeren.
//
// SINGLE SOURCE: vóór deze module leefde `estimateGrossYearly` privé in
// `tax-context.ts`; de lokale Fin had geen jaarruimte. Door de schatting hier te
// centraliseren krijgen beide paden EXACT dezelfde bruto-schatting — en daarmee
// dezelfde jaarruimte + besparing (geen drift, conform de eenduidige-gegevens-
// audit). CONSUME, DON'T RECOMPUTE: de eigenlijke rekenregels blijven
// `computeJaarruimte` + `jaarruimteBesparing`; deze module orkestreert alleen.

import { marginalRateAt, type Box1TaxYear } from '@/lib/box1-tax'
import { computeJaarruimte, jaarruimteBesparing, resolvePensionFactorA } from '@/lib/jaarruimte'

/**
 * Het profiel-shape dat {@link resolvePensionFactorA} leest. Bewust het OBJECT
 * (en niet een al-losgetrokken `factorA`-getal) als invoer van
 * {@link computeJaarruimteFacts}: alleen zo reist de `isKnown`-kwalificatie mee
 * en kan een volgende consument haar niet vergeten (H23-vervolg, 3-9-2026 —
 * drie consumenten trokken 'm afzonderlijk los en lieten 'm alle drie vallen).
 */
export interface PensionFactorAProfile {
  pension_factor_a?: number | null
  pension_factor_a_source?: string | null
}

/**
 * De kwalificatie-bijzin bij een jaarruimte-bedrag dat op een ONBEKENDE factor A
 * rust. Eén string, gedeeld door alle tekst-renderplekken (cloud tax-context en
 * de drie lokale prompt-paden), zodat Fin overal dezelfde onzekerheid uitspreekt.
 *
 * WAAROM (H23). `resolvePensionFactorA` levert bij een leeg `pension_factor_a`
 * `factorA: 0` mét `isKnown: false` — NULL ≠ 0. De motor rekent dan zonder
 * pensioenaftrek en de uitkomst is dus de BOVENGRENS van de jaarruimte, niet het
 * bedrag. `components/overview/jaarruimte-card.tsx` toont dat al als badge +
 * bereik; de AI-paden herhaalden het bedrag als hard feit. Kort gehouden i.v.m.
 * het tokenbudget van de lokale prompts.
 */
export const JAARRUIMTE_BOVENGRENS_SUFFIX = ' (bovengrens — factor A niet ingevuld)'

/**
 * Schat het bruto jaarinkomen uit het netto maandinkomen via netto/(1−marginaal).
 * Het marginale tarief hangt zelf van het bruto af, dus we itereren een paar keer
 * (fixed-point) tot het stabiliseert. Faal-zacht: 0 in → 0 uit.
 *
 * Verplaatst uit `tax-context.ts` (was daar privé) zodat de lokale Fin exact
 * dezelfde bruto-schatting — en daarmee dezelfde jaarruimte — krijgt.
 */
export function estimateGrossYearly(netMonthlyIncome: number, year: Box1TaxYear = 2026): number {
  const netYearly = Math.max(0, netMonthlyIncome) * 12
  if (netYearly <= 0) return 0
  // Startschatting: gebruik een redelijk middentarief om te beginnen.
  let gross = netYearly / (1 - 0.37)
  for (let i = 0; i < 6; i++) {
    const marginal = marginalRateAt(Math.round(gross), year)
    const denom = 1 - marginal
    if (denom <= 0.05) break // bescherm tegen deling door (bijna) nul
    const next = netYearly / denom
    if (Math.abs(next - gross) < 1) {
      gross = next
      break
    }
    gross = next
  }
  return Math.round(gross)
}

/** Compacte jaarruimte-feiten voor de Fin-context (cloud + lokaal). */
export interface JaarruimteFacts {
  /** False bij geen/onvoldoende inkomen of wanneer de onbenutte ruimte 0 is. */
  hasData: boolean
  /** Onbenutte aftrekruimte in EUR (`computeJaarruimte().jaarruimte`). */
  onbenut: number
  /** Geschatte Box 1-belastingbesparing bij volledige benutting (EUR). */
  besparing: number
  /** Geschat bruto jaarinkomen (EUR) dat aan de berekening ten grondslag ligt. */
  grossYearly: number
  /**
   * Of factor A daadwerkelijk bekend is (`resolvePensionFactorA().isKnown`).
   * False → `onbenut`/`besparing` zijn een BOVENGRENS (er is zonder
   * pensioenaftrek gerekend), niet het bedrag. Stuurt uitsluitend de WEERGAVE,
   * nooit de motor — zie {@link JAARRUIMTE_BOVENGRENS_SUFFIX}.
   */
  factorAKnown: boolean
}

/**
 * Leid de jaarruimte-feiten af uit netto maandinkomen + factor A. Wrapt de
 * canonieke motoren (`estimateGrossYearly` → `computeJaarruimte` →
 * `jaarruimteBesparing`) zodat beide Fin-paden identieke cijfers tonen.
 *
 * De factor-A-RESOLUTIE zit BEWUST hier binnen (H23-vervolg): consumenten geven
 * het profiel-shape mee, niet een kaal getal. Dat is geen stijlkeuze — de vlag
 * `isKnown` viel drie keer weg doordat elke consument zelf
 * `resolvePensionFactorA(...).factorA` schreef en de rest van het resultaat
 * weggooide. Met het profiel als parameter kan een volgende consument haar niet
 * meer laten vallen.
 *
 * @param netMonthlyIncome Netto maandinkomen (EUR) — `profiles.net_monthly_income`.
 * @param profile          Profielrij met `pension_factor_a` (+ `_source`); mag
 *                         null zijn → factor A onbekend (NULL ≠ 0).
 * @param year             Belastingjaar (2025 | 2026). Default 2026.
 */
export function computeJaarruimteFacts(
  netMonthlyIncome: number,
  profile: PensionFactorAProfile | null | undefined,
  year: Box1TaxYear = 2026,
): JaarruimteFacts {
  const { factorA, isKnown } = resolvePensionFactorA(profile)
  const grossYearly = estimateGrossYearly(netMonthlyIncome, year)
  if (grossYearly <= 0) {
    return { hasData: false, onbenut: 0, besparing: 0, grossYearly: 0, factorAKnown: isKnown }
  }
  const jr = computeJaarruimte(grossYearly, factorA, year)
  if (!jr.hasData || jr.jaarruimte <= 0) {
    return { hasData: false, onbenut: 0, besparing: 0, grossYearly, factorAKnown: isKnown }
  }
  const besparing = jaarruimteBesparing(grossYearly, jr.jaarruimte, year)
  return { hasData: true, onbenut: jr.jaarruimte, besparing, grossYearly, factorAKnown: isKnown }
}
