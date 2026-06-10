'use client'

import Link from 'next/link'
import { BriefingCard } from '../briefing-card'
import { Check, Circle } from 'lucide-react'
import type { ChecklistCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: ChecklistCardSpec
}

export function ChecklistCard({ spec }: Props) {
  return (
    <BriefingCard module="wil">
      <p className="text-sm font-semibold text-[var(--ink)] mb-2">{spec.title}</p>
      <ul className="space-y-1.5">
        {spec.items.map((item, i) => {
          const content = (
            <li key={i} className="flex items-start gap-2 text-xs group/item">
              {item.done ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-positive mt-0.5" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] mt-0.5" />
              )}
              <span className={item.done ? 'text-[var(--ink-4)] line-through' : 'text-[var(--ink-2)] group-hover/item:text-[var(--ink)]'}>
                {item.label}
              </span>
            </li>
          )

          if (item.href && !item.done) {
            return (
              <Link key={i} href={item.href} className="block hover:bg-[var(--subtle)]/50 rounded -mx-1 px-1">
                {content}
              </Link>
            )
          }
          return content
        })}
      </ul>
    </BriefingCard>
  )
}
