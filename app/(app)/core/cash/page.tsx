'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function CashAllPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/core/assets')
  }, [router])
  return null
}
