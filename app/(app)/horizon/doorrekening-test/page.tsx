import { redirect } from 'next/navigation'

/**
 * /horizon/doorrekening-test redirects to the Opbouw subpage.
 */
export default function DoorrekenigTestPage() {
  redirect('/horizon/doorrekening-test/opbouw')
}
