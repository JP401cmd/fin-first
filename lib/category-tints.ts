/**
 * Category-card tint config — user-instelbare kleuren voor de twee zones
 * boven/onder de breuklijn op de Kern-categoriekaarten.
 *
 * Persisted via localStorage (zelfde patroon als `PALETTE_STORAGE_KEY` in
 * `module-color-provider.tsx`). Geen DB-roundtrip nodig: dit is puur
 * weergave-voorkeur. Default-set is identiek aan de hardcoded kleuren in
 * `category-card.tsx` voor de overgangsperiode.
 */
'use client'

import { useEffect, useState } from 'react'

export interface CategoryTintConfig {
  /** Bezittingen — bovenzone (boven de breuklijn). Default: lichtgroen. */
  assetAbove: string
  /** Bezittingen — onderzone (onder de breuklijn). Default: donkergroen. */
  assetBelow: string
  /** Schulden — bovenzone. Default: amber. */
  debtAbove: string
  /** Schulden — onderzone. Default: amber (zelfde basis, sterker percent). */
  debtBelow: string
}

export const DEFAULT_CATEGORY_TINTS: CategoryTintConfig = {
  assetAbove: '#4ade80',
  assetBelow: '#14532d',
  debtAbove: '#b45309',
  debtBelow: '#b45309',
}

export interface CategoryTintPercents {
  assetAbove: number
  assetBelow: number
  debtAbove: number
  debtBelow: number
}

/** Default-percentages per zone. User kan deze overschrijven via instellingen. */
export const DEFAULT_CATEGORY_TINT_PERCENTS: CategoryTintPercents = {
  assetAbove: 1,
  assetBelow: 4,
  debtAbove: 1,
  debtBelow: 6,
}

/**
 * @deprecated Gebruik `useCategoryTints()` of `useCategoryTintPercents()`.
 * Behouden voor SSR-pad waar geen hook beschikbaar is — retourneert altijd
 * de defaults zodat bestaande imports niet breken.
 */
export const CATEGORY_TINT_PERCENTS: CategoryTintPercents = DEFAULT_CATEGORY_TINT_PERCENTS

const STORAGE_KEY = 'tf-category-tints'
const PERCENT_STORAGE_KEY = 'tf-category-tint-percents'

function readStored(): CategoryTintConfig {
  if (typeof window === 'undefined') return DEFAULT_CATEGORY_TINTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CATEGORY_TINTS
    const parsed = JSON.parse(raw) as Partial<CategoryTintConfig>
    return { ...DEFAULT_CATEGORY_TINTS, ...parsed }
  } catch {
    return DEFAULT_CATEGORY_TINTS
  }
}

function readStoredPercents(): CategoryTintPercents {
  if (typeof window === 'undefined') return DEFAULT_CATEGORY_TINT_PERCENTS
  try {
    const raw = localStorage.getItem(PERCENT_STORAGE_KEY)
    if (!raw) return DEFAULT_CATEGORY_TINT_PERCENTS
    const parsed = JSON.parse(raw) as Partial<CategoryTintPercents>
    return { ...DEFAULT_CATEGORY_TINT_PERCENTS, ...parsed }
  } catch {
    return DEFAULT_CATEGORY_TINT_PERCENTS
  }
}

const EVENT = 'tf-category-tints-changed'
const PERCENT_EVENT = 'tf-category-tint-percents-changed'

export function writeCategoryTints(config: CategoryTintConfig) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    window.dispatchEvent(new CustomEvent<CategoryTintConfig>(EVENT, { detail: config }))
  } catch {
    /* private mode / quota */
  }
}

export function writeCategoryTintPercents(percents: CategoryTintPercents) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PERCENT_STORAGE_KEY, JSON.stringify(percents))
    window.dispatchEvent(new CustomEvent<CategoryTintPercents>(PERCENT_EVENT, { detail: percents }))
  } catch {
    /* private mode / quota */
  }
}

/**
 * React-hook die de huidige tint-config uit localStorage leest en realtime
 * herrendert wanneer een ander component (bv. de instellingenpagina) de
 * config schrijft via `writeCategoryTints()`. Tijdens SSR retourneert de
 * hook de defaults — de eerste paint matcht dus de defaults; na hydratie
 * vervangt React door de stored values.
 */
export function useCategoryTints(): [CategoryTintConfig, (next: CategoryTintConfig) => void] {
  const [config, setConfig] = useState<CategoryTintConfig>(DEFAULT_CATEGORY_TINTS)

  useEffect(() => {
    setConfig(readStored())
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<CategoryTintConfig>
      if (ce.detail) setConfig(ce.detail)
      else setConfig(readStored())
    }
    window.addEventListener(EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const update = (next: CategoryTintConfig) => {
    setConfig(next)
    writeCategoryTints(next)
  }

  return [config, update]
}

/**
 * Percentage-variant van `useCategoryTints` — leest de tint-intensiteit per
 * zone uit localStorage en herrendert wanneer de instelling muteert. Bij
 * onbekende key valt elk slot terug op de default.
 */
export function useCategoryTintPercents(): [CategoryTintPercents, (next: CategoryTintPercents) => void] {
  const [percents, setPercents] = useState<CategoryTintPercents>(DEFAULT_CATEGORY_TINT_PERCENTS)

  useEffect(() => {
    setPercents(readStoredPercents())
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<CategoryTintPercents>
      if (ce.detail) setPercents(ce.detail)
      else setPercents(readStoredPercents())
    }
    window.addEventListener(PERCENT_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(PERCENT_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const update = (next: CategoryTintPercents) => {
    setPercents(next)
    writeCategoryTintPercents(next)
  }

  return [percents, update]
}
