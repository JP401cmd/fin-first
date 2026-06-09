/**
 * Compacte netto-vermogen-notatie voor de sidebar-module-rij.
 *
 * Geëxtraheerd uit `components/app/shell/sidebar.tsx` zodat de masking-regel
 * (privacy-toggle) als pure functie testbaar is zonder de hele shell te
 * renderen. De sidebar toont het netto vermogen als "€ 142k" / "€ 1,2M";
 * geen decimals op de duizend-notatie zodat de mono-strip rechts compact blijft.
 *
 * Privacy: wanneer `masked` true is, geeft de functie de bullet-placeholder
 * terug i.p.v. een bedrag — net als `formatMaskedCurrency` voor volledige
 * euro-strings. Zo honoreert ook dit saldo de "Bedragen verbergen"-toggle.
 */
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

export function formatNetWorthShort(value: number, masked = false): string {
  if (masked) return MASKED_AMOUNT_PLACEHOLDER

  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    const m = value / 1_000_000
    const rounded = Math.round(m * 10) / 10
    return `€ ${rounded.toString().replace('.', ',')}M`
  }
  if (abs >= 1_000) {
    return `€ ${Math.round(value / 1_000)}k`
  }
  return `€ ${Math.round(value)}`
}
