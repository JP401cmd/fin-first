'use client'

import { NL_SWR, NL_MULTIPLIER, type FireMethod } from '@/lib/horizon-data'

export function useFireMethod() {
  return {
    method: 'nl' as FireMethod,
    swr: NL_SWR,
    multiplier: NL_MULTIPLIER,
    loading: false,
  }
}
