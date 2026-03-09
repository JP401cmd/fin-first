import Link from 'next/link'
import { Shield, Telescope, ArrowRight } from 'lucide-react'

interface ModuleSideBarProps {
  module: 'kern' | 'horizon'
  label: string
  href: string
  side: 'left' | 'right'
}

const MODULE_CONFIG = {
  kern: {
    icon: Shield,
    accent: 'bg-kern-500',
    bg: 'bg-kern-50/40',
    hoverBg: 'hover:bg-kern-50',
    hoverBorder: 'hover:border-kern-200',
    text: 'text-kern-700',
    iconColor: 'text-kern-600',
    arrowColor: 'text-kern-400',
  },
  horizon: {
    icon: Telescope,
    accent: 'bg-horizon-500',
    bg: 'bg-horizon-50/40',
    hoverBg: 'hover:bg-horizon-50',
    hoverBorder: 'hover:border-horizon-200',
    text: 'text-horizon-700',
    iconColor: 'text-horizon-600',
    arrowColor: 'text-horizon-400',
  },
} as const

export function ModuleSideBar({ module, label, href, side }: ModuleSideBarProps) {
  const config = MODULE_CONFIG[module]
  const Icon = config.icon

  const rounded = side === 'left' ? 'rounded-l-[var(--r-lg)]' : 'rounded-r-[var(--r-lg)]'

  return (
    <Link
      href={href}
      className={`group hidden md:flex flex-col items-center justify-center w-14 shrink-0 self-stretch overflow-hidden border border-[var(--border-ed)] ${config.bg} ${config.hoverBg} ${config.hoverBorder} ${rounded} shadow-[var(--s0)] hover:shadow-[var(--s1)] transition-all no-underline`}
    >
      {/* Top accent bar — same as widget */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${config.accent}`} />

      <Icon className={`h-4 w-4 ${config.iconColor} mb-2`} />
      <p className={`font-display text-[10px] font-semibold tracking-wide ${config.text} [writing-mode:vertical-rl] rotate-180`}>
        {label}
      </p>
      <ArrowRight className={`mt-2 h-3 w-3 ${config.arrowColor} opacity-0 group-hover:opacity-100 transition-opacity`} />
    </Link>
  )
}
