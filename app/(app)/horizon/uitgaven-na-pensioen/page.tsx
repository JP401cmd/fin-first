import { redirect } from 'next/navigation'

/**
 * /horizon/uitgaven-na-pensioen redirects naar /horizon met de pane open.
 * De content leeft in components/app/horizon/uitgaven-pane.tsx en wordt
 * via ShellOverlay kind="pane" gerenderd op /horizon.
 */
export default function UitgavenNaPensioenRedirectPage() {
  redirect('/horizon?uitgaven=open')
}
