import { redirect } from 'next/navigation'

/**
 * Legacy-route. De levensstrategieën leven nu op /toekomst (Tijdas-tab,
 * strategie-modal via ?strategie=open). Single-hop naar de canonieke URL.
 */
export default function StrategieRedirectPage() {
  redirect('/toekomst?strategie=open')
}
