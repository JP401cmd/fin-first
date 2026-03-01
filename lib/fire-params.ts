import { DEFAULT_RETURN, INFLATION, BOX3_DRAG } from '@/lib/horizon-data'

export interface FireParams {
  grossReturn: number    // bijv. 0.07
  inflationRate: number  // bijv. 0.02
  effectiveSwr: number   // grossReturn - BOX3_DRAG - inflationRate
}

export function resolveFireParams(profile: {
  expected_return?: number | null
  inflation_rate?: number | null
}): FireParams {
  const grossReturn = profile.expected_return ?? DEFAULT_RETURN
  const inflationRate = profile.inflation_rate ?? INFLATION
  const effectiveSwr = Math.max(0.001, grossReturn - BOX3_DRAG - inflationRate)
  return { grossReturn, inflationRate, effectiveSwr }
}
