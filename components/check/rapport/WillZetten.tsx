import type { ReportWill, ReportWillMove } from '@/lib/check/types'

/** Sectie 6 — Will: avatar + intro + de zetten. Statische server-render. */
export function WillZetten({ will }: { will: ReportWill }) {
  return (
    <section id="s6">
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">6</span> Drie zetten van Will{' '}
          <span className="swatch" style={{ background: 'var(--wil)' }} />
        </div>
        <h2>Wat je morgen al kunt doen</h2>

        <div className="will-intro">
          <div className="will-av" aria-hidden="true" />
          <div className="txt">
            <div className="who">Will · jouw budgetcoach</div>
            <p>{will.intro}</p>
          </div>
        </div>

        {will.moves.map((move, i) => (
          <div className="move" key={move.title}>
            <div className="move-num">{String(i + 1).padStart(2, '0')}</div>
            <div className="move-body">
              <h3>{move.title}</h3>
              <p>{move.body}</p>
              <div className="move-gain">
                <MoveGain move={move} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MoveGain({ move }: { move: ReportWillMove }) {
  if (move.kind === 'fire-months') {
    return (
      <span className="gain-pill fire">{move.gainLabel}</span>
    )
  }
  // freedom-days: toon zoveel groene blokjes als dagen (gemaximeerd voor layout)
  const dots = Math.max(0, Math.min(move.gainDays ?? 0, 14))
  return (
    <span className="gain-pill">
      <span className="gain-dots">
        {Array.from({ length: dots }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      {move.gainLabel}
    </span>
  )
}
