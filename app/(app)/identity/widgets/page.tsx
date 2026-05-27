import { redirect } from 'next/navigation'

/**
 * Widget-configuratie verhuist naar /mijn (personalisatie). Single-hop
 * redirect — geen /will-omweg meer.
 */
export default function WidgetsRedirect() {
  redirect('/mijn')
}
