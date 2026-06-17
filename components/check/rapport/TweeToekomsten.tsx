'use client'

import type {
  ReportTwoFutures,
  ReportFireCard,
  ReportSensitivityRow,
  ReportWithdrawalRow,
  ReportLifeGrid,
} from '@/lib/check/types'
import { formatCurrency } from '@/lib/format'
import { useInViewOnce, useReducedMotion, useCountUp } from './hooks'

const MINI_CELLS = 42

const RISK_TAG: Record<string, string> = {
  green: 'g',
  amber: 'a',
  red: 'r',
  grey: 'neutral',
}

export function TweeToekomsten({
  twoFutures,
  fireCards,
  sensitivity,
  withdrawalStrategies,
  lifeGrid,
}: {
  twoFutures: ReportTwoFutures
  fireCards: ReportFireCard[]
  sensitivity: ReportSensitivityRow[]
  withdrawalStrategies: ReportWithdrawalRow[]
  lifeGrid: ReportLifeGrid
}) {
  const reduce = useReducedMotion()
  const { ref, inView } = useInViewOnce<HTMLElement>(0.2)

  const fireAge = twoFutures.fireAge
  const startAge = lifeGrid.age
  const fireAgeText = useCountUp(fireAge ?? startAge, inView, {
    reduce,
    durationMs: 900,
    delayMs: 200,
  })

  // mini-grid "stop vandaag": eerst de al-vrijgekochte gouden jaren, rest leeg/grind
  const stopGold = Math.max(0, Math.round(lifeGrid.alreadyFundedYears))
  // mini-grid "op koers": vrije jaren in horizon-paars
  const stayFree = Math.max(0, twoFutures.stayFreeYears ?? 0)

  return (
    <section id="s4" ref={ref}>
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">4</span> Twee toekomsten{' '}
          <span className="swatch" style={{ background: 'var(--horizon)' }} />
        </div>
        <h2>Het punt waarop werken een keuze wordt</h2>

        <div className="fire-headline">
          <span className="fire-age">{fireAge != null ? fireAgeText : '—'}</span>
          <div>
            <div className="fire-age-label">je vrijheidsleeftijd</div>
            {fireAge != null ? (
              <div className="fire-year">
                in het jaar <em>{twoFutures.fireYear}</em> — over{' '}
                {twoFutures.yearsUntilFire} jaar
              </div>
            ) : (
              <div className="fire-year">
                binnen deze projectie <em>nog niet bereikbaar</em>
              </div>
            )}
          </div>
        </div>

        <p className="lede" style={{ marginTop: 18 }}>
          Je staat op een vork in de weg. Stoppen met sparen kan vandaag al — maar
          het verschil in vrije jaren is groot. Elk vakje hieronder is opnieuw één
          jaar.
        </p>

        <div className="futures">
          <div className="future">
            <div className="future-tag">Als je vandaag stopt met opbouwen</div>
            <div className="mini-grid">
              {Array.from({ length: MINI_CELLS }, (_, i) => (
                <div
                  key={i}
                  className={`mg ${i < stopGold ? 'gold' : 'grind'}`}
                />
              ))}
            </div>
            <div className="future-big">{twoFutures.stopTodayLabel}</div>
            <div className="future-sub">
              vrijheid, daarna weer afhankelijk van inkomen.
            </div>
          </div>
          <div className="future stay">
            <div className="future-tag">
              {fireAge != null
                ? `Als je op koers blijft tot je ${fireAge}e`
                : 'Als je op koers blijft'}
            </div>
            <div className="mini-grid">
              {Array.from({ length: MINI_CELLS }, (_, i) => (
                <div
                  key={i}
                  className={`mg ${i < stayFree ? 'free' : 'grind'}`}
                />
              ))}
            </div>
            <div className="future-big" style={{ color: 'var(--horizon)' }}>
              {twoFutures.stayFreeYears != null
                ? `${twoFutures.stayFreeYears} jaar`
                : '—'}
            </div>
            <div className="future-sub">
              vrijheid — ruim het meervoud van je werkjaren.
            </div>
          </div>
        </div>

        <div className="fire-cards">
          {fireCards.map((card) => (
            <div className="fire-card" key={card.key}>
              <div className="k">{cardLabel(card.key)}</div>
              <div className="v">
                {card.value}
                <small>{card.sub}</small>
              </div>
            </div>
          ))}
        </div>

        {/* gevoeligheid */}
        <h3 className="sub">Wat verschuift je datum?</h3>
        <p className="lede" style={{ marginBottom: 16 }}>
          Kleine knoppen, groot verschil. Zo gevoelig is je plan voor elke
          variabele:
        </p>
        <div className="sens">
          {sensitivity.map((row) => (
            <div className="sens-row" key={row.lever}>
              <div className="sens-lever">{renderLever(row.lever)}</div>
              <div className={`sens-eff ${row.better ? 'good' : 'bad'}`}>
                {row.effectLabel}
              </div>
            </div>
          ))}
        </div>

        {/* onttrekking */}
        <h3 className="sub">
          {fireAge != null ? `Onttrekking na je ${fireAge}e` : 'Onttrekking na FIRE'}
        </h3>
        <table className="data">
          <thead>
            <tr>
              <th>Strategie</th>
              <th className="r">Jaar 1</th>
              <th className="r">Houdbaar tot</th>
              <th>Risico</th>
            </tr>
          </thead>
          <tbody>
            {withdrawalStrategies.map((row) => (
              <tr key={row.strategy}>
                <td>{row.strategy}</td>
                <td className="num r">{formatCurrency(row.year1)}</td>
                <td className="num r">{row.sustainableUntil}</td>
                <td>
                  <span className={`tag ${RISK_TAG[row.risk] ?? 'neutral'}`}>
                    {row.riskLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p
          className="mono"
          style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 10 }}
        >
          ↳ Je kiest de strategie zelf in de app; elke rij gebruikt dezelfde
          rekenmotor als dit rapport.
        </p>
      </div>
    </section>
  )
}

/** Vrij label per fire-card-key (de DTO levert key + value + sub). */
function cardLabel(key: string): string {
  switch (key) {
    case 'stop':
      return 'Stop je vandaag'
    case 'koers':
      return 'Op koers koop je bij'
    case 'onderweg':
      return 'Onderweg'
    case 'passief':
      return 'Passief later'
    default:
      return key
  }
}

/**
 * Maakt het deel "24% → 28%" / "+€200/mnd" vet (mono, horizon-kleur) — de
 * `<b>`-emphasis uit het ontwerp, zonder ruwe HTML.
 */
function renderLever(lever: string) {
  // Markeer een getal-/range-fragment: vang het laatste segment dat met een
  // cijfer/±/+ begint (bv. "24% → 28%", "+€200/mnd", "4% → 5%").
  const m = /^(.*?)(\b[+±]?[€\d][^]*)$/.exec(lever)
  if (!m) return lever
  return (
    <>
      {m[1]}
      <b>{m[2]}</b>
    </>
  )
}
