'use client'

import { useEffect } from 'react'
import { purgeOnIdentityChange } from '@/lib/browser-account-storage'

/**
 * Ruimt account-gebonden browseropslag op zodra er een ánder account op dit
 * toestel verschijnt dan de vorige keer.
 *
 * Hangt bewust aan de binnenkomst en niet aan het uitloggen: A gooit de browser
 * dicht of laat zijn sessie verlopen en B logt in — dan wordt er nooit een
 * uitlogpad doorlopen. Zie lib/browser-account-storage.ts voor de afweging.
 *
 * Rendert niets; hoort in de (app)-layout zodat hij vóór elk oppervlak draait.
 */
export function AccountStorageGuard({ userId }: { userId: string }) {
  useEffect(() => {
    purgeOnIdentityChange(userId)
  }, [userId])

  return null
}
