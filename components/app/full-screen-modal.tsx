'use client'

import { useEffect, useCallback, type ReactNode } from 'react'
import { X, ExternalLink } from 'lucide-react'
import Link from 'next/link'

type FullScreenModalProps = {
  open: boolean
  onClose: () => void
  title: string
  href: string
  children: ReactNode
}

export function FullScreenModal({ open, onClose, title, href, children }: FullScreenModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdrop}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h3 className="font-semibold text-zinc-900">{title}</h3>
          <div className="flex items-center gap-2">
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open volledig
            </Link>
            <button
              onClick={onClose}
              className="touch-target rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
