import type { Metadata } from 'next'
import { UatPlaatClient } from './uat-plaat-client'

// De /beheer-layout weigert niet-admins al (redirect), dus deze pagina hoeft
// zelf niet extra te gaten. De plaat haalt bij mount de nieuwste ronde + de
// resultaten op via de admin-API en rendert de statische procesplaat (brok 2).
// Zie docs/uat/uat-plan.md Deel 3 §3.1–3.2.

export const metadata: Metadata = { title: 'UAT-procesplaat — Beheer' }

export default function UatPage() {
  return <UatPlaatClient />
}
