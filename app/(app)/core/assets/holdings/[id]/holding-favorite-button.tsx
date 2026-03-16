'use client'

import { useState, useCallback } from 'react'
import { Heart } from 'lucide-react'

interface HoldingFavoriteButtonProps {
  holdingId: string
  initialFavorite: boolean
}

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
      className={`rounded-lg p-1.5 transition-colors ${
        isFavorite ? 'text-red-500 hover:text-red-600' : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
      }`}
      title={isFavorite ? 'Verwijder uit favorieten' : 'Markeer als favoriet'}
      data-testid="holding-favorite-button"
    >
      <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
    </button>
  )
}
