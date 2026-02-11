'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BudgetForm } from '@/components/app/budget-form'
import type { Budget } from '@/lib/budget-data'

export default function NewBudgetPage() {
  const [parentBudgets, setParentBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('budgets')
        .select('*')
        .is('parent_id', null)
        .order('sort_order')

      setParentBudgets((data as Budget[]) ?? [])
      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return <BudgetForm parentBudgets={parentBudgets} />
}
