// Verplaatst uit components/app/horizon/horizon-client.tsx r6544–6562 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * Lege staat van het canvas: zonder simResult geen grafiek, op álle katernen
 * (blok I, alleen het lege-staat-deel). De host houdt de ternary
 * `!simResult && !loading ? … : simResult ? …` zelf.
 */

import { AlertTriangle, TrendingUp } from 'lucide-react'
import { WidgetEmpty } from '@/components/widgets/widget-empty'

export interface CanvasLegeStaatProps {
  simError: string | null
  loadData: () => void | Promise<void>
}

export function CanvasLegeStaat({ simError, loadData }: CanvasLegeStaatProps) {
  return (
            <div className="py-8" style={{ minHeight: 320 }}>
              {simError ? (
                <WidgetEmpty
                  variant="first-use"
                  icon={AlertTriangle}
                  title="Projectie"
                  description="Er is een fout opgetreden bij het berekenen van je FIRE-projectie. Controleer je gegevens of probeer opnieuw."
                  action={{ label: 'Opnieuw berekenen', onClick: () => loadData() }}
                />
              ) : (
                <WidgetEmpty
                  variant="first-use"
                  icon={TrendingUp}
                  title="Projectie"
                  description="Voeg vermogen toe in Het Overzicht zodat De Toekomst een projectie kan berekenen."
                  action={{ label: 'Vermogen toevoegen', href: '/overzicht/bezittingen' }}
                />
              )}
            </div>
  )
}
