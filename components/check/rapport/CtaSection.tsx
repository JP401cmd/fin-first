import type { ReportCta } from '@/lib/check/types'

const PERK_NUMERALS = ['①', '②', '③', '④', '⑤']

/** CTA-sectie — donker, gouden knop naar /signup?check=<token>. */
export function CtaSection({ cta }: { cta: ReportCta }) {
  return (
    <section className="cta-sec">
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">7</span> En nu?
        </div>
        <h2>
          Wil je hier <em>grip</em> op?
        </h2>
        <p className="lede">
          Maak je gratis account — je ingevulde gegevens gaan mee. Je begint niet
          met een leeg scherm, maar precies met dit rapport, live en bij te sturen.
        </p>
        <div className="perks">
          {cta.perks.map((perk, i) => (
            <div className="perk" key={perk.title}>
              <div className="pi">{PERK_NUMERALS[i] ?? `${i + 1}`}</div>
              <h4>{perk.title}</h4>
              <p>{perk.body}</p>
            </div>
          ))}
        </div>
        <a href={cta.signupHref} className="btn">
          Maak gratis account <span className="arr">→</span>
        </a>
        <p className="cta-fine">
          Gratis · je rapportcijfers gaan ongewijzigd mee · opzeggen wanneer je
          wilt
        </p>
      </div>
    </section>
  )
}
