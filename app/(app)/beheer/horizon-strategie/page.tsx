import type { Metadata } from 'next'
import HorizonStrategieClient from './horizon-strategie-client'

export const metadata: Metadata = { title: 'Horizon-strategietest — Beheer' }

export default function HorizonStrategiePage() {
  return (
    <div className="space-y-4">
      <HorizonStrategieClient />
    </div>
  )
}
