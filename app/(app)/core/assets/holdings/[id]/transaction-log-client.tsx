'use client'

import HoldingTransactionLog from '@/components/app/holding-transaction-log'
import { useRouter } from 'next/navigation'

export default function HoldingTransactionLogClient({
  holdingId,
  holdingName,
  holdingTicker,
}: {
  holdingId: string
  holdingName: string
  holdingTicker?: string | null
}) {
  const router = useRouter()

  return (
    <HoldingTransactionLog
      holdingId={holdingId}
      holdingName={holdingName}
      holdingTicker={holdingTicker}
      onTransactionAdded={() => {
        // Refresh server component data (holding KPIs)
        router.refresh()
      }}
    />
  )
}
