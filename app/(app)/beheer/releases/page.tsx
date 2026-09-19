import { APP_VERSION } from '@/lib/app-version'
import { ReleasesClient } from './releases-client'

/**
 * /beheer/releases — vrijgavenotities per versie (superadmin via de
 * beheer-layout). Server-component: leest de huidige versie uit de ene
 * versiebron (package.json via lib/app-version.ts) en geeft die als prop
 * door, zodat de client-bundel package.json niet hoeft mee te dragen.
 */
export default function BeheerReleasesPage() {
  return <ReleasesClient currentVersion={APP_VERSION} />
}
