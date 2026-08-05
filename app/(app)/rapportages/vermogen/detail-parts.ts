/**
 * Detail-regels bij een bezit/schuld op het Vermogensoverzicht.
 *
 * Losgetrokken uit `page.tsx` zodat de pure opbouw testbaar is zonder de hele
 * rapportpagina te renderen (een `page.tsx` mag geen extra named exports dragen).
 *
 * Privacy-regel: elk **persoonlijk** EUR-bedrag loopt hier via de meegegeven
 * masked-aware `fc` (= `formatMaskedCurrency` uit `useFc()`), nooit via een
 * eigen `Intl.NumberFormat`. Wettelijke referentiebedragen zijn de enige
 * uitzondering — zie `formatStatutoryEur`.
 */

import type { VermogenAssetItem, VermogenDebtItem } from '@/lib/vermogen-report-data'

/** Masked-aware currency-formatter (`formatMaskedCurrency` gebonden aan de privacy-toggle). */
export type MaskedCurrencyFormatter = (value: number) => string

/**
 * Gebruikelijk-loon-minimum 2025 voor DGA's met een AB-belang in een
 * holding-BV (Wet IB 1964 art. 12a). Wordt in spec §7 open vraag 2 als
 * "ruling-loon-schatting" gevraagd op deelneming-items met
 * `subtype === 'holding_bv'`. Geen profile-veld nodig — minimum-vuistregel.
 */
export const GEBRUIKELIJK_LOON_MIN_2025 = 56_000

/**
 * Formatteer een **wettelijk referentiebedrag** in EUR.
 *
 * Bewust niet masked-aware: dit is een publiek wetsbedrag, geen persoonlijk
 * bedrag, en blijft dus ook met privacy-masking aan zichtbaar (analoog aan de
 * schijfgrens op het Persoonlijk plan). Voor álle persoonlijke bedragen geldt
 * de masked-aware `fc`.
 */
function formatStatutoryEur(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDateNL(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Bouw een korte detail-regel met de type-specifieke kenmerken van een
 * asset. Spec sectie 2.2 iv: type-specifieke regels in `text-[11px]
 * text-[var(--ink-3)]`.
 *
 * Returnt een array van losse details zodat de UI ze met `·` kan
 * scheiden — overslaan van lege velden is dan ook makkelijk.
 */
export function buildAssetDetailParts(
  item: VermogenAssetItem,
  fc: MaskedCurrencyFormatter,
): string[] {
  const parts: string[] = []
  if (item.wozValue != null && item.wozValue > 0) {
    parts.push(`WOZ ${fc(item.wozValue)}`)
  }
  if (item.addressLine) parts.push(item.addressLine)
  if (item.rentalIncomeYearly != null && item.rentalIncomeYearly > 0) {
    parts.push(`Verhuur ${fc(item.rentalIncomeYearly)}/jr`)
  }
  if (item.retirementProvider) {
    const labels: Record<string, string> = {
      bedrijfspensioenfonds: 'Bedrijfspensioenfonds',
      verzekeraar: 'Verzekeraar',
      ppi: 'PPI',
    }
    parts.push(labels[item.retirementProvider] ?? item.retirementProvider)
  }
  if (item.riskProfile) {
    const riskLabels: Record<string, string> = { laag: 'Laag risico', middel: 'Middel risico', hoog: 'Hoog risico' }
    parts.push(riskLabels[item.riskProfile] ?? item.riskProfile)
  }
  if (item.tickerSymbol) parts.push(item.tickerSymbol)
  if (item.institution) parts.push(item.institution)
  if (item.kvkNumber) parts.push(`KvK ${item.kvkNumber}`)
  if (item.ownershipPercentage != null) parts.push(`Belang ${item.ownershipPercentage}%`)
  if (item.annualDividend != null && item.annualDividend > 0) {
    parts.push(`Dividend ${fc(item.annualDividend)}/jr`)
  }
  // Ruling-loon-schatting voor holding-BV's (spec §7 open vraag 2,
  // aanbeveling: doe (a) en (b). Hier (a) — feitelijke registratie op
  // deelneming-item. Minimum gebruikelijk loon 2025 = €56.000 als
  // wettelijk referentiepunt; werkelijk loon kan hoger zijn afhankelijk
  // van vergelijkbaar dienstverband.
  if (item.subtype === 'holding_bv') {
    parts.push(`Gebruikelijk loon ≥ ${formatStatutoryEur(GEBRUIKELIJK_LOON_MIN_2025)}/jr (min. 2025)`)
  }
  if (item.depreciationRate != null && item.depreciationRate > 0) {
    parts.push(`Afschrijving ${item.depreciationRate}%/jr`)
  }
  if (item.expiryDate) parts.push(`Vervalt ${formatDateNL(item.expiryDate)}`)
  if (item.beneficiary) parts.push(`Begunstigde: ${item.beneficiary}`)
  if (item.linkedAssetName) parts.push(`Gekoppeld aan ${item.linkedAssetName}`)
  return parts
}

export function buildDebtDetailParts(item: VermogenDebtItem): string[] {
  const parts: string[] = []
  if (item.subtypeLabel) parts.push(item.subtypeLabel)
  if (item.fixedRateEndDate) parts.push(`Rente-vast tot ${formatDateNL(item.fixedRateEndDate)}`)
  if (item.isTaxDeductible === true) parts.push('Renteaftrek')
  if (item.draagkrachtmetingDate) parts.push(`Draagkrachtmeting ${formatDateNL(item.draagkrachtmetingDate)}`)
  if (item.taxYear) parts.push(`Belastingjaar ${item.taxYear}`)
  if (item.hasPaymentPlan) parts.push('Betalingsregeling')
  if (item.hasWrittenAgreement) parts.push('Schriftelijke overeenkomst')
  return parts
}
