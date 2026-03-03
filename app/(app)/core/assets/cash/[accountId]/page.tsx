'use client'

import { use } from 'react'
import { CashAccountView } from '@/components/app/cash-account-view'

export default function CashAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = use(params)
  return <CashAccountView accountId={accountId} backHref="/core/assets" backLabel="Assets" />
}
