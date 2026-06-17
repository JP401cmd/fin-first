'use client'

import { useEffect, useState } from 'react'
import type { ReportLifeGrid } from '@/lib/check/types'
import { useInViewOnce, useReducedMotion, useCountUp } from './hooks'

/**
 * Hero — het levensgrid (90 vakjes) + 3 punch-getallen. Elk vakje is één jaar.
 * Kleuring uit de DTO: lived (< age), funded (age..age+alreadyFunded),
 * grind (..fireAge), free (..endAge). FIRE onhaalbaar → geen free/grind-knip.
 */
export function LifeGrid({ data }: { data: ReportLifeGrid }) {
  const reduce = useReducedMotion()
  const { ref, inView } = useInViewOnce<HTMLDivElement>(0.3)
  const [shown, setShown] = useState<boolean[]>(() =>
    new Array(data.endAge).fill(false),
  )

  const total = data.endAge
  const fundedEnd = data.age + Math.round(data.alreadyFundedYears)
  const fireAge = data.fireReachable && data.fireAge != null ? data.fireAge : null

  // klasse per jaar-vakje
  const classFor = (y: number): string => {
    if (y < data.age) return 'lived'
    if (y < fundedEnd) return 'funded'
    if (fireAge != null) {
      if (y < fireAge) return 'grind'
      return 'free'
    }
    // FIRE onhaalbaar: alles na funded is "nog te werken"
    return 'grind'
  }

  useEffect(() => {
    if (!inView) return
    if (reduce) {
      setShown(new Array(total).fill(true))
      return
    }
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < total; i++) {
      timers.push(
        setTimeout(() => {
          setShown((prev) => {
            const next = prev.slice()
            next[i] = true
            return next
          })
        }, 250 + i * 18),
      )
    }
    return () => timers.forEach(clearTimeout)
  }, [inView, reduce, total])

  const punchA = useCountUp(data.alreadyFundedYears, inView, {
    decimals: 1,
    delayMs: 600,
    reduce,
  })
  const punchB = useCountUp(data.grindYears ?? 0, inView, {
    delayMs: 600,
    reduce,
  })
  const punchC = useCountUp(data.freeYears ?? 0, inView, {
    delayMs: 600,
    reduce,
  })

  const livedYears = data.age
  const fundedYears = Math.round(data.alreadyFundedYears)

  return (
    <div className="hero" ref={ref}>
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">＊</span> Je leven in jaren
        </div>
        <h2>
          Elk vakje is één jaar.{' '}
          <span className="gold">De gouden zijn al van jou.</span>
        </h2>
        <p className="hero-lede">
          Je bent {data.age}.{' '}
          {fireAge != null ? (
            <>
              Op je {fireAge}e wordt werken een keuze. Maar van die jaren ertussen
              heb je met je huidige vermogen al ruim{' '}
              {data.alreadyFundedYears.toFixed(1).replace('.', ',')}{' '}
              <em>vrijgekocht</em> — die hoef je niet meer te verdienen. Kijk wat
              er gebeurt.
            </>
          ) : (
            <>
              Met je huidige vermogen heb je al ruim{' '}
              {data.alreadyFundedYears.toFixed(1).replace('.', ',')} jaar{' '}
              <em>vrijgekocht</em> — die hoef je niet meer te verdienen.
            </>
          )}
        </p>

        <div className="lifegrid" aria-label="Levensgrid van een heel leven">
          {Array.from({ length: total }, (_, y) => {
            const cls = classFor(y)
            const isNow = y === data.age
            return (
              <div
                key={y}
                className={`yr ${cls}${isNow ? ' now' : ''}${shown[y] ? ' show' : ''}`}
              />
            )
          })}
        </div>

        <div className="grid-legend">
          <span>
            <i style={{ background: '#9A8E78' }} />
            Geleefd · {livedYears} jaar
          </span>
          <span>
            <i style={{ background: 'var(--wil)' }} />
            Al vrijgekocht · {fundedYears} jaar
          </span>
          <span>
            <i style={{ boxShadow: 'inset 0 0 0 1.5px rgba(244,239,230,.4)' }} />
            Nog te werken · {data.grindYears ?? '—'} jaar
          </span>
          {fireAge != null && (
            <span>
              <i style={{ background: 'var(--horizon-soft)' }} />
              Vrijheid · {data.freeYears} jaar
            </span>
          )}
        </div>

        <div className="hero-punch">
          <div className="punch">
            <div className="pn gold">{punchA}</div>
            <div className="pl">
              jaar vrijheid al
              <br />
              opgebouwd
            </div>
          </div>
          <div className="punch">
            <div className="pn">{data.grindYears != null ? punchB : '—'}</div>
            <div className="pl">
              jaar werk scheidt je
              <br />
              nog van vrij zijn
            </div>
          </div>
          <div className="punch">
            <div className="pn purp">{data.freeYears != null ? punchC : '—'}</div>
            <div className="pl">
              jaar vrijheid
              <br />
              ligt voor je
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
