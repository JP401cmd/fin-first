import { ImageResponse } from 'next/og'

// Dynamische OG-afbeelding (Next 16 conventie: app/opengraph-image.tsx).
// Editorial "Persoonlijk Financieel Dagblad"-stijl: cream achtergrond,
// groot serif/display statement, ingetogen kicker. Bewust GEEN externe
// font-fetch — system-serif/system-ui via fontFamily-fallback houdt de
// build robuust en snel (geen netwerk-afhankelijkheid bij genereren).

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'TriFinity — Geld is opgeslagen tijd'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          backgroundColor: '#f5efe2',
          padding: '96px',
          color: '#1a1a1a',
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#b45309',
            fontFamily: 'system-ui, "Segoe UI", sans-serif',
            marginBottom: 36,
          }}
        >
          TriFinity · Persoonlijk Financieel Dagblad
        </div>
        <div
          style={{
            fontSize: 104,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: -2,
            maxWidth: 1000,
          }}
        >
          Geld is opgeslagen tijd
        </div>
        <div
          style={{
            fontSize: 40,
            lineHeight: 1.25,
            marginTop: 32,
            color: '#3a3a3a',
            fontStyle: 'italic',
            maxWidth: 900,
          }}
        >
          Grip op vandaag, vrijheid voor morgen.
        </div>
      </div>
    ),
    { ...size }
  )
}
