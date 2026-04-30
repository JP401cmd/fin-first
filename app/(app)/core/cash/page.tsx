import { redirect } from 'next/navigation'

/**
 * `/core/cash` is gefuseerd met de cash-categorie-pagina. We sturen elke
 * bezoeker (deeplinks, oude bookmarks, widget-links) naar
 * `/core/assets/cash` zodat er één canonieke ingang is voor alles wat met
 * cash te maken heeft. De CashOverview blijft beschikbaar als embed binnen
 * de cash-categorie en als standalone op `/core/cash/[id]` voor detailweergave.
 */
export default function CashAllPage() {
  redirect('/core/assets/cash')
}
