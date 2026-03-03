'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { CardModule } from '@/lib/briefing/types'

const MODULE_ACCENT: Record<string, string> = {
  kern: 'bg-kern-500',
  wil: 'bg-wil-500',
  horizon: 'bg-horizon-500',
  cross: 'bg-[var(--border-md)]',
}

interface BriefingCardProps {
  module?: CardModule
  href?: string
  onClick?: () => void
  children: ReactNode
  className?: string
  /** Animation delay in ms for stagger */
  delay?: number
}

export function BriefingCard({ module = 'cross', href, onClick, children, className = '', delay = 0 }: BriefingCardProps) {
  const accent = MODULE_ACCENT[module] ?? MODULE_ACCENT.cross
  const isInteractive = !!(href ?? onClick)

  const baseClasses = 'relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] transition-all'
  const interactiveClasses = isInteractive
    ? 'cursor-pointer hover:shadow-[var(--s1)] hover:-translate-y-px'
    : ''
  const animClasses = 'animate-fade-up opacity-0'

  const style = { animationDelay: `${delay}ms`, animationFillMode: 'forwards' as const }

  const content = (
    <>
      <div className={`h-[2px] w-full ${accent}`} />
      <div className="p-4">
        {children}
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={`block ${baseClasses} ${interactiveClasses} ${animClasses} ${className}`} style={style}>
        {content}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`text-left w-full ${baseClasses} ${interactiveClasses} ${animClasses} ${className}`} style={style}>
        {content}
      </button>
    )
  }

  return (
    <div className={`${baseClasses} ${animClasses} ${className}`} style={style}>
      {content}
    </div>
  )
}
