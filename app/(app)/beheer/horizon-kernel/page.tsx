import type { Metadata } from 'next'
import HorizonKernelClient from './horizon-kernel-client'

export const metadata: Metadata = { title: 'Horizon-kernel — Beheer' }

export default function HorizonKernelPage() {
  return <HorizonKernelClient />
}
