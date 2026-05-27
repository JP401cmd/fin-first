import { redirect } from 'next/navigation'

/**
 * Voortgang/sovereignty-overzicht is opgegaan in /mijn. Single-hop
 * redirect — geen /identity-omweg meer.
 */
export default function VoortgangRedirect() {
  redirect('/mijn')
}
