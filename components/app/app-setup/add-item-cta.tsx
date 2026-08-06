'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'

/**
 * "Voeg … toe"-knop onder de item-selector van een app-setup. Eén gedeelde
 * variant zodat de drie setup-schermen (crypto, aandelen, hypotheekplanner)
 * exact dezelfde affordance dragen. Zonder expliciete `href` valt hij terug
 * op het huidige pad zonder query — de items-tab van de categorie-pagina,
 * waar de toevoeg-flow leeft.
 */
export function AddItemCta({ label, href }: { label: string; href?: string }) {
  const pathname = usePathname()
  return (
    <Link
      href={href ?? pathname ?? '.'}
      className="inline-flex min-h-11 items-center gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
