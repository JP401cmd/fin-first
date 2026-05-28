'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Insight-card visibility — gedeelde localStorage-backed state voor de
 * minimaliseer-knop op iedere Insight Card (CompoundInsightCard,
 * FeeImpactCard, InflationImpactCard) en de matched
 * InsightToggleButton naast PageInfoButton.
 *
 * Gebruiker minimaliseert een card → id komt in de hidden-set →
 * InsightToggleButton verschijnt naast 'i' om de set leeg te maken.
 *
 * State is per-browser (geen server-sync nodig): keuze "ik wil dit nu
 * even niet zien" leeft op het apparaat zelf.
 */

const STORAGE_KEY = 'tf-insight-hidden'
const EVENT = 'tf-insight-hidden-change'

function readStored(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function writeStored(next: Set<string>): void {
  if (typeof window === 'undefined') return
  const arr = Array.from(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
  } catch {
    /* quota of disabled storage — stille fallback, state blijft in-memory */
  }
  window.dispatchEvent(new CustomEvent<string[]>(EVENT, { detail: arr }))
}

function useHiddenSet(): Set<string> {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setHidden(readStored())
    const onChange = () => setHidden(readStored())
    window.addEventListener(EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  return hidden
}

/**
 * Per-card visibility — gebruikt door iedere Insight Card zelf.
 * `visible=false` → card returnt null. `hide()` minimaliseert.
 */
export function useInsightVisibility(id: string): {
  visible: boolean
  hide: () => void
} {
  const hidden = useHiddenSet()
  const hide = useCallback(() => {
    const next = new Set(readStored())
    next.add(id)
    writeStored(next)
  }, [id])
  return { visible: !hidden.has(id), hide }
}

/**
 * Aggregate-state voor de InsightToggleButton — telt hoeveel van de
 * meegegeven ids momenteel verborgen zijn en biedt een restore-all.
 * Voor SSR-safety blijft `mounted=false` totdat het effect heeft
 * gedraaid, zodat server- en eerste-client-render identiek zijn.
 */
export function useHiddenInsights(ids: string[]): {
  mounted: boolean
  hiddenCount: number
  restoreAll: () => void
} {
  const hidden = useHiddenSet()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const hiddenCount = mounted ? ids.filter((id) => hidden.has(id)).length : 0
  const restoreAll = useCallback(() => {
    const next = new Set(readStored())
    for (const id of ids) next.delete(id)
    writeStored(next)
  }, [ids])

  return { mounted, hiddenCount, restoreAll }
}
