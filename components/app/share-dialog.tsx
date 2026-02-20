'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Share2,
  Download,
  Link2,
  X,
  Check,
  MessageCircle,
  ExternalLink,
  Copy,
} from 'lucide-react'
import { useToast } from '@/components/app/toast-provider'

// ── Types ──────────────────────────────────────────────────────────

export type ShareContentType = 'freedom_card' | 'milestone' | 'achievement' | 'badge'

export interface ShareContent {
  /** The title shown in the share dialog / native share sheet */
  title: string
  /** The share text body */
  text: string
  /** Optional URL to share (e.g. app link) */
  url?: string
  /** Content type for analytics */
  contentType: ShareContentType
  /** Privacy level used (for analytics) */
  privacyLevel?: string
}

export interface ShareDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** The content to share */
  content: ShareContent
  /** Ref to the DOM element to capture as image (optional) */
  captureRef?: React.RefObject<HTMLElement | null>
  /** Optional canvas render function for reliable image generation (preferred over captureRef) */
  renderCanvas?: () => HTMLCanvasElement
  /** Additional class on the backdrop */
  className?: string
}

type ShareTargetType =
  | 'copy_link'
  | 'download_image'
  | 'web_share'
  | 'whatsapp'
  | 'twitter'
  | 'fallback_whatsapp'
  | 'fallback_twitter'

// ── Track share event ──────────────────────────────────────────────

async function trackShareEvent(
  shareType: ShareTargetType,
  contentType: ShareContentType,
  privacyLevel?: string,
) {
  try {
    await fetch('/api/share/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        share_type: shareType,
        content_type: contentType,
        privacy_level: privacyLevel || null,
      }),
    })
  } catch {
    // Silent fail — tracking is best-effort
  }
}

// ── Twitter/X icon (simplified) ────────────────────────────────────

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

// ── WhatsApp icon (simplified) ─────────────────────────────────────

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

// ── ShareDialog Component ──────────────────────────────────────────

export function ShareDialog({
  open,
  onClose,
  content,
  captureRef,
  renderCanvas,
  className,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [webShareSupported, setWebShareSupported] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

  // Check Web Share API support on mount
  useEffect(() => {
    setWebShareSupported(typeof navigator !== 'undefined' && !!navigator.share)
  }, [])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // ESC key handler
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Build share text
  const shareText = content.text
  const shareUrl = content.url || (typeof window !== 'undefined' ? window.location.origin : '')
  const fullShareText = shareUrl ? `${shareText}\n\n${shareUrl}` : shareText

  // ── Copy link to clipboard ─────────────────────────────────────
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullShareText)
      setCopied(true)
      toast.addToast({
        type: 'success',
        title: 'Gekopieerd!',
        message: 'Tekst naar klembord gekopieerd',
        icon: '📋',
      })
      trackShareEvent('copy_link', content.contentType, content.privacyLevel)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = fullShareText
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      toast.addToast({
        type: 'success',
        title: 'Gekopieerd!',
        message: 'Tekst naar klembord gekopieerd',
        icon: '📋',
      })
      trackShareEvent('copy_link', content.contentType, content.privacyLevel)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [fullShareText, content.contentType, content.privacyLevel, toast])

  // ── Download as image ──────────────────────────────────────────
  const handleDownloadImage = useCallback(async () => {
    setDownloading(true)
    try {
      // Prefer renderCanvas (programmatic canvas) over captureRef (SVG foreignObject)
      if (renderCanvas) {
        const canvas = renderCanvas()
        const link = document.createElement('a')
        const filePrefix = content.contentType === 'badge' ? 'trifinity-badge' : 'trifinity-vrijheidskaart'
        link.download = `${filePrefix}-${new Date().toISOString().split('T')[0]}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()

        toast.addToast({
          type: 'success',
          title: 'Gedownload!',
          message: 'Afbeelding opgeslagen',
          icon: '📥',
        })
        trackShareEvent('download_image', content.contentType, content.privacyLevel)
        return
      }

      const element = captureRef?.current
      if (!element) {
        toast.addToast({
          type: 'warning',
          title: 'Download niet beschikbaar',
          message: 'Geen kaart om te downloaden',
        })
        return
      }

      // Find the actual card element
      const cardEl = element.querySelector('#freedom-card') as HTMLElement || element

      // Create canvas with SVG foreignObject approach
      const canvas = document.createElement('canvas')
      const scale = 2 // 2x for retina
      canvas.width = cardEl.offsetWidth * scale
      canvas.height = cardEl.offsetHeight * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context niet beschikbaar')

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${cardEl.offsetWidth}" height="${cardEl.offsetHeight}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml">
              ${cardEl.outerHTML}
            </div>
          </foreignObject>
        </svg>
      `

      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          ctx.scale(scale, scale)
          ctx.drawImage(img, 0, 0)
          const link = document.createElement('a')
          link.download = `trifinity-vrijheidskaart-${new Date().toISOString().split('T')[0]}.png`
          link.href = canvas.toDataURL('image/png')
          link.click()
          resolve()
        }
        img.onerror = () => {
          // Fallback: download as HTML
          const blob = new Blob([cardEl.outerHTML], { type: 'text/html' })
          const link = document.createElement('a')
          link.download = `trifinity-vrijheidskaart-${new Date().toISOString().split('T')[0]}.html`
          link.href = URL.createObjectURL(blob)
          link.click()
          resolve()
        }
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

        // Timeout fallback
        setTimeout(() => reject(new Error('Timeout')), 5000)
      })

      toast.addToast({
        type: 'success',
        title: 'Gedownload!',
        message: 'Afbeelding opgeslagen',
        icon: '📥',
      })
      trackShareEvent('download_image', content.contentType, content.privacyLevel)
    } catch {
      toast.addToast({
        type: 'error',
        title: 'Download mislukt',
        message: 'Probeer het opnieuw',
      })
    } finally {
      setDownloading(false)
    }
  }, [renderCanvas, captureRef, content.contentType, content.privacyLevel, toast])

  // ── Native Web Share API ───────────────────────────────────────
  const handleWebShare = useCallback(async () => {
    if (!navigator.share) return

    try {
      await navigator.share({
        title: content.title,
        text: shareText,
        url: shareUrl,
      })
      trackShareEvent('web_share', content.contentType, content.privacyLevel)
      toast.addToast({
        type: 'success',
        title: 'Gedeeld!',
        message: 'Via je apparaat gedeeld',
        icon: '🎉',
      })
    } catch (err) {
      // User cancelled — not an error
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }, [content.title, content.contentType, content.privacyLevel, shareText, shareUrl, toast])

  // ── WhatsApp share ─────────────────────────────────────────────
  const handleWhatsApp = useCallback(() => {
    const encodedText = encodeURIComponent(fullShareText)
    const url = `https://wa.me/?text=${encodedText}`
    window.open(url, '_blank', 'noopener,noreferrer')

    const eventType: ShareTargetType = webShareSupported ? 'whatsapp' : 'fallback_whatsapp'
    trackShareEvent(eventType, content.contentType, content.privacyLevel)
    toast.addToast({
      type: 'info',
      title: 'WhatsApp geopend',
      message: 'Kies een contact om te delen',
      icon: '💬',
    })
  }, [fullShareText, webShareSupported, content.contentType, content.privacyLevel, toast])

  // ── Twitter/X share ────────────────────────────────────────────
  const handleTwitter = useCallback(() => {
    const encodedText = encodeURIComponent(shareText)
    const encodedUrl = shareUrl ? `&url=${encodeURIComponent(shareUrl)}` : ''
    const url = `https://twitter.com/intent/tweet?text=${encodedText}${encodedUrl}`
    window.open(url, '_blank', 'noopener,noreferrer,width=550,height=420')

    const eventType: ShareTargetType = webShareSupported ? 'twitter' : 'fallback_twitter'
    trackShareEvent(eventType, content.contentType, content.privacyLevel)
    toast.addToast({
      type: 'info',
      title: 'Twitter/X geopend',
      message: 'Tweet wordt voorbereid',
      icon: '🐦',
    })
  }, [shareText, shareUrl, webShareSupported, content.contentType, content.privacyLevel, toast])

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-end sm:items-center justify-center transition-[right] duration-300 ${className || ''}`}
      style={{ right: 'var(--chat-sidebar-width, 0px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Delen"
      data-testid="share-dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        data-testid="share-dialog-backdrop"
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-[var(--r-lg)] bg-[var(--paper)] p-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0"
        data-testid="share-dialog-panel"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-wil-600" />
            <h2 className="text-lg font-semibold text-[var(--ink)]">Delen</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)] transition-colors"
            aria-label="Sluiten"
            data-testid="share-dialog-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preview text */}
        <div className="mb-5 rounded-[var(--r-lg)] bg-[var(--subtle)] p-3 text-sm text-[var(--ink-2)] leading-relaxed" data-testid="share-preview-text">
          <p className="line-clamp-3">{shareText}</p>
          {shareUrl && (
            <p className="mt-1 text-xs text-wil-600 truncate">{shareUrl}</p>
          )}
        </div>

        {/* Share targets grid */}
        <div className="space-y-2" data-testid="share-targets">
          {/* Row 1: Native share (if supported) + Copy link */}
          <div className="grid grid-cols-2 gap-2">
            {webShareSupported ? (
              <button
                onClick={handleWebShare}
                className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-all hover:bg-[var(--subtle)] hover:border-[var(--border-md)] active:scale-[0.98]"
                data-testid="share-target-native"
              >
                <ExternalLink className="h-5 w-5 text-wil-500" />
                <span>Delen via...</span>
              </button>
            ) : (
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-all hover:bg-[var(--subtle)] hover:border-[var(--border-md)] active:scale-[0.98]"
                data-testid="share-target-copy-alt"
              >
                {copied ? (
                  <Check className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Copy className="h-5 w-5 text-[var(--ink-3)]" />
                )}
                <span>{copied ? 'Gekopieerd!' : 'Kopieer tekst'}</span>
              </button>
            )}

            <button
              onClick={handleCopyLink}
              className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-all hover:bg-[var(--subtle)] hover:border-[var(--border-md)] active:scale-[0.98]"
              data-testid="share-target-copy"
            >
              {copied ? (
                <Check className="h-5 w-5 text-emerald-500" />
              ) : (
                <Link2 className="h-5 w-5 text-blue-500" />
              )}
              <span>{copied ? 'Gekopieerd!' : 'Kopieer link'}</span>
            </button>
          </div>

          {/* Row 2: WhatsApp + Twitter/X */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleWhatsApp}
              className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-all hover:bg-emerald-50 hover:border-emerald-200 active:scale-[0.98]"
              data-testid="share-target-whatsapp"
            >
              <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handleTwitter}
              className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-all hover:bg-zinc-100 hover:border-[var(--border-md)] active:scale-[0.98]"
              data-testid="share-target-twitter"
            >
              <XIcon className="h-5 w-5 text-[var(--ink)]" />
              <span>Twitter/X</span>
            </button>
          </div>

          {/* Row 3: Download image (if captureRef or renderCanvas provided) */}
          {(captureRef || renderCanvas) && (
            <button
              onClick={handleDownloadImage}
              disabled={downloading}
              className="flex w-full items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-all hover:bg-[var(--subtle)] hover:border-[var(--border-md)] active:scale-[0.98] disabled:opacity-50"
              data-testid="share-target-download"
            >
              <Download className="h-5 w-5 text-horizon-500" />
              <span>{downloading ? 'Downloaden...' : 'Download als afbeelding'}</span>
            </button>
          )}
        </div>

        {/* Fallback notice when Web Share API is not available */}
        {!webShareSupported && (
          <p className="mt-4 text-center text-xs text-[var(--ink-3)]" data-testid="share-fallback-notice">
            Tip: Op mobiel kun je direct delen via je favoriete apps
          </p>
        )}

        {/* Drag handle for mobile sheet feel */}
        <div className="mt-4 flex justify-center sm:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-200" />
        </div>
      </div>
    </div>
  )
}

// ── Convenience hook for using ShareDialog ─────────────────────────

export function useShareDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [shareContent, setShareContent] = useState<ShareContent | null>(null)

  const openShareDialog = useCallback((content: ShareContent) => {
    setShareContent(content)
    setIsOpen(true)
  }, [])

  const closeShareDialog = useCallback(() => {
    setIsOpen(false)
    // Keep content for exit animation
    setTimeout(() => setShareContent(null), 300)
  }, [])

  return {
    isOpen,
    shareContent,
    openShareDialog,
    closeShareDialog,
  }
}
