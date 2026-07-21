'use client'

import { useEffect } from 'react'

/**
 * Root error boundary. Vangt als ENIGE boundary een crash in de root
 * `app/layout.tsx` (route-segment `error.tsx` doet dat niet -> anders Next default
 * = blanco pagina). Rendert daarom een eigen <html>/<body>.
 *
 * Bewust self-contained met inline styles: bij een layout-crash is er geen
 * garantie dat de app-providers of Tailwind-CSS geladen zijn. Filosofie-neutraal,
 * geen module-accent (dat vergt de provider die hier juist kan ontbreken).
 *
 * Draait alleen in een productie-build; in dev toont Next de eigen overlay.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
    // Best-effort beacon naar error_logs (best. /api/log-error). Faalt stil.
    try {
      const body = JSON.stringify({
        context: 'global-error',
        message: error?.message || 'global-error',
        stack: error?.stack,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      })
      void fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    } catch {
      // Loggen mag het vangnet nooit breken.
    }
  }, [error])

  return (
    <html lang="nl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          backgroundColor: '#fafaf9',
          color: '#1c1917',
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <div
            style={{
              margin: '0 auto 24px',
              width: '64px',
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '9999px',
              backgroundColor: '#fee2e2',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth={1.5}
              stroke="#dc2626"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>

          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            Er ging iets mis
          </h1>
          <p
            style={{
              marginTop: '12px',
              fontSize: '1rem',
              lineHeight: 1.6,
              color: '#57534e',
            }}
          >
            Er is een onverwachte fout opgetreden. Onze excuses voor het ongemak.
            Probeer het opnieuw of ga terug naar de startpagina.
          </p>

          <div
            style={{
              marginTop: '32px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#1c1917',
                color: '#ffffff',
                padding: '10px 24px',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Opnieuw proberen
            </button>
            {/* Harde reload (plain <a>) i.p.v. next/link: de kapotte React-tree
                moet volledig herbouwd worden. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                border: '1px solid #d6d3d1',
                backgroundColor: '#ffffff',
                color: '#44403c',
                padding: '10px 24px',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Naar startpagina
            </a>
          </div>

          {error.digest && (
            <p style={{ marginTop: '24px', fontSize: '0.75rem', color: '#a8a29e' }}>
              Foutcode: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
