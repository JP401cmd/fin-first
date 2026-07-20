'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles, ListChecks, MessageCircle } from 'lucide-react'
import { useChatContextOptional } from '@/components/app/chat/chat-provider'
import { ANALYSE_FINANCIEN_PROMPT } from '@/components/app/chat/chat-prompt-deeplink'

/**
 * TipsTeaser — compacte strip op /overzicht die naar de Tips & acties
 * pagina verwijst plus een snelle Fin-chat-ingang biedt.
 *
 * Drie tegels:
 *   - Toptips        → /overzicht/tips (lijst met pending recommendations)
 *   - Open acties    → /overzicht/tips (#acties anker voor scroll)
 *   - Vraag Fin     → opent de Fin-chat-overlay in-place (geen navigatie)
 */
interface TipsTeaserProps {
  pendingTipCount: number
  openActionCount: number
}

export function TipsTeaser({ pendingTipCount, openActionCount }: TipsTeaserProps) {
  const chat = useChatContextOptional()
  const items: {
    href: string | null
    onClick?: () => void
    Icon: typeof Sparkles
    label: string
    count: number | null
    sublabel: string
    /** Toont de navigatie-pijl. Uit voor de chat-CTA: die navigeert niet maar
     *  opent een overlay — een pijl zou misleidend "ga ergens heen" suggereren. */
    showArrow?: boolean
  }[] = [
    {
      href: '/overzicht/tips',
      Icon: Sparkles,
      label: 'Toptips',
      count: pendingTipCount,
      sublabel: pendingTipCount === 1 ? 'tip wacht' : 'tips wachten',
    },
    {
      href: '/overzicht/tips#acties',
      Icon: ListChecks,
      label: 'Open acties',
      count: openActionCount,
      sublabel: openActionCount === 1 ? 'op je lijst' : 'op je lijst',
    },
    {
      // Geen navigatie: opent de globale Fin-chat-overlay in-place met de
      // doorlicht-prompt. (Voorheen een Link naar /berichten — dat verliet de
      // pagina onnodig en daar staan de tips niet.)
      href: null,
      onClick: () => chat?.openWithMessage(ANALYSE_FINANCIEN_PROMPT),
      Icon: MessageCircle,
      label: 'Vraag Fin',
      count: null,
      sublabel: 'nieuwe analyse',
      showArrow: false,
    },
  ]

  return (
    <section aria-label="Tips & acties" className="mt-4 px-4 sm:px-6">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Wat zou je nu kunnen doen
          </div>
          <h2 className="mt-0.5 font-serif text-lg sm:text-xl text-[var(--ink)]">
            Tips en acties
          </h2>
        </div>
        <Link
          href="/overzicht/tips"
          className="inline-flex items-center gap-1 text-xs font-semibold text-wil-700 hover:text-wil-800"
        >
          Bekijk alles
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {items.map(({ href, onClick, Icon, label, count, sublabel, showArrow = true }) => {
          const tileClass =
            'group flex items-center gap-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-colors hover:border-wil-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-600'
          const inner = (
            <>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wil-50 text-wil-700">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  {count !== null && (
                    <span className="font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
                      {count}
                    </span>
                  )}
                  <span className={`text-sm font-medium text-[var(--ink-2)] ${count !== null ? '' : 'font-semibold'}`}>
                    {label}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--ink-3)] leading-snug">{sublabel}</p>
              </div>
              {showArrow && (
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5 group-hover:text-wil-700"
                  aria-hidden="true"
                />
              )}
            </>
          )
          return href ? (
            <Link key={label} href={href} className={tileClass}>
              {inner}
            </Link>
          ) : (
            <button key={label} type="button" onClick={onClick} className={`${tileClass} w-full text-left`}>
              {inner}
            </button>
          )
        })}
      </div>
    </section>
  )
}
