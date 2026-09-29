'use client'

import type { ReactNode, Ref } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Ingeklapt blok onderaan een bewerkformulier (schulden, bezittingen).
 *
 * Dicht toont het naast de titel een samenvatting van wat erin staat. Dat is
 * geen versiering: het blok "Hoe telt dit mee" bevat instellingen die elk getal
 * in de app veranderen, en die mogen niet onzichtbaar worden omdat het blok
 * dicht staat.
 */
export function FormInklapblok({
  titel,
  samenvatting,
  children,
  ref,
  'data-testid': testId,
}: {
  titel: string
  /** Eén regel over de huidige stand; `null` of leeg toont niets. */
  samenvatting?: string | null
  children: ReactNode
  ref?: Ref<HTMLDetailsElement>
  'data-testid'?: string
}) {
  return (
    // Benoemde groepen (`group/inklap`, `group/kop`): een kale `group` zou elke
    // `group-hover:`/`group-open:` van een kindcomponent aan dit blok koppelen.
    <details ref={ref} className="group/inklap border-t border-[var(--border-ed)] pt-2" data-testid={testId}>
      <summary className="group/kop flex min-h-[44px] cursor-pointer list-none flex-col justify-center gap-0.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)] group-hover/kop:text-[var(--ink)]">
          {titel}
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/inklap:rotate-180" aria-hidden="true" />
        </span>
        {samenvatting ? (
          <span className="text-xs text-[var(--ink-2)] group-open/inklap:hidden" data-samenvatting>
            {samenvatting}
          </span>
        ) : null}
      </summary>
      <div className="mt-2 space-y-3">{children}</div>
    </details>
  )
}

/**
 * Voegt de ingevulde delen samen tot één samenvattingsregel, of `null`.
 * Lever de delen in kleine letters aan; alleen de eerste letter van de regel
 * wordt een hoofdletter, welk deel er ook vooraan staat.
 */
export function samenvattingVan(delen: ReadonlyArray<string | null | false | undefined>): string | null {
  const gevuld = delen.filter((d): d is string => typeof d === 'string' && d.length > 0)
  if (gevuld.length === 0) return null
  const regel = gevuld.join(' · ')
  return regel.charAt(0).toUpperCase() + regel.slice(1)
}
