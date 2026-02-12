'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function BudgetEditRedirect() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/core/budgets?budget=${id}&edit=true`)
  }, [id, router])

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    </div>
  )
}
