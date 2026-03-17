'use client'

import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import { CashAccountView } from '@/components/app/cash-account-view'

export default function CashAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = use(params)
  const searchParams = useSearchParams()
  const month = searchParams.get('month') ?? undefined

  return (
    <CashAccountView
      accountId={accountId}
      backHref="/core/assets"
      backLabel="Assets"
      initialMonth={month}
    />
  )
}
