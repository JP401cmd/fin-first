import { redirect } from 'next/navigation'

/**
 * /dashboard is samengevoegd met /overzicht (FinLanding rendert daar).
 * next.config redirect vangt dit al af op routing-niveau; deze page-
 * redirect blijft als directe terugval (single hop, geen /will-omweg meer).
 */
export default function DashboardRedirect() {
  redirect('/overzicht')
}
