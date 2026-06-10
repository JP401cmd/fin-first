import Link from 'next/link'
import { BEHEER_GROUPS } from '@/lib/beheer-sections'

export default function BeheerPage() {
  return (
    <div className="space-y-10">
      {BEHEER_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`beheer-groep-${group.id}`}>
          <div className="border-b border-[var(--border-ed)] pb-2">
            <h2
              id={`beheer-groep-${group.id}`}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-2)]"
            >
              <span aria-hidden className={`mr-2.5 inline-block h-px w-7 align-middle ${group.stripeClass}`} />
              {group.label}
            </h2>
            <p className="mt-1.5 font-serif text-sm italic text-[var(--ink-3)]">{group.description}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tools.map((tool) => {
              const Icon = tool.icon
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-all duration-150 hover:-translate-y-px hover:border-[var(--border-md)] hover:shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-colors group-hover:text-[var(--ink-2)]"
                    />
                    <span className="text-sm font-medium text-[var(--ink)]">{tool.label}</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-3)]">{tool.description}</p>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
