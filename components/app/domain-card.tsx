import Link from 'next/link'

const colorClasses: Record<string, { bg: string; border: string; text: string; button: string }> = {
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-600',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
  teal: {
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-600',
    button: 'bg-teal-600 hover:bg-teal-700',
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-600',
    button: 'bg-purple-600 hover:bg-purple-700',
  },
}

export function DomainCard({
  title,
  subtitle,
  description,
  href,
  color,
  icon,
}: {
  title: string
  subtitle: string
  description: string
  href: string
  color: 'amber' | 'teal' | 'purple'
  icon: React.ReactNode
}) {
  const colors = colorClasses[color]

  return (
    <Link
      href={href}
      className={`group block rounded-2xl border ${colors.border} ${colors.bg} p-8 transition-all hover:shadow-lg`}
    >
      <div className="mb-4 flex justify-center">
        {icon}
      </div>
      <h2 className="text-2xl font-bold text-zinc-900">{title}</h2>
      <p className={`mt-1 text-sm font-medium ${colors.text}`}>{subtitle}</p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">{description}</p>
      <div className={`mt-6 inline-flex items-center gap-2 rounded-lg ${colors.button} px-4 py-2 text-sm font-medium text-white transition-colors`}>
        Bekijken
        <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </div>
    </Link>
  )
}
