import { BerichtenClient } from '@/components/berichten/berichten-client'

// Berichtencentrum — alle meldingen die de gebruiker ontvangt, op één plek.
// De financiële krant leeft op /nieuws, de briefing op /overzicht. Alle data
// komt client-side uit de NotificationProvider + de 30-daagse history-fetch,
// dus deze pagina hoeft geen server-data te laden.
export default function BerichtenPage() {
  return <BerichtenClient />
}
