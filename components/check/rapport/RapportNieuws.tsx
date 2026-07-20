import type { ReportNews, ReportNewsItem } from '@/lib/check/types'

/**
 * Sectie 5 — "Uit het nieuws". Tot 3 actuele financiële nieuwsitems in
 * krant-kolomstijl (app Editorial Finance). Consumeert `report.news` read-only;
 * rendert een no-op wanneer er geen items zijn (back-compat met oudere
 * snapshots zonder `news`-veld).
 *
 * Veiligheid: `sourceUrl` komt uit externe RSS — alleen als geldige http(s)-link
 * gebruiken we 'm als `href`. Anders tonen we de bron als platte tekst.
 */
export function RapportNieuws({ news }: { news?: ReportNews | null }) {
  const items = news?.items ?? []
  if (items.length === 0) return null

  return (
    <section id="s5">
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">5</span> Uit het nieuws{' '}
          <span className="swatch" style={{ background: 'var(--wil)' }} />
        </div>
        <h2>Wat er nu speelt voor je vrijheid</h2>
        <p className="lede">
          Algemeen financieel nieuws dat je vrijheidsplan kan raken — rente,
          fiscaliteit, woningmarkt. Bij elk bericht lees je kort waaróm het telt;
          in de app vertaalt Fin dat naar wat het voor jóuw cijfers betekent.
        </p>

        <div className="news-grid">
          {items.map((item, i) => (
            <NewsCard key={`${item.headline}-${i}`} item={item} />
          ))}
        </div>

        {news?.sourceNote && (
          <p
            className="mono"
            style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 18 }}
          >
            {news.sourceNote}
          </p>
        )}
      </div>
    </section>
  )
}

const CATEGORY_LABEL: Record<NonNullable<ReportNewsItem['category']>, string> = {
  fiscaal: 'Fiscaal',
  rente: 'Rente',
  woningmarkt: 'Woningmarkt',
  beleggingen: 'Beleggingen',
  pensioen: 'Pensioen',
  macro: 'Economie',
}

function NewsCard({ item }: { item: ReportNewsItem }) {
  const href = safeHttpUrl(item.sourceUrl)
  const categoryLabel = item.category ? CATEGORY_LABEL[item.category] : null

  return (
    <article className="news-card">
      {categoryLabel && (
        <div className="news-cat">
          <span className="news-cat-dot" aria-hidden="true" />
          {categoryLabel}
        </div>
      )}
      <h3 className="news-head">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {item.headline}
          </a>
        ) : (
          item.headline
        )}
      </h3>
      <p className="news-sum">{item.summary}</p>
      {item.impact && (
        <div className="news-impact">
          <div className="news-impact-label">Impact voor jou</div>
          <p>{item.impact}</p>
        </div>
      )}
      <div className="news-meta">
        <span className="news-source">{item.sourceName}</span>
        <span className="news-date">{item.dateLabel}</span>
      </div>
    </article>
  )
}

/**
 * Geef de URL alleen terug als 'ie een geldig http(s)-scheme heeft — guard tegen
 * `javascript:`/`data:`/relatieve rommel uit externe RSS-bronnen.
 */
function safeHttpUrl(raw: string): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
    return null
  } catch {
    return null
  }
}
