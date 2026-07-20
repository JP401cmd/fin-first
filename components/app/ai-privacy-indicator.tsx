'use client'

import { useState, useRef, useEffect } from 'react'
import { ShieldCheck } from 'lucide-react'
import { usePrivacyMode } from './use-privacy-mode'

interface Props {
  /** Extra classes for the wrapper span */
  className?: string
  /** Icon size in pixels (default 14) */
  size?: number
  /**
   * Privé-modus expliciet meegeven. Weglaten → de indicator leest de waarde zelf
   * (via `usePrivacyMode`) zodat élk call-site automatisch eerlijk wordt zonder
   * de prop door te geven.
   */
  localMode?: boolean
}

/* Copy per modus — de kern van de eerlijkheids-fix (#883): in privé-modus
   draait de AI lokaal, dus "geanonimiseerd verstuurd" is onjuist. */
const CLOUD_LABEL = 'Deze functie gebruikt AI — je data wordt geanonimiseerd verstuurd.'
const LOCAL_LABEL = 'Deze functie draait lokaal op je toestel — je gegevens verlaten je toestel niet.'

/**
 * Subtle privacy indicator shown next to AI-powered features.
 * Displays a ShieldCheck icon with a tooltip on hover/tap. De tekst is
 * privé-modus-bewust: lokaal-draaiend in privé-modus, anders geanonimiseerd
 * naar de cloud.
 */
export function AiPrivacyIndicator({ className = '', size = 14, localMode }: Props) {
  const [show, setShow] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  // Expliciete prop wint; anders zelf lezen. `null` (nog aan het laden) telt als
  // cloud — de default-copy, zodat er nooit een lege/knipperende tekst staat.
  const readMode = usePrivacyMode()
  const isLocal = localMode ?? readMode === true
  const label = isLocal ? LOCAL_LABEL : CLOUD_LABEL

  /* Auto-dismiss on outside tap (mobile) */
  useEffect(() => {
    if (!show) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [show])

  /* Clean up timeout on unmount */
  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => {
        if (timeout.current) clearTimeout(timeout.current)
        setShow(true)
      }}
      onMouseLeave={() => {
        timeout.current = setTimeout(() => setShow(false), 200)
      }}
      onClick={(e) => {
        e.stopPropagation()
        setShow(prev => !prev)
      }}
      role="img"
      aria-label={label}
    >
      <ShieldCheck
        className="text-[var(--ink-4)] transition-colors hover:text-[var(--ink-3)]"
        style={{ width: size, height: size }}
        strokeWidth={1.75}
      />

      {/* Tooltip */}
      {show && (
        <span
          className="absolute bottom-full left-1/2 z-[100] mb-2 -translate-x-1/2 whitespace-nowrap rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-inter text-[var(--ink-2)] shadow-[var(--s1)]"
          role="tooltip"
        >
          {label}
          {/* Arrow */}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--paper)]" />
        </span>
      )}
    </span>
  )
}
