'use client'

import { useEffect, useCallback, type ReactNode } from 'react'
import { X } from 'lucide-react'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center"
      onClick={handleBackdrop}
    >
      <div className="w-full max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl md:mx-4 md:max-w-lg md:rounded-2xl safe-bottom">
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 md:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-300" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <h3 className="font-semibold text-zinc-900">{title}</h3>
            <button
              onClick={onClose}
              className="touch-target rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
