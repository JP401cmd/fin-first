import { redirect } from 'next/navigation'

/**
 * Legacy-route. Uitgaven-na-pensioen-pane leeft nu op /toekomst
 * (?uitgaven=open). Single-hop naar de canonieke URL.
 */
export default function UitgavenNaPensioenRedirectPage() {
  redirect('/toekomst?uitgaven=open')
}
