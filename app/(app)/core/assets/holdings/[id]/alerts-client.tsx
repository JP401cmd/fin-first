'use client'

import HoldingAlerts from '@/components/app/holding-alerts'

export default function HoldingAlertsClient({
  holdingId,
  holdingName,
  currentPrice,
}: {
  holdingId: string
  holdingName: string
  currentPrice: number
}) {
  return (
    <HoldingAlerts
      holdingId={holdingId}
      holdingName={holdingName}
      currentPrice={currentPrice}
    />
  )
}
