import { describe, it, expect } from 'vitest'
import {
  zoneTagsForPath,
  buildReportPagePayload,
  SIGNED_URL_TTL_SECONDS,
  type UserReportRow,
} from './notion'

/**
 * Tests voor de PURE mapping-laag van de Notion-koppeling (geen IO):
 *   - zoneTagsForPath: pathname → Tags-optie
 *   - buildReportPagePayload: rij → Notion `POST /v1/pages`-body
 *
 * Dit is de kwetsbaarste kant van de koppeling (property-namen/-vormen drift'en
 * zodra iemand in Notion iets hernoemt) en dus de hoogste testwaarde.
 * `getNotionCredentials` en `pushReportToNotion` (IO) worden indirect gedekt
 * via app/api/user-reports/route.test.ts en de cron-sync-test.
 */

// Zelfde default als DEFAULT_DATA_SOURCE_ID in notion.ts (niet geëxporteerd).
const DEFAULT_DATA_SOURCE_ID = 'd87e54c5-fb52-4607-a72a-52e4b58ee806'

function mkRow(overrides: Partial<UserReportRow> = {}): UserReportRow {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    user_id: 'user-1',
    email: 'melder@test.nl',
    report_type: 'bug',
    screen_label: 'Budgetoverzicht',
    description: 'Er gaat iets mis met de grafiek.',
    expected: 'De grafiek zou moeten laden.',
    consent_inzage: true,
    route: '/overzicht/budget',
    page_title: 'Budgetoverzicht',
    user_agent: 'vitest-agent/1.0',
    viewport: '1920x1080',
    app_version: '1.0.0',
    screenshot_path: null,
    notion_page_id: null,
    notion_sync_status: 'pending',
    notion_sync_attempts: 0,
    notion_last_error: null,
    created_at: '2026-01-15T12:00:00.000Z',
    ...overrides,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Notion payloads zijn losjes getypeerd (Record<string,unknown>) op de call-site
type NotionProps = Record<string, any>

function props(payload: Record<string, unknown>): NotionProps {
  return payload.properties as NotionProps
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem, kinderen zijn heterogene blokken (heading/paragraph/callout/…)
type NotionBlock = any

function children(payload: Record<string, unknown>): NotionBlock[] {
  return payload.children as NotionBlock[]
}

describe('buildReportPagePayload — Type-select per meldingssoort', () => {
  it.each([
    ['bug', 'Bug'],
    ['vraag', 'Vraag'],
    ['aanbeveling', 'Feature'],
  ] as const)('%s → Type %s', (type, expected) => {
    const payload = buildReportPagePayload(mkRow({ report_type: type }), null)
    expect(props(payload).Type).toEqual({ select: { name: expected } })
  })
})

describe('buildReportPagePayload — Status', () => {
  it('is een status-property (nooit select) — kritieke Notion-regressie: {select:…} geeft een 400', () => {
    const payload = buildReportPagePayload(mkRow(), null)
    expect(props(payload).Status).toEqual({ status: { name: 'Nieuw' } })
    expect(props(payload).Status.select).toBeUndefined()
  })
})

describe('buildReportPagePayload — CC-actie en Severity', () => {
  it('CC-actie is altijd Backlog, voor elk type', () => {
    for (const type of ['bug', 'vraag', 'aanbeveling'] as const) {
      const payload = buildReportPagePayload(mkRow({ report_type: type }), null)
      expect(props(payload)['CC-actie']).toEqual({ select: { name: 'Backlog' } })
    }
  })

  it('Severity S2 - medium ALLEEN bij bug, afwezig bij vraag en aanbeveling', () => {
    const bug = buildReportPagePayload(mkRow({ report_type: 'bug' }), null)
    expect(props(bug).Severity).toEqual({ select: { name: 'S2 - medium' } })

    const vraag = buildReportPagePayload(mkRow({ report_type: 'vraag' }), null)
    expect(props(vraag).Severity).toBeUndefined()

    const aanbeveling = buildReportPagePayload(
      mkRow({ report_type: 'aanbeveling', screen_label: null, expected: null }),
      null,
    )
    expect(props(aanbeveling).Severity).toBeUndefined()
  })
})

describe('buildReportPagePayload — Prioriteit', () => {
  it.each([
    ['bug', 'P1'],
    ['vraag', 'P3'],
    ['aanbeveling', 'P3'],
  ] as const)('%s → Prioriteit %s', (type, expected) => {
    const payload = buildReportPagePayload(
      mkRow({ report_type: type, screen_label: type === 'aanbeveling' ? null : 'Budgetoverzicht' }),
      null,
    )
    expect(props(payload).Prioriteit).toEqual({ select: { name: expected } })
  })

  it('staat op ELK kaartje — een prio-loze rij zakt weg onderin de queue-sortering', () => {
    for (const type of ['bug', 'vraag', 'aanbeveling'] as const) {
      const payload = buildReportPagePayload(mkRow({ report_type: type }), null)
      expect(props(payload).Prioriteit).toBeDefined()
    }
  })

  it('prio en ernst lopen bewust uiteen bij een bug: P1 naast Severity S2 - medium', () => {
    // Severity = hoe erg het defect zelf is (onbekend bij binnenkomst → midden).
    // Prioriteit = hoe snel we kijken (hoog, want iemand liep er echt tegenaan).
    // Deze test staat er zodat niemand ze later "gelijktrekt voor de consistentie".
    const bug = props(buildReportPagePayload(mkRow({ report_type: 'bug' }), null))
    expect(bug.Prioriteit).toEqual({ select: { name: 'P1' } })
    expect(bug.Severity).toEqual({ select: { name: 'S2 - medium' } })
  })
})

describe('buildReportPagePayload — titel (incl. Europe/Amsterdam-datumgrens)', () => {
  // 23:30 UTC op 15 jan 2026 = 00:30 CET (winter, UTC+1) op 16 jan — een naive
  // UTC-substring zou '2026-01-15' geven; Amsterdam hoort '2026-01-16' te zijn.
  const MIDNIGHT_STRADDLING_UTC = '2026-01-15T23:30:00.000Z'
  const ID = 'abcdef12-0000-0000-0000-000000000000' // shortId → 'abcdef'

  it('bug: datum-slug-id — scherm', () => {
    const row = mkRow({
      report_type: 'bug',
      id: ID,
      created_at: MIDNIGHT_STRADDLING_UTC,
      screen_label: 'Budgetoverzicht',
    })
    const title = props(buildReportPagePayload(row, null)).Feature.title[0].text.content
    expect(title).toBe('2026-01-16-testbug-abcdef — Budgetoverzicht')
  })

  it('vraag: datum-slug-id — scherm', () => {
    const row = mkRow({
      report_type: 'vraag',
      id: ID,
      created_at: MIDNIGHT_STRADDLING_UTC,
      screen_label: 'Toekomst',
    })
    const title = props(buildReportPagePayload(row, null)).Feature.title[0].text.content
    expect(title).toBe('2026-01-16-testvraag-abcdef — Toekomst')
  })

  it('aanbeveling: datum-slug-id ZONDER schermsuffix', () => {
    const row = mkRow({
      report_type: 'aanbeveling',
      id: ID,
      created_at: MIDNIGHT_STRADDLING_UTC,
      screen_label: null,
      expected: null,
    })
    const title = props(buildReportPagePayload(row, null)).Feature.title[0].text.content
    expect(title).toBe('2026-01-16-testwens-abcdef')
  })
})

describe('buildReportPagePayload — rich_text-cap vs. volledige body', () => {
  it('Actual result-property gecapt op 1900 tekens; de body-alinea’s bevatten de VOLLEDIGE tekst', () => {
    const longText = 'x'.repeat(4500) // > 4000: dwingt meerdere 1900-char chunks af
    const row = mkRow({
      report_type: 'vraag', // geen bug-'expected'-blok, geen screenshot: alle 'paragraph'-children zijn de omschrijving
      description: longText,
      screen_label: 'Cashflow',
    })
    const payload = buildReportPagePayload(row, null)

    const propContent = props(payload)['Actual result'].rich_text[0].text.content as string
    expect(propContent.length).toBeLessThanOrEqual(1900)
    expect(propContent.endsWith('…')).toBe(true)

    const paragraphs = children(payload).filter((c) => c.type === 'paragraph')
    const bodyJoined = paragraphs.map((p) => p.paragraph.rich_text[0].text.content).join('')
    expect(bodyJoined).toBe(longText)
  })
})

describe('buildReportPagePayload — consent-callout', () => {
  it('consent JA + belooft geen technische toegang', () => {
    const row = mkRow({ consent_inzage: true, email: 'melder@test.nl' })
    const callout = children(buildReportPagePayload(row, null)).find((c) => c.type === 'callout')
    const text = callout.callout.rich_text[0].text.content as string
    expect(text).toContain('Toestemming inzage: JA')
    expect(text).toContain('melder@test.nl')
    expect(text).toMatch(/geen technische toegang/i)
  })

  it('consent NEE', () => {
    const row = mkRow({ consent_inzage: false })
    const callout = children(buildReportPagePayload(row, null)).find((c) => c.type === 'callout')
    const text = callout.callout.rich_text[0].text.content as string
    expect(text).toContain('Toestemming inzage: NEE')
  })
})

describe('zoneTagsForPath', () => {
  it.each([
    ['/overzicht/x', ['OVZ']],
    ['/toekomst', ['TOEK']],
    ['/mijn/account', ['MIJN']],
    ['/beheer/jobs', ['BEHEER']],
    ['/overzicht/budget', ['BUDGET']], // budget-regel wint van het generieke /overzicht
    ['/wat/dan/ook/onbekend', []],
  ] as const)('%s → %j', (path, expected) => {
    expect(zoneTagsForPath(path)).toEqual(expected)
  })

  it('null → []', () => {
    expect(zoneTagsForPath(null)).toEqual([])
  })

  it('undefined → []', () => {
    expect(zoneTagsForPath(undefined)).toEqual([])
  })
})

describe('Tags op het kaartje — herkomst + zone', () => {
  it('elk kaartje draagt de vaste herkomst-tag, ook zonder zone-match', () => {
    const payload = props(buildReportPagePayload(mkRow({ route: '/wat/dan/ook' }), null))
    expect(payload.Tags.multi_select).toEqual([{ name: 'Testgebruiker' }])
  })

  it('herkomst-tag staat vóór de zone-tag', () => {
    const payload = props(buildReportPagePayload(mkRow({ route: '/toekomst' }), null))
    expect(payload.Tags.multi_select).toEqual([{ name: 'Testgebruiker' }, { name: 'TOEK' }])
  })
})

describe('buildReportPagePayload — parent/data_source_id', () => {
  it('default dataSourceId wanneer niet meegegeven', () => {
    const payload = buildReportPagePayload(mkRow(), null)
    expect(payload.parent).toEqual({
      type: 'data_source_id',
      data_source_id: DEFAULT_DATA_SOURCE_ID,
    })
  })

  it('meegegeven dataSourceId wint van de default', () => {
    const payload = buildReportPagePayload(mkRow(), null, 'custom-ds-id')
    expect(payload.parent).toEqual({ type: 'data_source_id', data_source_id: 'custom-ds-id' })
  })
})

describe('screenshot-link: houdbaarheid', () => {
  it('de signed URL leeft 48 uur — een bearer-credential, geen bewaartermijn', () => {
    // Een signed URL is een bearer-credential: wie 'm uit het (gedeelde)
    // Notion-kaartje kopieert haalt het beeld op zonder in te loggen. De
    // houdbaarheid hoort dus bij de triage-duur (uren), niet bij de
    // bewaartermijn van de melding. Stond op 30 dagen.
    expect(SIGNED_URL_TTL_SECONDS).toBe(60 * 60 * 48)
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(60 * 60 * 72)
  })

  it('de tekst op het kaartje is AFGELEID van de constante, niet los ingetypt', () => {
    // Zonder deze koppeling kan de tekst "geldig 48 uur" blijven staan terwijl
    // de echte TTL iets heel anders is — precies hoe 30 dagen ongemerkt bleef.
    const row = mkRow({ screenshot_path: 'user-1/report-1.png' })
    const kids = children(buildReportPagePayload(row, 'https://signed.example/x'))
    const uren = Math.round(SIGNED_URL_TTL_SECONDS / 3600)
    const heeftLabel = kids.some(
      (c) =>
        c.type === 'paragraph' &&
        (c.paragraph.rich_text[0]?.text.content ?? '').includes(`geldig ${uren} uur`),
    )
    expect(heeftLabel).toBe(true)
  })
})

describe('buildReportPagePayload — screenshot', () => {
  it('mét signedUrl: image-block + "geldig 48 uur"-alinea', () => {
    const row = mkRow({ screenshot_path: 'user-1/report-1.png' })
    const payload = buildReportPagePayload(row, 'https://signed.example/x')
    const kids = children(payload)

    const image = kids.find((c) => c.type === 'image')
    expect(image?.image.external.url).toBe('https://signed.example/x')

    const hasTtlParagraph = kids.some(
      (c) =>
        c.type === 'paragraph' &&
        (c.paragraph.rich_text[0]?.text.content ?? '').includes('geldig 48 uur'),
    )
    expect(hasTtlParagraph).toBe(true)
  })

  it('zonder signedUrl: geen image-block en geen "geldig 48 uur"-alinea', () => {
    const payload = buildReportPagePayload(mkRow(), null)
    const kids = children(payload)

    expect(kids.some((c) => c.type === 'image')).toBe(false)
    expect(
      kids.some(
        (c) =>
          c.type === 'paragraph' &&
          (c.paragraph.rich_text[0]?.text.content ?? '').includes('geldig 48 uur'),
      ),
    ).toBe(false)
  })
})
