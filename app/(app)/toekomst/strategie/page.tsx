import { redirect } from 'next/navigation'

/**
 * /toekomst/strategie?focus=aow|pensioen|huis → opent de bijbehorende
 * levensstrategie-modal op de Gebeurtenissen-tab. Honoreert de oude
 * deeplinks die voorheen doodliepen op de generieke ?strategie=open-modal.
 */
export default async function ToekomstStrategieRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>
}) {
  const { focus } = await searchParams
  const key = focus === 'aow' || focus === 'pensioen' || focus === 'huis' ? focus : 'aow'
  redirect(`/toekomst/gebeurtenissen?strategie=${key}`)
}
