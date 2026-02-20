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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-[right] duration-300"
      style={{ right: 'var(--chat-sidebar-width, 0px)' }}
      onClick={handleBackdrop}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[var(--r-lg)] bg-[var(--paper)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-5 py-4">
          <h3 className="font-semibold text-[var(--ink)]">{title}</h3>
          <div className="flex items-center gap-2">
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open volledig
            </Link>
            <button
              onClick={onClose}
              className="touch-target rounded-md text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
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
