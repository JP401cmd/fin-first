import { redirect } from 'next/navigation'

/**
 * /horizon/doorrekening-test/overzicht → redirect naar /horizon met overzicht tab.
 * Feature #800: uniforme tijdas — bestaande bookmarks blijven werken.
 */
export default function OverzichtPage() {
  redirect('/horizon?doorrekening=overzicht')
}
