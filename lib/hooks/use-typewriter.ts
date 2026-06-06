'use client'

import { useEffect, useRef, useState } from 'react'

const DEFAULT_CPS = 28
const PUNCT_EXTRA_MS = 90
const PUNCT = '.,—!?:;'

/**
 * Onthult `text` teken-voor-teken (typemachine). Respecteert
 * `prefers-reduced-motion` (tekst meteen volledig). Typt één keer; reset
 * wanneer `text` of `start` wijzigt. Leestekens krijgen een korte extra pauze.
 *
 * @param opts.cps tekens per seconde (default 28)
 * @param opts.start begin pas met typen wanneer true (default true)
 */
export function useTypewriter(
  text: string,
  opts: { cps?: number; start?: boolean } = {},
): { shown: string; done: boolean } {
  const { cps = DEFAULT_CPS, start = true } = opts
  const msPerChar = 1000 / cps
  const [count, setCount] = useState(0)
  const [done, setDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCount(0)
    setDone(false)
    if (!start) return

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced || text.length === 0) {
      setCount(text.length)
      setDone(true)
      return
    }

    let i = 0
    const step = () => {
      i += 1
      setCount(i)
      if (i >= text.length) {
        setDone(true)
        return
      }
      const prev = text[i - 1]
      const delay = msPerChar + (PUNCT.includes(prev) ? PUNCT_EXTRA_MS : 0)
      timerRef.current = setTimeout(step, delay)
    }
    timerRef.current = setTimeout(step, msPerChar)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [text, start, msPerChar])

  return { shown: text.slice(0, count), done }
}
