'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export default function BudgetEditRedirect() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/core/budgets?budget=${id}&edit=true`)
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
