'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { LeverageStatus } from '@/lib/leverage-status'

/**
 * De vier cashflow-kaartstatussen (Budget, Transacties, Vaste lasten, Forecast)
 * voor de sidebar-status-dots onder Cashflow. Spiegelt EXACT de statussen van de
 * cashflow-landingskaarten: beide consumeren `buildCashflowCards` — de pagina
 * direct, de sidebar via `GET /api/overzicht/cashflow-status`.
 *
 * Egress/lazy-gating: dit endpoint is zwaar (loadDashboardData +
 * loadCashflowData + loadVasteLastenSummary). Daarom fetcht de hook ALLEEN op
 * een cashflow-route (`/overzicht/cashflow*`). Op alle andere
 * pagina's blijft hij stil en retourneert hij neutrale statussen, zodat de dots
 * hun grijze (neutral) staat tonen zonder netwerkverkeer.
 *
 * Eénmalige fetch per route-bezoek (geen polling). Defensief: bij loading/fout
 * blijven alle statussen 'neutral' (progressive enhancement).
 */
export type CashflowCardStatuses = {
  budget: LeverageStatus
  transacties: LeverageStatus
  vasteLasten: LeverageStatus
  forecast: LeverageStatus
}

const NEUTRAL: CashflowCardStatuses = {
  budget: 'neutral',
  transacties: 'neutral',
  vasteLasten: 'neutral',
  forecast: 'neutral',
}

const VALID: readonly LeverageStatus[] = ['good', 'warn', 'bad', 'neutral']

function coerce(value: unknown): LeverageStatus {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value)
    ? (value as LeverageStatus)
    : 'neutral'
}

export function useCashflowCardStatuses(): CashflowCardStatuses {
  const pathname = usePathname() ?? '/'
  const onCashflowRoute = pathname.startsWith('/overzicht/cashflow')
  const [statuses, setStatuses] = useState<CashflowCardStatuses>(NEUTRAL)

  useEffect(() => {
    if (!onCashflowRoute) {
      // Off-route: niet fetchen; dots blijven neutral.
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/overzicht/cashflow-status')
        if (!res.ok) return
        const data = (await res.json()) as Partial<Record<keyof CashflowCardStatuses, unknown>>
        if (cancelled) return
        setStatuses({
          budget: coerce(data.budget),
          transacties: coerce(data.transacties),
          vasteLasten: coerce(data.vasteLasten),
          forecast: coerce(data.forecast),
        })
      } catch {
        // Stil falen — dots blijven neutral (progressive enhancement).
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onCashflowRoute])

  return onCashflowRoute ? statuses : NEUTRAL
}
