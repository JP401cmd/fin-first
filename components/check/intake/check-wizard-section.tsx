'use client'

/**
 * CheckWizardSection — dunne client-boundary wrapper die de CheckWizard
 * in een gestyled container plaatst.
 *
 * Aparte file zodat app/check/page.tsx een server component kan blijven
 * (metadata, static rendering) en alleen dit stukje client wordt.
 */

import { CheckWizard } from './check-wizard'

export function CheckWizardSection() {
  return (
    <div className="min-h-[60vh] bg-[var(--bg)]">
      <CheckWizard />
    </div>
  )
}
