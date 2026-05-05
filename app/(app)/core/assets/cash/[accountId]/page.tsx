'use client'

import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import { CashAccountView } from '@/components/app/cash-account-view'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export default function CashAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = use(params)
  const searchParams = useSearchParams()
  const month = searchParams.get('month') ?? undefined

  return (
    <>
      <NavStackMeta title="Cash-rekening" />
      <CashAccountView
        accountId={accountId}
        backHref="/core/assets"
        backLabel="Vermogen"
        initialMonth={month}
      />
    </>
  )
}
