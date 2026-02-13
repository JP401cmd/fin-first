'use client'

import { useMemo } from 'react'
import { SankeyDiagram, type SankeyNode, type SankeyLink } from '@/components/app/sankey-diagram'
import { formatCurrency } from '@/components/app/budget-shared'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'

interface BudgetSankeyProps {
  groups: BudgetWithChildren[]
  spending: Record<string, number>
  getEffectiveLimit: (budget: Budget) => number
  getParentEffectiveLimit: (parent: BudgetWithChildren) => number
  getSpent: (budget: Budget) => number
  getParentSpent: (parent: BudgetWithChildren) => number
  onNavigate: (budgetId: string) => void
}

// Same color palettes as the Cash-page Sankey
const incomeColors = ['#4a8c6f', '#5a9e7a', '#6aae88', '#7dbd98']
const expenseColors = ['#D4A843', '#ddb85a', '#e6c872', '#efd88a']
const savingsColors = ['#8B5CB8', '#9e74c6', '#b18cd4', '#c4a4e2']
const debtColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca']

function colorForType(type: string, idx: number): string {
  if (type === 'income') return incomeColors[idx % incomeColors.length]
  if (type === 'savings') return savingsColors[idx % savingsColors.length]
  if (type === 'debt') return debtColors[idx % debtColors.length]
  return expenseColors[idx % expenseColors.length]
}

function label(spent: number, limit: number): string {
  return `${formatCurrency(spent)} / ${formatCurrency(limit)}`
}

export function BudgetSankey({
  groups,
  spending,
  getEffectiveLimit,
  getParentEffectiveLimit,
  getSpent,
  getParentSpent,
  onNavigate,
}: BudgetSankeyProps) {
  const incomeGroups = groups.filter((g) => g.budget_type === 'income')
  const expenseGroups = groups.filter((g) => g.budget_type === 'expense')
  const savingsGroups = groups.filter((g) => g.budget_type === 'savings')
  const debtGroups = groups.filter((g) => g.budget_type === 'debt')

  const { nodes, links } = useMemo(() => {
    const nodes: SankeyNode[] = []
    const links: SankeyLink[] = []

    // ── Column 0: income children ──
    let incIdx = 0
    for (const parent of incomeGroups) {
      const children = parent.children.length > 0 ? parent.children : [parent as Budget]
      for (const child of children) {
        const limit = getEffectiveLimit(child)
        if (limit <= 0) continue
        const spent = getSpent(child)
        nodes.push({
          id: `inc-${child.id}`,
          label: child.name,
          value: limit,
          color: colorForType('income', incIdx),
          column: 0,
          spent,
          overspent: spent > limit,
          secondaryLabel: label(spent, limit),
        })
        incIdx++
      }
    }

    // ── Column 1: expense/savings parents ──
    const middleGroups = [...expenseGroups, ...savingsGroups, ...debtGroups]
    let midIdx = 0
    for (const parent of middleGroups) {
      const limit = getParentEffectiveLimit(parent)
      if (limit <= 0) continue
      const spent = getParentSpent(parent)
      const type = parent.budget_type ?? 'expense'
      nodes.push({
        id: `grp-${parent.id}`,
        label: parent.name,
        value: limit,
        color: colorForType(type, midIdx),
        column: 1,
        spent,
        overspent: spent > limit,
        secondaryLabel: label(spent, limit),
      })
      midIdx++
    }

    // ── Column 2: expense/savings children ──
    let subIdx = 0
    for (const parent of middleGroups) {
      if (parent.children.length === 0) continue
      const type = parent.budget_type ?? 'expense'
      for (const child of parent.children) {
        const limit = getEffectiveLimit(child)
        if (limit <= 0) continue
        const spent = getSpent(child)
        nodes.push({
          id: `sub-${child.id}`,
          label: child.name,
          value: limit,
          color: colorForType(type, subIdx),
          column: 2,
          spent,
          overspent: spent > limit,
          secondaryLabel: label(spent, limit),
        })
        subIdx++
      }
    }

    // ── Links: col 0 → col 1 (proportional distribution) ──
    const totalIncomeLimit = nodes
      .filter((n) => n.column === 0)
      .reduce((s, n) => s + n.value, 0)

    const groupNodes = nodes.filter((n) => n.column === 1)

    if (totalIncomeLimit > 0 && groupNodes.length > 0) {
      const incNodes = nodes.filter((n) => n.column === 0)
      for (const inc of incNodes) {
        for (const grp of groupNodes) {
          const linkValue = (inc.value / totalIncomeLimit) * grp.value
          if (linkValue > 0) {
            links.push({
              source: inc.id,
              target: grp.id,
              value: linkValue,
              color: inc.color,
            })
          }
        }
      }
    }

    // ── Links: col 1 → col 2 (direct per child) ──
    for (const parent of middleGroups) {
      if (parent.children.length === 0) continue
      const grpId = `grp-${parent.id}`
      if (!nodes.find((n) => n.id === grpId)) continue

      for (const child of parent.children) {
        const subId = `sub-${child.id}`
        const subNode = nodes.find((n) => n.id === subId)
        if (!subNode) continue
        links.push({
          source: grpId,
          target: subId,
          value: subNode.value,
          color: subNode.color,
        })
      }
    }

    return { nodes, links }
  }, [incomeGroups, expenseGroups, savingsGroups, debtGroups, getEffectiveLimit, getParentEffectiveLimit, getSpent, getParentSpent])

  function handleNodeClick(nodeId: string) {
    const match = nodeId.match(/^(?:sub|grp|inc)-(.+)$/)
    if (match) onNavigate(match[1])
  }

  if (nodes.length === 0) return null

  return (
    <div className="mt-4">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <SankeyDiagram
          nodes={nodes}
          links={links}
          showAnimatedCoins={false}
          onNodeClick={handleNodeClick}
        />
      </div>
    </div>
  )
}
