'use client'

import { useState, useCallback } from 'react'
import { Heart } from 'lucide-react'

interface HoldingFavoriteButtonProps {
  holdingId: string
  initialFavorite: boolean
}

/**
 * Favoriet-toggle voor één holding (aandeel/ETF/obligatie én crypto). Persisteert
 * via `PATCH /api/holdings/[id]` — die route is polymorf en resolvet zelf de juiste
 * typed-tabel (investment_holdings/crypto_holdings), dus dezelfde knop werkt voor
 * beide holding-typen. Een favoriet holding verschijnt als mini-widget op het
 * dashboard (loader injecteert een `holding_fav:`-pref); zo blijven favoriet- en
 * widgetweergave in sync.
 *
 * Semantiek: het hart-icoon volgt de vaste favoriet-kleur (rood), net als de
 * budget-favoriet in budgets-client — bewust géén module-accent (favoriet is een
 * semantisch signaal, geen module-identiteit).
 */
export function HoldingFavoriteButton({ holdingId, initialFavorite }: HoldingFavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(initialFavorite)
  const [saving, setSaving] = useState(false)

  const toggle = useCallback(async () => {
    const next = !isFavorite
    setIsFavorite(next) // optimistic
    setSaving(true)
    try {
      const res = await fetch(`/api/holdings/${holdingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: next }),
      })
      if (!res.ok) {
        setIsFavorite(!next) // revert on error
      }
    } catch {
      setIsFavorite(!next) // revert on error
    } finally {
      setSaving(false)
    }
  }, [isFavorite, holdingId])

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        isFavorite ? 'text-red-500 hover:text-red-600' : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
      }`}
      title={isFavorite ? 'Verwijder uit favorieten' : 'Markeer als favoriet'}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Verwijder uit favorieten' : 'Markeer als favoriet'}
      data-testid="holding-favorite-button"
    >
      <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
    </button>
  )
}
