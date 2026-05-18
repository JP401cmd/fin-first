import { redirect } from 'next/navigation'

/**
 * /horizon/doorrekening-test/opbouw → redirect naar /horizon met opbouw tab.
 * Feature #800: uniforme tijdas — bestaande bookmarks blijven werken.
 */
export default function OpbouwPage() {
  redirect('/horizon?doorrekening=opbouw')
}
