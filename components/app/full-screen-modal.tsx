'use client'

import { type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { BottomSheet } from '@/components/app/bottom-sheet'

type FullScreenModalProps = {
  open: boolean
  onClose: () => void
  title: string
  href?: string
  children: ReactNode
}

export function FullScreenModal({ open, onClose, title, href, children }: FullScreenModalProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title} size="full">
      {/* Sub-header: "Open volledig" link — only when href provided */}
      {href && (
        <div className="border-b border-[var(--border-ed)] px-5 py-2.5">
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open volledig
          </Link>
        </div>
      )}

      {/* Content — BottomSheet already provides overflow-y-auto wrapper */}
      {children}
    </BottomSheet>
  )
}
