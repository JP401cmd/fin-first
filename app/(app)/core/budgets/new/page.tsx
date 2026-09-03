'use client'

/**
 * Legacy-redirect — de uitgebreide BudgetForm-flow leeft sinds de UX-restyle
 * (zie plan: wil-je-de-pagina-zazzy-melody.md) als pane op de budgetpagina
 * (`?newBudget=true`). Deze route blijft bestaan voor backward-compat met
 * deeplinks/notificaties/bookmarks die nog naar `/core/budgets/new` wijzen —
 * gebruiker landt op de pane-flow zonder 404.
 *
 * Doel is het CANONIEKE pad (`newBudgetUrl()`), niet het legacy `/core/budgets`:
 * dat exacte pad wordt door de statische redirect in `next.config.ts` naar de
 * cashflow-hub gestuurd, die geen BudgetsClient rendert — de `?newBudget=true`
 * ging daar ongebruikt mee en er opende niets (UAT WF-BUDGET-23).
 *
 * Voor gebruikers die vanaf de cash-categorie-pagina komen wordt het pad
 * niet hersteld (we redirecten altijd naar de budgetpagina); dat is bewust —
 * `/core/budgets/new` was nooit context-aware, en de embedded budgetteren-tab
 * heeft zijn eigen "+ Nieuw budget"-CTA in de planeditor-toolbar.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { newBudgetUrl } from '@/lib/navigation'

export default function NewBudgetRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace(newBudgetUrl())
  }, [router])
  return null
}
