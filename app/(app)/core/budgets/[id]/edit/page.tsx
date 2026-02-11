'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BudgetForm } from '@/components/app/budget-form'
import type { Budget } from '@/lib/budget-data'

export default function EditBudgetPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [budget, setBudget] = useState<Budget | null>(null)
  const [parentBudgets, setParentBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const [budgetRes, parentsRes] = await Promise.all([
        supabase.from('budgets').select('*').eq('id', id).single(),
        supabase
          .from('budgets')
          .select('*')
          .is('parent_id', null)
          .order('sort_order'),
      ])

      if (budgetRes.error || !budgetRes.data) {
        router.push('/core/budgets')
        return
      }

      setBudget(budgetRes.data as Budget)
      setParentBudgets((parentsRes.data as Budget[]) ?? [])
      setLoading(false)
    }

    load()
  }, [id, router])

  if (loading || !budget) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return <BudgetForm budget={budget} parentBudgets={parentBudgets} />
}
