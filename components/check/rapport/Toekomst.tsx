import type { ReportLifePath } from '@/lib/check/types'
import { BlikOpToekomst } from './BlikOpToekomst'

/**
 * Sectie 4 — "De toekomst". Eén grafiek: de levenslange vermogenslijn
 * (BlikOpToekomst). De vroegere kruisingsgrafiek (liquide/FIRE-inzetbaar) en de
 * spaarquote-placeholder zijn hier bewust verwijderd — twee grafieken met
 * verschillende grondslagen op één plek leverde verwarring op.
 *
 * Grondslag: de overgebleven lijn is NETTO vermogen INCL. huis (niet het
 * liquide/FIRE-inzetbare vermogen) — de intro zegt dat eerlijk. De FIRE-leeftijd
 * wordt als knik/marker op die lijn aangewezen.
 */
export function Toekomst({ lifePath }: { lifePath: ReportLifePath }) {
  return (
    <section id="s4">
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">4</span> De toekomst{' '}
          <span className="swatch" style={{ background: 'var(--horizon)' }} />
        </div>
        <h2>Je vermogen over een heel leven</h2>
        <p className="lede">
          Eén lijn, van nu tot je {lifePath.endAge}ste: je{' '}
          <span className="vt">netto vermogen inclusief je huis</span> — alles wat
          je bezit, niet alleen het deel dat je voor FIRE inzet.
        </p>

        <BlikOpToekomst lifePath={lifePath} />
      </div>
    </section>
  )
}
