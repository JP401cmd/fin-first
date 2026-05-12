'use client'

/**
 * Legacy-redirect — de uitgebreide BudgetForm-flow leeft sinds de UX-restyle
 * (zie plan: wil-je-de-pagina-zazzy-melody.md) als pane binnen
 * `/core/budgets?newBudget=true`. Deze route blijft bestaan voor backward-
 * compat met deeplinks/notificaties/bookmarks die nog naar `/core/budgets/new`
 * wijzen — gebruiker landt op de pane-flow zonder 404.
 *
 * Voor gebruikers die vanaf de cash-categorie-pagina komen wordt het pad
 * niet hersteld (we redirecten altijd naar `/core/budgets`); dat is bewust —
 * `/core/budgets/new` was nooit context-aware, en de embedded budgetteren-tab
 * heeft zijn eigen "+ Nieuw budget"-CTA in de planeditor-toolbar.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewBudgetRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/core/budgets?newBudget=true')
  }, [router])
  return null
}
