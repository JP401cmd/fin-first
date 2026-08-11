'use client'

/**
 * "Deel je uitkomst" — de deelfunctie van het Vrijheidsrapport (ADR 0067).
 *
 * Dit component krijgt als prop UITSLUITEND `ShareFreedom` ({ years, months }).
 * Het rapport, de intake en elk bedrag zitten niet in de signatuur, dus ze
 * kunnen ook niet per ongeluk in het gedeelde beeld of de gedeelde tekst
 * belanden. De reductie gebeurt één keer, server-side, in `selectShareFreedom`.
 *
 * Wat er gedeeld wordt:
 *  - een beeld (1200×630, client-side op canvas getekend — niets opgeslagen);
 *  - een tekst met alleen de vrijheidstijd;
 *  - een link naar `/check` zónder parameters, zodat de ontvanger de check zelf
 *    doet. Er wordt niets bewaard en er is dus ook geen herbezoekbare uitkomst.
 *
 * De dialoog zit op `z-index: 90` — dezelfde laag als de share-dialog van de
 * ingelogde app — en dus boven de meelopende CTA-balk (`z-index: 70`). Hij wordt
 * bewust GEPORTALD naar `.rapport-root`: de knop staat in `.report-actions`, en
 * dat blok maakt met `position:absolute; z-index:40` een eigen stacking context.
 * Een kind daarvan met z-index 90 zou nog steeds op laag 40 landen en dus ónder
 * de CTA-balk verdwijnen. Portalen naar de rapport-root (position:relative,
 * z-index auto → géén eigen stacking context) zet de dialoog in dezelfde context
 * als de CTA-balk, waar 90 > 70 wél telt.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  buildFreedomCardCopy,
  buildFreedomShareText,
  FREEDOM_CARD_FILENAME,
  type ShareFreedom,
} from '@/lib/check/share-freedom'
import {
  drawFreedomCard,
  readFreedomCardStyle,
  FREEDOM_CARD_HEIGHT,
  FREEDOM_CARD_WIDTH,
} from './freedom-card-canvas'

const TITLE_ID = 'deel-uitkomst-titel'

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    } catch {
      resolve(null)
    }
  })
}

export function ShareButton({ freedom }: { freedom: ShareFreedom }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [portalHost, setPortalHost] = useState<Element | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)

  // Portaal-doel pas na mount bepalen (geen document tijdens SSR).
  useEffect(() => {
    setPortalHost(openerRef.current?.closest('.rapport-root') ?? document.body)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setStatus('')
    openerRef.current?.focus()
  }, [])

  // Teken de kaart zodra de dialoog open is — en nog eens wanneer de webfonts
  // binnen zijn, anders staat de eerste render in een fallback-serif.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    const paint = () => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const style = readFreedomCardStyle(canvas.closest('.rapport-root'))
      const copy = buildFreedomCardCopy(freedom, window.location.host)
      drawFreedomCard(ctx, copy, style)
    }

    paint()
    document.fonts?.ready.then(paint).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [open, freedom])

  // Esc sluit; body-scroll blijft bevroren zolang de dialoog open is.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, close])

  const handleShare = useCallback(async () => {
    const payload = buildFreedomShareText(freedom, window.location.origin)
    const canvas = canvasRef.current

    // Eerst mét beeld: dat is de sterkste deelvorm op mobiel.
    if (canvas && typeof navigator.canShare === 'function') {
      const blob = await canvasToBlob(canvas)
      if (blob) {
        const file = new File([blob], FREEDOM_CARD_FILENAME, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ ...payload, files: [file] })
            return
          } catch {
            // Afgebroken door de gebruiker of geweigerd → val terug op tekst.
          }
        }
      }
    }

    try {
      await navigator.share({ title: payload.title, text: payload.text, url: payload.url })
    } catch {
      setStatus('Delen is hier niet beschikbaar — kopieer de tekst.')
    }
  }, [freedom])

  const handleCopy = useCallback(async () => {
    const payload = buildFreedomShareText(freedom, window.location.origin)
    try {
      await navigator.clipboard.writeText(payload.clipboard)
      setStatus('Tekst gekopieerd.')
    } catch {
      setStatus('Kopiëren lukte niet — selecteer de tekst hierboven.')
    }
  }, [freedom])

  const handleDownload = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const blob = await canvasToBlob(canvas)
    if (!blob) {
      setStatus('Opslaan lukte niet in deze browser.')
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = FREEDOM_CARD_FILENAME
    a.click()
    URL.revokeObjectURL(url)
    setStatus('Afbeelding opgeslagen.')
  }, [])

  const nativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <>
      <button
        type="button"
        ref={openerRef}
        className="share-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Deel je uitkomst — alleen je vrijheidstijd"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 15V3m0 0L8 7m4-4l4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Delen
      </button>

      {open && portalHost && createPortal(
        <div
          className="share-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div className="share-dialog" role="dialog" aria-modal="true" aria-labelledby={TITLE_ID}>
            <div className="share-dialog-head">
              <div>
                <p className="share-dialog-kicker">Delen</p>
                <h2 id={TITLE_ID}>Je vrijheidstijd, en verder niets</h2>
              </div>
              <button
                type="button"
                ref={closeRef}
                className="share-dialog-close"
                onClick={close}
                aria-label="Sluiten"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <p className="share-dialog-lede">
              Wat je deelt is alleen je vrijheidstijd. Je bedragen, je percentages en
              alles wat je hebt ingevuld blijven hier — ze zitten niet in het beeld,
              niet in de tekst en niet in de link.
            </p>

            <canvas
              ref={canvasRef}
              className="share-card"
              width={FREEDOM_CARD_WIDTH}
              height={FREEDOM_CARD_HEIGHT}
              role="img"
              aria-label={`Deelbare kaart: ${freedom.years} jaar en ${freedom.months} maanden vrijheid`}
            />

            <div className="share-actions">
              {nativeShare && (
                <button type="button" className="share-action primary" onClick={handleShare}>
                  Delen
                </button>
              )}
              <button type="button" className="share-action" onClick={handleCopy}>
                Tekst kopiëren
              </button>
              <button type="button" className="share-action" onClick={handleDownload}>
                Afbeelding opslaan
              </button>
            </div>

            <p className="share-status" role="status" aria-live="polite">
              {status}
            </p>
          </div>
        </div>,
        portalHost,
      )}
    </>
  )
}
