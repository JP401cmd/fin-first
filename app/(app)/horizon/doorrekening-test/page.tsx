import { redirect } from 'next/navigation'

/**
 * /horizon/doorrekening-test → redirect naar /horizon met doorrekening inline sectie.
 * Feature #800: uniforme tijdas — bestaande bookmarks blijven werken.
 */
export default function DoorrekenigTestPage() {
  redirect('/horizon?doorrekening=overzicht')
}
