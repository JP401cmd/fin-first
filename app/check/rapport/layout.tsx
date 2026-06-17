import type { Metadata } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import './rapport.css'

/**
 * IBM Plex Mono — de mono-stijl uit het canonieke vrijheidsrapport-ontwerp.
 * Bewust hier geladen (eigen route-layout), zodat `app/layout.tsx` /
 * `globals.css` onaangeroerd blijven. Playfair Display + Source Serif 4 zijn
 * al global beschikbaar via de root-layout (`--font-playfair` /
 * `--font-source-serif`); dit voegt enkel `--font-ibm-plex-mono` toe.
 */
const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: true,
})

export const metadata: Metadata = {
  title: 'Je Vrijheidsrapport — TriFinity',
  description:
    'Vijf minuten invoer, één eerlijk dossier. Elke euro die je opbouwt is geen saldo — het is vrijheid om je eigen keuzes te maken.',
  robots: { index: false, follow: false },
}

export default function RapportLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Géén tweede <html>/<body> — die komen uit de root-layout. We wrappen het
  // rapport in een eigen <div> die de mono-fontvariabele en de "krant"-look
  // (paper-achtergrond, noise-overlay, leeskleuren) scopet via rapport.css.
  return <div className={`${ibmPlexMono.variable} rapport-root`}>{children}</div>
}
