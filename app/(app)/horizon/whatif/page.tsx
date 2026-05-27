import { redirect } from 'next/navigation'

/**
 * Legacy-route. De what-if-ervaring leeft nu op /toekomst/whatif. We
 * behouden de dream-gate-parameter zodat de animatie-transitie blijft
 * werken; anders opent de tijdas met de what-if-modal.
 */
export default async function WhatIfRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ via?: string }>
}) {
  const params = await searchParams
  redirect(
    params.via === 'dreamgate'
      ? '/toekomst/whatif?via=dreamgate'
      : '/toekomst?whatif=open',
  )
}
