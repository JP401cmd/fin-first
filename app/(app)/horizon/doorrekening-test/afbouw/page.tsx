import { redirect } from 'next/navigation'

/**
 * /horizon/doorrekening-test/afbouw → redirect naar /horizon met afbouw tab.
 * Feature #800: uniforme tijdas — bestaande bookmarks blijven werken.
 */
export default function AfbouwPage() {
  redirect('/horizon?doorrekening=afbouw')
}
