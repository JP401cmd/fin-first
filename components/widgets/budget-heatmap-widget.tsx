'use client'

import { memo, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { BudgetHeatmap, type HeatmapSection } from '@/components/app/budget-heatmap'
import { LayoutGrid } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const BudgetHeatmapWidget = memo(function BudgetHeatmapWidget({ size, data, href }: Props) {
  const router = useRouter()

  // Build HeatmapSection from DashboardData expense groups
  const sections: HeatmapSection[] = useMemo(() => {
    if (!data.heatmapExpenseGroups || data.heatmapExpenseGroups.length === 0) return []

    // Convert HeatmapBudgetGroup[] to BudgetWithChildren[] shape expected by BudgetHeatmap
    const groups = data.heatmapExpenseGroups.map(g => ({
      // Provide minimal Budget shape fields required by BudgetWithChildren
      id: g.id,
      user_id: '',
      parent_id: null,
      name: g.name,
      slug: null,
      icon: g.icon,
      description: null,
      default_limit: g.default_limit,
      budget_type: 'expense' as const,
      interval: 'monthly' as const,
      rollover_type: 'reset' as const,
      limit_type: 'soft' as const,
      alert_threshold: 80,
      max_single_transaction_amount: 0,
      is_essential: false,
      priority_score: 0,
      is_inflation_indexed: false,
      sort_order: 0,
      created_at: '',
      updated_at: '',
      ownership: 'personal' as const,
      household_id: null,
      goal_type: null,
      goal_amount: null,
      goal_date: null,
      goal_frequency: null,
      is_favorite: false,
      children: g.children.map(c => ({
        id: c.id,
        user_id: '',
        parent_id: g.id,
        name: c.name,
        slug: null,
        icon: c.icon,
        description: null,
        default_limit: c.default_limit,
        budget_type: 'expense' as const,
        interval: 'monthly' as const,
        rollover_type: 'reset' as const,
        limit_type: 'soft' as const,
        alert_threshold: 80,
        max_single_transaction_amount: 0,
        is_essential: false,
        priority_score: 0,
        is_inflation_indexed: false,
        sort_order: 0,
        created_at: '',
        updated_at: '',
        ownership: 'personal' as const,
        household_id: null,
        goal_type: null,
        goal_amount: null,
        goal_date: null,
        goal_frequency: null,
        is_favorite: false,
      })),
    }))

    return [{
      label: 'Uitgaven',
      budgetType: 'expense' as const,
      groups,
    }]
  }, [data.heatmapExpenseGroups])

  const handleNavigate = useCallback((budgetId: string) => {
    router.push(`/core/budgets/${budgetId}`)
  }, [router])

  if (sections.length === 0 || sections[0].groups.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Uitgaven Heatmap" href={href}>
        <WidgetEmpty icon={LayoutGrid} message="Maak uitgavenbudgetten aan om de heatmap te zien." />
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="kern" size={size} kicker="Uitgaven Heatmap" href={href}>
      <div className="h-full overflow-visible">
        <BudgetHeatmap
          sections={sections}
          spending={data.heatmapSpending ?? {}}
          onNavigate={handleNavigate}
          beschikbaarMap={data.heatmapBeschikbaarMap}
          size={size}
        />
      </div>
    </WidgetShell>
  )
})
