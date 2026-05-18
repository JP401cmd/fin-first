import { redirect } from 'next/navigation'

/**
 * /horizon/doorrekening-test/gebeurtenissen → redirect naar /horizon.
 * Feature #800: uniforme tijdas — levensgebeurtenissen staan al op /horizon.
 */
export default function GebeurtenissenPage() {
  redirect('/horizon')
}
