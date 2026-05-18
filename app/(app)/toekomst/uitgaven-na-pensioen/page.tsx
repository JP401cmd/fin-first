import { redirect } from 'next/navigation'

/**
 * /toekomst/uitgaven-na-pensioen redirect naar /toekomst met de
 * uitgaven-pane open. De content leeft in components/app/horizon/
 * uitgaven-pane.tsx en wordt via ShellOverlay kind="pane" gerenderd
 * op /toekomst.
 */
export default function ToekomstUitgavenNaPensioenRedirectPage() {
  redirect('/toekomst?uitgaven=open')
}
