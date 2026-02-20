'use client'

import { ArrowLeft, Printer } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function PrintToolbar() {
  const router = useRouter()

  return (
    <div data-print-hide className="mb-6 flex items-center justify-between">
      <button
        type="button"
        onClick={() => router.push('/rapportages')}
        className="flex items-center gap-2 font-inter text-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Terug naar rapportages
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
      >
        <Printer className="h-4 w-4" />
        Afdrukken als PDF
      </button>
    </div>
  )
}
