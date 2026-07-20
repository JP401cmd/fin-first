import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency } from './formatter'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'

/** Toon maximaal dit aantal grootste posten per categorie. */
const TOP_N = 5

/**
 * Bouw de "== ABONNEMENTEN & VASTE LASTEN ==" context-sectie voor Fin.
 *
 * Hergebruikt EXACT dezelfde detectie als de Vaste-lasten-pagina en de
 * cashflow-landingskaart (loadVasteLastenSummary): confirmed
 * recurring_transactions + auto-detectie over 12 maanden. Zo ziet Fin
 * terugkerende uitgaven als een aparte hefboom — abonnementen stapelen
 * ongemerkt op, vaste lasten zijn vaak heronderhandelbaar — i.p.v. ze alleen
 * verspreid over budgetcategorieën te zien.
 *
 * Faalt zacht: één try/catch → '' (nooit een throw richting de context-builder).
 * Geen terugkerende lasten → lege string (geen kale sectie-header).
 */
export async function buildSubscriptionsContext(supabase: SupabaseClient): Promise<string> {
  try {
    const summary = await loadVasteLastenSummary(supabase)
    if (summary.count === 0) return ''

    const lines: string[] = []

    if (summary.totalMonthlySubscriptions > 0) {
      lines.push(
        `Abonnementen: ${summary.subscriptions.length} stuks, samen ${formatCurrency(summary.totalMonthlySubscriptions)}/mnd (${formatCurrency(summary.totalMonthlySubscriptions * 12)}/jaar)`,
      )
      const topSubs = [...summary.subscriptions]
        .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
        .slice(0, TOP_N)
        .map((s) => `  - ${s.name}: ${formatCurrency(s.monthlyAmount)}/mnd`)
      lines.push(...topSubs)
    }

    if (summary.totalMonthlyVasteKosten > 0) {
      lines.push(
        `Vaste lasten: ${summary.vasteKosten.length} stuks, samen ${formatCurrency(summary.totalMonthlyVasteKosten)}/mnd (${formatCurrency(summary.totalMonthlyVasteKosten * 12)}/jaar)`,
      )
      const topVK = [...summary.vasteKosten]
        .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
        .slice(0, TOP_N)
        .map((v) => `  - ${v.name}: ${formatCurrency(v.monthlyAmount)}/mnd`)
      lines.push(...topVK)
    }

    lines.push('')
    lines.push(
      'Abonnementen stapelen ongemerkt op — opzeggen of bundelen levert direct vrijheidsdagen op. ' +
        'Vaste lasten (energie, verzekeringen, telecom) zijn vaak heronderhandelbaar.',
    )

    return section('ABONNEMENTEN & VASTE LASTEN', lines.join('\n'))
  } catch {
    // Faal-zacht: nooit een throw richting de context-builder.
    return ''
  }
}
