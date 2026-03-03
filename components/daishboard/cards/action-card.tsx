'use client'

import { BriefingCard } from '../briefing-card'
import {
  Zap, Target, PiggyBank, ShoppingCart, Building2, Receipt,
  Compass, BarChart3, Lightbulb, ArrowRight,
} from 'lucide-react'
import type { ActionCardSpec } from '@/lib/briefing/types'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  zap: Zap, target: Target, 'piggy-bank': PiggyBank,
  'shopping-cart': ShoppingCart, building: Building2,
  receipt: Receipt, compass: Compass, 'bar-chart': BarChart3,
  lightbulb: Lightbulb,
}

interface Props {
  spec: ActionCardSpec
  delay: number
}

export function ActionCard({ spec, delay }: Props) {
  const Icon = ICON_MAP[spec.icon] ?? Zap

  return (
    <BriefingCard module={spec.module} href={spec.href} delay={delay}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]">
          <Icon className="h-4 w-4 text-[var(--ink-3)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="label-editorial text-[var(--ink-3)]">{spec.kicker}</p>
          <p className="text-sm font-semibold text-[var(--ink)] mt-0.5">{spec.title}</p>
          <p className="text-xs text-[var(--ink-3)] mt-1 line-clamp-2">{spec.description}</p>
        </div>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] mt-1" />
      </div>
    </BriefingCard>
  )
}
