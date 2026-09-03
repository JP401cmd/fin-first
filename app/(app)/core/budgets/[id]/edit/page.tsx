'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { budgetEditUrl } from '@/lib/navigation'

/**
 * Legacy-deeplink `/core/budgets/<id>/edit` → het bewerk-paneel op de canonieke
 * budgetpagina. Eén hop, om dezelfde reden als de detail-redirect hiernaast: de
 * tussenstap `/core/budgets?…` werd door de statische redirect in
 * `next.config.ts` naar de cashflow-hub getrokken, waar zowel `budget` als
 * `edit=true` verloren gingen (UAT WF-BUDGET-23).
 */
export default function BudgetEditRedirect() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    router.replace(budgetEditUrl(id))
  }, [id, router])

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
      <NavStackMeta title="Budget bewerken" topBar={{ kind: 'hidden' }} />
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
      </div>
    </div>
  )
}
