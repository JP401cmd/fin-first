import { describe, it, expect } from 'vitest'
import {
  parseFinTipDraft,
  resolveLocalTip,
  distributeFreedomDays,
  type RawFinTipDraft,
} from './parse-tip'
import type { LocalTipCandidate } from './local-tips-context'

/**
 * Tests voor de lokale tip-parser + de CIJFER-GUARDRAIL.
 *
 * De kern van het lokale tips-pad is dat het model UITSLUITEND taal levert en dat
 * élk getal uit de canonieke kandidaat komt. Deze suite pint precies dat vast,
 * plus het fail-closed-gedrag (geen canonieke match → geen kaart).
 */

const kandidaat = (overrides: Partial<LocalTipCandidate> = {}): LocalTipCandidate => ({
  id: 'budget:boodschappen',
  bron: 'budget',
  titel: 'Bespaar op Boodschappen',
  toelichting: 'vergelijkbare huishoudens geven hier ~€520 per maand uit',
  besparingPerJaar: 1080,
  euroImpactMonthly: 90,
  vrijheidsdagen: 11,
  vrijheidsdagenToegestaan: true,
  budgetSlug: 'boodschappen',
  type: 'budget_optimization',
  priority: 5,
  ...overrides,
})

const fence = (json: string) => `\`\`\`fin-tip\n${json}\n\`\`\``

describe('parseFinTipDraft', () => {
  it('leest titel, beschrijving en acties uit een gefenced blok', () => {
    const draft = parseFinTipDraft(
      fence('{"title":"Slimmer boodschappen doen","description":"Je bespaart €90 per maand.","actions":["Vergelijk je supermarkt","Zet een weekbedrag"]}'),
    )
    expect(draft).toEqual({
      title: 'Slimmer boodschappen doen',
      description: 'Je bespaart €90 per maand.',
      actions: ['Vergelijk je supermarkt', 'Zet een weekbedrag'],
    })
  })

  it('negeert een preamble en <think>-blok vóór de fence', () => {
    const draft = parseFinTipDraft(
      `<think>even nadenken</think>\nHier is de tip:\n${fence('{"title":"T","description":"D","actions":["A"]}')}`,
    )
    expect(draft?.title).toBe('T')
  })

  it('pakt het LAATSTE blok — het model kan het voorbeeld uit de prompt echoën', () => {
    // De systeemprompt bevat zelf een fin-tip-voorbeeld over boodschappen. Een
    // parser die op het eerste blok matcht zou dat voorbeeld terugleveren bij
    // élke kandidaat.
    const echo = fence('{"title":"Meer overhouden aan je boodschappen","description":"Voorbeeld uit de prompt.","actions":["Voorbeeldactie"]}')
    const echt = fence('{"title":"Echte tip","description":"De echte beschrijving.","actions":["Echte actie"]}')
    const draft = parseFinTipDraft(`${echo}\n\n${echt}`)
    expect(draft?.title).toBe('Echte tip')
  })

  it('geeft null bij een afgekapt blok (geen sluiting) — nooit half-JSON bergen', () => {
    expect(parseFinTipDraft('```fin-tip\n{"title":"T","description":"D wordt afgek')).toBeNull()
  })

  it('geeft null bij onparsebare JSON in het blok', () => {
    expect(parseFinTipDraft(fence('{niet: json,,}'))).toBeNull()
  })

  it('bergt kale JSON zonder fence (salvage)', () => {
    const draft = parseFinTipDraft('{"title":"T","description":"D","actions":["A"]}')
    expect(draft?.description).toBe('D')
  })

  it('kapt af op maximaal 3 acties en tolereert {title}-objecten', () => {
    const draft = parseFinTipDraft(
      fence('{"title":"T","description":"D","actions":[{"title":"een"},"twee","drie","vier"]}'),
    )
    expect(draft?.actions).toEqual(['een', 'twee', 'drie'])
  })

  it('geeft null bij lege invoer', () => {
    expect(parseFinTipDraft('')).toBeNull()
  })
})

describe('resolveLocalTip — cijfer-guardrail', () => {
  it('neemt ALLE getallen uit de kandidaat en negeert getallen van het model', () => {
    // Het model probeert hier eigen bedragen mee te smokkelen als extra JSON-
    // VELDEN. Die staan niet in het contract en mogen nergens terechtkomen. De
    // proza zelf is netjes canoniek, zodat deze test puur de veld-guardrail pint
    // (de tekst-guard heeft zijn eigen blok hieronder).
    const draft = parseFinTipDraft(
      fence(
        '{"title":"Slimmer boodschappen","description":"Je bespaart €90 per maand.","actions":["Doe iets"],"euro_impact_monthly":9999,"euro_impact_yearly":99999,"freedom_days_per_year":999,"priority_score":1,"recommendation_type":"income_increase"}',
      ),
    )
    const tip = resolveLocalTip(draft, kandidaat())

    expect(tip).not.toBeNull()
    expect(tip?.euroImpactMonthly).toBe(90)
    expect(tip?.euroImpactYearly).toBe(1080)
    expect(tip?.freedomDaysPerYear).toBe(11)
    expect(tip?.priorityScore).toBe(5)
    expect(tip?.recommendationType).toBe('budget_optimization')
    expect(tip?.relatedBudgetSlug).toBe('boodschappen')
  })

  it('neemt de vrijheidsdagen 0 over wanneer de compliance-regel die op 0 zette', () => {
    // Niet-essentieel budget of andere retirement-methode → 0. Een tip die zich
    // aan de regel houdt (geen vrijheidsdagen-claim in de tekst) komt er wél
    // door, maar draagt het veld 0. Een tip die de claim tóch doet wordt
    // afgekeurd — dat is de aparte tekst-guard hieronder.
    const draft: RawFinTipDraft = {
      title: 'T',
      description: 'Zo bespaar je €1.080 per jaar richting je FIRE-doel.',
      actions: ['A'],
    }
    const tip = resolveLocalTip(draft, kandidaat({ vrijheidsdagen: 0, vrijheidsdagenToegestaan: false }))
    expect(tip?.freedomDaysPerYear).toBe(0)
  })

  it('FAIL-CLOSED: geen canonieke kandidaat → geen kaart', () => {
    const draft: RawFinTipDraft = { title: 'T', description: 'D', actions: ['A'] }
    expect(resolveLocalTip(draft, null)).toBeNull()
    expect(resolveLocalTip(draft, undefined)).toBeNull()
  })

  it('FAIL-CLOSED: geen geparst concept → geen kaart', () => {
    expect(resolveLocalTip(null, kandidaat())).toBeNull()
  })

  it('FAIL-CLOSED: geen beschrijving van het model → geen kaart', () => {
    // Zonder beschrijving zou de kaart volledig uit de kandidaat komen en tóch
    // als "door Fin geschreven" ogen.
    expect(resolveLocalTip({ title: 'T', description: null, actions: ['A'] }, kandidaat())).toBeNull()
  })

  it('valt terug op de canonieke titel wanneer het model er geen levert', () => {
    const tip = resolveLocalTip({ title: null, description: 'D', actions: ['A'] }, kandidaat())
    expect(tip?.title).toBe('Bespaar op Boodschappen')
  })

  it('valt terug op de titel als actie wanneer het model geen acties levert', () => {
    const tip = resolveLocalTip({ title: 'Mijn tip', description: 'D', actions: [] }, kandidaat())
    expect(tip?.actions).toEqual(['Mijn tip'])
  })

  it('draagt de kandidaat-id mee zodat de server de cijfers zelf kan her-afleiden', () => {
    const tip = resolveLocalTip({ title: 'T', description: 'D', actions: ['A'] }, kandidaat())
    expect(tip?.candidateId).toBe('budget:boodschappen')
  })
})

describe('resolveLocalTip — guardrail op de TEKST die de gebruiker leest', () => {
  it('laat de canonieke bedragen uit het KANS-blok gewoon door', () => {
    const tip = resolveLocalTip(
      {
        title: 'Slimmer boodschappen doen',
        description: 'Bespaar je €90 per maand, dan is dat €1.080 per jaar.',
        actions: ['Vergelijk je supermarkt'],
      },
      kandidaat(),
    )
    expect(tip).not.toBeNull()
  })

  it('keurt een tip af met een bedrag dat niet uit het KANS-blok komt', () => {
    // Het model heeft hier gerekend of verzonnen — fail-closed, geen kaart.
    const tip = resolveLocalTip(
      { title: 'T', description: 'Dit levert je €7.500 per jaar op.', actions: ['A'] },
      kandidaat(),
    )
    expect(tip).toBeNull()
  })

  it('keurt het geëchode promptvoorbeeld af bij een andere kandidaat', () => {
    // Realistische faalmodus: het model herhaalt het boodschappen-voorbeeld uit
    // LOCAL_RECOMMENDATIONS_DNA bij een jaarruimte-kans. De canonieke cijfers
    // zouden dan naast drie verzonnen bedragen op de kaart staan.
    const jaarruimte = kandidaat({
      id: 'tax:jaarruimte',
      bron: 'jaarruimte',
      titel: 'Benut je jaarruimte',
      besparingPerJaar: 2400,
      euroImpactMonthly: null,
      vrijheidsdagen: 0,
      vrijheidsdagenToegestaan: false,
      budgetSlug: null,
      type: 'asset_reallocation',
    })
    const tip = resolveLocalTip(
      {
        title: 'Meer overhouden aan je boodschappen',
        description:
          'Vergelijkbare huishoudens geven hier ~€520/maand uit. Bespaar je €90 per maand, dan bespaar je €1.080 per jaar richting je FIRE-doel.',
        actions: ['Vergelijk een week lang je vaste supermarkt'],
      },
      jaarruimte,
    )
    expect(tip).toBeNull()
  })

  it('keurt een vrijheidsdagen-claim af wanneer de compliance-regel die verbiedt', () => {
    // Het VELD staat al op 0; deze guard zorgt dat de ZIN de belofte ook niet doet.
    const zonder = kandidaat({ vrijheidsdagen: 0, vrijheidsdagenToegestaan: false })
    for (const description of [
      'Zo win je 45 vrijheidsdagen per jaar.',
      'Dat zijn 45 dagen vrijheid erbij.',
      'Je koopt er levenstijd mee terug.',
    ]) {
      expect(resolveLocalTip({ title: 'T', description, actions: ['A'] }, zonder)).toBeNull()
    }
  })

  it('laat een vrijheidsdagen-claim mét het canonieke aantal wél door', () => {
    const tip = resolveLocalTip(
      { title: 'T', description: 'Zo win je 11 vrijheidsdagen per jaar.', actions: ['A'] },
      kandidaat(),
    )
    expect(tip).not.toBeNull()
  })

  it('keurt een vrijheidsdagen-claim met een AFWIJKEND aantal af', () => {
    const tip = resolveLocalTip(
      { title: 'T', description: 'Zo win je 40 vrijheidsdagen per jaar.', actions: ['A'] },
      kandidaat(),
    )
    expect(tip).toBeNull()
  })

  it('kijkt óók naar de actietitels, niet alleen naar de beschrijving', () => {
    const tip = resolveLocalTip(
      { title: 'T', description: 'Bespaar €90 per maand.', actions: ['Zet €4.321 opzij'] },
      kandidaat(),
    )
    expect(tip).toBeNull()
  })
})

describe('distributeFreedomDays', () => {
  it('geeft de volle canonieke dagen aan de eerste actie en 0 aan de rest', () => {
    // De som mag nooit groter zijn dan de kans zelf waard is.
    expect(distributeFreedomDays(['een', 'twee', 'drie'], 11)).toEqual([
      { title: 'een', freedom_days_impact: 11 },
      { title: 'twee', freedom_days_impact: 0 },
      { title: 'drie', freedom_days_impact: 0 },
    ])
  })

  it('houdt 0 op 0', () => {
    expect(distributeFreedomDays(['een'], 0)).toEqual([{ title: 'een', freedom_days_impact: 0 }])
  })
})
