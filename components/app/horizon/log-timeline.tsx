'use client'

import type { LifeEvent, LifeEventImpact } from '@/lib/horizon-data'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { Action } from '@/lib/recommendation-data'
import {
  Calendar, Globe, Baby, Hammer, GraduationCap, Briefcase,
  Clock, Sunset, Home, Heart, HeartHandshake, HeartCrack, Truck, Car, Gift, Zap, HandCoins,
  Landmark, PiggyBank, UserX, UserMinus, Flower2,
  CheckCircle2, PartyPopper, Mountain, Sparkles, AlertTriangle, Shield, Receipt, TrendingUp,
} from 'lucide-react'

export const EVENT_ICONS: Record<string, React.ReactNode> = {
  Calendar: <Calendar className="h-4 w-4" />,
  Palmtree: <Sunset className="h-4 w-4" />,
  Globe: <Globe className="h-4 w-4" />,
  Baby: <Baby className="h-4 w-4" />,
  Hammer: <Hammer className="h-4 w-4" />,
  GraduationCap: <GraduationCap className="h-4 w-4" />,
  Briefcase: <Briefcase className="h-4 w-4" />,
  Clock: <Clock className="h-4 w-4" />,
  Sunset: <Sunset className="h-4 w-4" />,
  Home: <Home className="h-4 w-4" />,
  Heart: <Heart className="h-4 w-4" />,
  HeartCrack: <HeartCrack className="h-4 w-4" />,
  Truck: <Truck className="h-4 w-4" />,
  Car: <Car className="h-4 w-4" />,
  Gift: <Gift className="h-4 w-4" />,
  Zap: <Zap className="h-4 w-4" />,
  HeartHandshake: <HeartHandshake className="h-4 w-4" />,
  HandCoins: <HandCoins className="h-4 w-4" />,
  Landmark: <Landmark className="h-4 w-4" />,
  PiggyBank: <PiggyBank className="h-4 w-4" />,
  UserX: <UserX className="h-4 w-4" />,
  UserMinus: <UserMinus className="h-4 w-4" />,
  Flower2: <Flower2 className="h-4 w-4" />,
  // ── Natuurlijke mijlpalen ──
  CheckCircle2: <CheckCircle2 className="h-4 w-4" />,
  PartyPopper: <PartyPopper className="h-4 w-4" />,
  Mountain: <Mountain className="h-4 w-4" />,
  Sparkles: <Sparkles className="h-4 w-4" />,
  AlertTriangle: <AlertTriangle className="h-4 w-4" />,
  Shield: <Shield className="h-4 w-4" />,
  Receipt: <Receipt className="h-4 w-4" />,
  TrendingUp: <TrendingUp className="h-4 w-4" />,
}

// Logarithmic position: maps months-from-now to 0..1 range
// Near future gets more space: log(1 + offset) / log(1 + total)
export function logPosition(offsetMonths: number, totalMonths: number): number {
  if (totalMonths <= 0) return 0
  return Math.log(1 + Math.max(0, offsetMonths)) / Math.log(1 + totalMonths)
}

export function LogTimeline({
  currentAge, baseFireAge, adjustedFireAge, events, impacts, actions, dateOfBirth,
}: {
  currentAge: number
  baseFireAge: number | null
  adjustedFireAge: number | null
  events: LifeEvent[]
  impacts: LifeEventImpact[]
  actions: Action[]
  dateOfBirth: string | null
}) {
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 800 })
  const W = 800
  const H = 160
  const PAD_L = 20
  const PAD_R = 20
  const DRAW_W = W - PAD_L - PAD_R

  // Total months from now to end of timeline
  const endAge = Math.max(
    currentAge + 30,
    ...(baseFireAge != null ? [(adjustedFireAge ?? baseFireAge) + 5, baseFireAge + 5] : []),
    ...events.filter(e => e.target_age).map(e => Number(e.target_age) + 2),
  )
  const totalMonths = Math.max(12, (endAge - currentAge) * 12)

  function x(ageOrMonths: number, isAge = true): number {
    const offsetMonths = isAge ? (ageOrMonths - currentAge) * 12 : ageOrMonths
    const pos = logPosition(offsetMonths, totalMonths)
    return PAD_L + pos * DRAW_W
  }

  // Time labels with logarithmic spacing
  const now = new Date()
  const timeLabels: { label: string; months: number }[] = [
    { label: 'Nu', months: 0 },
    { label: '3 mnd', months: 3 },
    { label: '6 mnd', months: 6 },
    { label: '1 jaar', months: 12 },
    { label: '2 jaar', months: 24 },
    { label: '5 jaar', months: 60 },
    { label: '10 jaar', months: 120 },
    { label: '20 jaar', months: 240 },
    { label: '30 jaar', months: 360 },
  ].filter(l => l.months <= totalMonths)

  // Map action scheduled_week to months from now
  function actionToMonths(action: Action): number {
    if (!action.scheduled_week) return 0
    const actionDate = new Date(action.scheduled_week)
    const diffMs = actionDate.getTime() - now.getTime()
    return Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 30.44))
  }

  const Y_LINE = 80
  const Y_LABELS = H - 8
  const Y_ACTION = 40
  const Y_EVENT = 30

  return (
    <div ref={inViewRef}>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
      {/* Main timeline line — draws left-to-right (t=0ms, 500ms) */}
      <path
        d={`M${PAD_L} ${Y_LINE} L${W - PAD_R} ${Y_LINE}`}
        stroke="#e4e4e7" strokeWidth="2" fill="none"
        pathLength={1} strokeDasharray={1}
        style={{
          strokeDashoffset: hasEntered ? undefined : 1,
          animation: hasEntered ? 'drawPath 500ms cubic-bezier(.22,1,.36,1) both' : 'none',
        }}
      />

      {/* Time labels along bottom — fade in at t=300ms */}
      <g style={{ opacity: hasEntered ? 1 : 0, transition: hasEntered ? 'opacity 200ms ease-out 300ms' : 'none' }}>
        {timeLabels.map((tl) => {
          const px = x(tl.months, false)
          return (
            <g key={tl.label}>
              <line x1={px} y1={Y_LINE - 4} x2={px} y2={Y_LINE + 4} stroke="#d4d4d8" strokeWidth="1" />
              <text x={px} y={Y_LABELS} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
                {tl.label}
              </text>
            </g>
          )
        })}
      </g>

      {/* Current position marker — fade in at t=400ms */}
      <g style={{ opacity: hasEntered ? 1 : 0, transition: hasEntered ? 'opacity 200ms ease-out 400ms' : 'none' }}>
        <circle cx={x(currentAge)} cy={Y_LINE} r="6" fill="#8B5CB8" />
        <text x={x(currentAge)} y={Y_LINE + 20} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600 }} className="fill-horizon-600">
          {currentAge}j
        </text>
      </g>

      {/* Base FIRE marker — fade in at t=500ms */}
      {baseFireAge != null && (
        <g style={{ opacity: hasEntered ? 1 : 0, transition: hasEntered ? 'opacity 200ms ease-out 500ms' : 'none' }}>
          <circle cx={x(baseFireAge)} cy={Y_LINE} r="6" fill="#10b981" />
          <text x={x(baseFireAge)} y={Y_LINE + 20} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600 }} className="fill-emerald-600">
            FIRE {baseFireAge}j
          </text>

          {/* Adjusted FIRE marker (if different) */}
          {adjustedFireAge != null && adjustedFireAge !== baseFireAge && (
            <>
              <line
                x1={x(baseFireAge)} y1={Y_LINE}
                x2={x(adjustedFireAge)} y2={Y_LINE}
                stroke="#ef4444" strokeWidth="2" strokeDasharray="4"
              />
              <circle cx={x(adjustedFireAge)} cy={Y_LINE} r="5" fill="none" stroke="#ef4444" strokeWidth="2" />
              <text x={x(adjustedFireAge)} y={Y_LINE + 20} textAnchor="middle" style={{ fontSize: 8 }} className="fill-red-500">
                {adjustedFireAge}j
              </text>
            </>
          )}
        </g>
      )}

      {/* Action markers (teal, above timeline) — fade in at t=600ms */}
      <g style={{ opacity: hasEntered ? 1 : 0, transition: hasEntered ? 'opacity 200ms ease-out 600ms' : 'none' }}>
        {actions.map((action) => {
          const months = actionToMonths(action)
          const px = x(months, false)
          return (
            <g key={action.id}>
              <line x1={px} y1={Y_ACTION + 8} x2={px} y2={Y_LINE - 6} stroke="#14b8a6" strokeWidth="1.5" strokeDasharray="3" />
              <circle cx={px} cy={Y_ACTION} r="7" fill="#14b8a6" opacity="0.2" stroke="#14b8a6" strokeWidth="1" />
              <text x={px} y={Y_ACTION + 3} textAnchor="middle" style={{ fontSize: 7, fontWeight: 500 }} className="fill-teal-700">
                {action.freedom_days_impact != null ? `${Math.round(action.freedom_days_impact)}d` : ''}
              </text>
            </g>
          )
        })}
      </g>

      {/* Life event markers (purple, above timeline) — fade in at t=600ms */}
      <g style={{ opacity: hasEntered ? 1 : 0, transition: hasEntered ? 'opacity 200ms ease-out 600ms' : 'none' }}>
        {events.map((ev, i) => {
          if (!ev.target_age) return null
          const px = x(Number(ev.target_age))
          const impact = impacts[i]

          return (
            <g key={ev.id}>
              <line x1={px} y1={Y_EVENT + 8} x2={px} y2={Y_LINE - 6} stroke="#8B5CB8" strokeWidth="1.5" strokeDasharray="3" />
              <circle cx={px} cy={Y_EVENT - 2} r="8" fill="#8B5CB8" opacity="0.15" stroke="#8B5CB8" strokeWidth="1" />
              <text x={px} y={Y_EVENT + 2} textAnchor="middle" style={{ fontSize: 7, fontWeight: 500 }} className="fill-horizon-700">
                {ev.name.substring(0, 4)}
              </text>
              <text x={px} y={Y_EVENT - 10} textAnchor="middle" style={{ fontSize: 8 }} className="fill-horizon-500">
                {ev.target_age}j
              </text>
              {impact && impact.fireDelayMonths > 0 && (
                <text x={px} y={Y_LINE - 10} textAnchor="middle" style={{ fontSize: 7 }} className="fill-red-500">
                  +{impact.fireDelayMonths}m
                </text>
              )}
            </g>
          )
        })}
      </g>
    </svg>
    </div>
  )
}
