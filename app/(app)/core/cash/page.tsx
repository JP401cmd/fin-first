import { redirect } from 'next/navigation'

/**
 * `/core/cash` stuurt elke bezoeker (deeplinks, oude bookmarks, widget-links)
 * door naar `/overzicht/cashflow` — de canonieke cash-ingang in het nieuwe
 * cashflow-landingsblok. Er is nog maar één ingang voor alles wat met cash
 * te maken heeft.
 */
export default function CashAllPage() {
  redirect('/overzicht/cashflow')
}
