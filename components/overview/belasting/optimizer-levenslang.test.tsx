import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * De worker-aanroep is het enige dat we mocken: `runVariantenSweepAsync` draait
 * in productie DRIE kernel-solves, en die horen niet in een component-test. De
 * uitkomst die we teruggeven gaat wél eerst door de CANONIEKE
 * `finaliseerVarianten` — zo pinnen de tests de weergave tegen de echte
 * diskwalificatie- en winnaar-regels (`bepaalDiskwalificatie`/`kiesWinnaar`),
 * niet tegen een met de hand gekozen winnaar.
 */
const mockSweep = vi.fn()
vi.mock('@/lib/horizon-kernel/worker/run-in-worker', () => ({
  runVariantenSweepAsync: (...args: unknown[]) => mockSweep(...args),
}))

import { OptimizerLevenslang } from './optimizer-levenslang'
import { formatCurrency } from '@/lib/format'
import {
  finaliseerVarianten,
  REFERENTIE_VARIANT_ID,
  type VariantId,
  type VariantUitkomst,
  type VariantenSweepSnapshot,
} from '@/lib/tax-lifetime/varianten-sweep'

/**
 * nl-NL-currency gebruikt een non-breaking space tussen € en het bedrag; de
 * whitespace-normalizer van testing-library maakt daar een gewone spatie van.
 * Match daarom op een regex i.p.v. de exacte string (idioom uit
 * optimizer-client.test.tsx).
 */
function euroPattern(amount: number): RegExp {
  const digits = Math.round(amount).toLocaleString('nl-NL').replace(/\./g, '\\.')
  return new RegExp(`€\\s*${digits}`)
}

const DAILY_EXPENSES = 100
const fc = (v: number) => formatCurrency(v)

/** Minimale, serialiseerbare snapshot — inhoud doet er niet toe (worker gemockt). */
const SNAPSHOT = {
  rawContext: { profile: { id: 'p1' }, assets: [], debts: [], events: [], aowRows: [] },
  aowLeeftijd: 67.25,
} as unknown as VariantenSweepSnapshot

const mockFetch = vi.fn()

beforeEach(() => {
  mockSweep.mockReset()
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ snapshot: SNAPSHOT }),
  } as unknown as Response)
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function ruw(
  id: VariantId,
  label: string,
  v: {
    box3: number
    box1: number
    fire: number | null
    belegbaar: number
    netto: number
    buffer: number
  },
): VariantUitkomst {
  return {
    id,
    label,
    onttrekkingOverlay: id === REFERENTIE_VARIANT_ID ? null : { Pensioen: 5 },
    isReferentie: id === REFERENTIE_VARIANT_ID,
    levenslangeBox3Nominaal: v.box3,
    levenslangeBox1NietVerrekendNominaal: v.box1,
    levenslangeTotaleDrukNominaal: v.box3 + v.box1,
    fireAgeFractional: v.fire,
    eindvermogenNettoNominaal: v.netto,
    eindvermogenBelegbaarNominaal: v.belegbaar,
    laagsteBuffer: { bedrag: v.buffer, age: 72 },
    diskwalificatie: null,
    kernelFout: null,
  }
}

/**
 * Fixture met een BEWUSTE spanning: de goedkoopste variant op de belasting-as
 * (pensioen vroeg, € 138.000) zet FIRE later en wordt daarom door de canonieke
 * regel gediskwalificeerd; de winnaar is de op één na goedkoopste. Zo bewijzen
 * de tests dat de badge de motor volgt en niet "het laagste getal".
 */
function fixture() {
  const ruwe = [
    ruw('huidige-volgorde', 'Jouw huidige volgorde', {
      box3: 120_000,
      box1: 40_000,
      fire: 58,
      belegbaar: 250_000,
      netto: 600_000,
      buffer: 30_000,
    }),
    ruw('pensioen-laatst', 'Pensioen zo laat mogelijk', {
      box3: 132_000,
      box1: 22_000,
      fire: 58,
      belegbaar: 280_000,
      netto: 640_000,
      buffer: 25_000,
    }),
    ruw('pensioen-eerst', 'Pensioen vroeg', {
      box3: 100_000,
      box1: 38_000,
      fire: 61,
      belegbaar: 190_000,
      netto: 540_000,
      buffer: 12_000,
    }),
  ]
  const resultaat = finaliseerVarianten(ruwe, 2026)

  // Meet vóór je assert: de canonieke laag moet deze spanning ook echt zo
  // beslissen, anders bewijzen de assertions hieronder niets.
  expect(resultaat.winnaarId).toBe('pensioen-laatst')
  expect(resultaat.varianten.find((v) => v.id === 'pensioen-eerst')?.diskwalificatie).toBe(
    'fire-later-dan-referentie',
  )
  return resultaat
}

function renderSectie(dailyExpenses = DAILY_EXPENSES) {
  return render(<OptimizerLevenslang fc={fc} dailyExpenses={dailyExpenses} />)
}

function startKnop() {
  return screen.getByRole('button', { name: /Reken de drie varianten door/i })
}

/** De kolom (`th`) van één variant. */
function kolom(label: string): HTMLElement {
  const th = screen.getByText(label).closest('th')
  if (!th) throw new Error(`fixture-fout: geen kolomkop voor "${label}"`)
  return th as HTMLElement
}

describe('OptimizerLevenslang — vóór de klik rekent er niets', () => {
  it('toont de uitnodiging en start geen enkele berekening', () => {
    renderSectie()

    expect(screen.getByText(/Reken door wat de plek van je pensioenpot doet/i)).toBeTruthy()
    expect(startKnop()).toBeTruthy()
    // Niets aangeroepen: geen snapshot-fetch en geen kernel-solves.
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockSweep).not.toHaveBeenCalled()
    // En dus ook geen tabel.
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('draagt de versmalde, eerlijke kop en deck — geen "laagste belastingdruk van je leven"', () => {
    renderSectie()

    const kop = screen.getByRole('heading', { level: 2 })
    expect(kop.textContent).toMatch(/Wanneer je je pensioenpot\s*aanspreekt/i)
    // Het deck moet de eerste tabelrij ("Box 3, opgeteld") niet tegenspreken:
    // spaargeld en beleggingen zijn niet onbelast, ze lopen via box 3.
    expect(screen.getByText(/Je pensioen wordt belast als inkomen/i)).toBeTruthy()
    expect(screen.getByText(/je spaargeld en beleggingen via box 3/i)).toBeTruthy()
    expect(screen.queryByText(/je spaargeld niet\./i)).toBeNull()
    expect(screen.queryByText(/laagste belastingdruk over je hele leven/i)).toBeNull()
  })
})

describe('OptimizerLevenslang — na de klik', () => {
  it('toont de drie varianten met de GELEVERDE waarden', async () => {
    const resultaat = fixture()
    mockSweep.mockResolvedValue(resultaat)
    renderSectie()

    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    expect(mockFetch).toHaveBeenCalledWith('/api/belasting/varianten-sweep')
    expect(mockSweep).toHaveBeenCalledTimes(1)

    for (const v of resultaat.varianten) {
      expect(screen.getAllByText(v.label).length).toBeGreaterThan(0)
      // Totale druk, de splitsing Box 3 / Box 1 en de FIRE-leeftijd — allemaal
      // exact de geleverde velden, geen client-side afleiding.
      expect(screen.getAllByText(euroPattern(v.levenslangeTotaleDrukNominaal!)).length).toBeGreaterThan(0)
      expect(screen.getAllByText(euroPattern(v.levenslangeBox3Nominaal!)).length).toBeGreaterThan(0)
      expect(
        screen.getAllByText(euroPattern(v.levenslangeBox1NietVerrekendNominaal!)).length,
      ).toBeGreaterThan(0)
    }
    expect(screen.getAllByText('58 jaar').length).toBeGreaterThan(0)
    expect(screen.getByText('61 jaar')).toBeTruthy()
    expect(screen.getByText('Box 3, opgeteld')).toBeTruthy()
    expect(screen.getByText(/Box 1 die de cashflow niet inhield/i)).toBeTruthy()
  })

  it('zet de winnaar-badge op winnaarId — niet op het laagste getal', async () => {
    const resultaat = fixture()
    mockSweep.mockResolvedValue(resultaat)
    renderSectie()

    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    // Precies één badge, en die staat in de kolom van winnaarId.
    const badges = screen.getAllByText('laagste druk')
    expect(badges.length).toBe(1)
    expect(within(kolom('Pensioen zo laat mogelijk')).getByText('laagste druk')).toBeTruthy()
    // De goedkoopste variant op de belasting-as krijgt hem NIET.
    expect(within(kolom('Pensioen vroeg')).queryByText('laagste druk')).toBeNull()
    // De referentie is als zodanig gemarkeerd.
    expect(within(kolom('Jouw huidige volgorde')).getByText('je huidige volgorde')).toBeTruthy()
  })

  it('toont bij een gediskwalificeerde variant de reden, zonder badge', async () => {
    const resultaat = fixture()
    mockSweep.mockResolvedValue(resultaat)
    renderSectie()

    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    const gediskwalificeerd = kolom('Pensioen vroeg')
    expect(gediskwalificeerd.textContent).toMatch(/Telt niet mee/i)
    expect(gediskwalificeerd.textContent).toMatch(/FIRE-moment valt later/i)
    expect(within(gediskwalificeerd).queryByText('laagste druk')).toBeNull()
  })

  it('toont bij een uitgeputte buffer die reden (en geen badge)', async () => {
    const ruwe = [
      ruw('huidige-volgorde', 'Jouw huidige volgorde', {
        box3: 120_000,
        box1: 40_000,
        fire: 58,
        belegbaar: 250_000,
        netto: 600_000,
        buffer: 30_000,
      }),
      ruw('pensioen-laatst', 'Pensioen zo laat mogelijk', {
        box3: 60_000,
        box1: 20_000,
        fire: 57,
        belegbaar: 0,
        // €0 = uitgeput. Bewust niet negatief: dát is de stand die de kern écht
        // oplevert (een tekort landt als Tekort-lening, niet als negatief bezit).
        buffer: 0,
        netto: 300_000,
      }),
    ]
    const resultaat = finaliseerVarianten(ruwe, 2026)
    expect(resultaat.varianten[1].diskwalificatie).toBe('buffer-uitgeput')
    expect(resultaat.winnaarId).toBe('huidige-volgorde')

    mockSweep.mockResolvedValue(resultaat)
    renderSectie()
    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    const kol = kolom('Pensioen zo laat mogelijk')
    expect(kol.textContent).toMatch(/belegbaar vermogen raakt onderweg op/i)
    expect(within(kol).queryByText('laagste druk')).toBeNull()
  })

  it('toont bij elke variant het eindvermogen — op ÉÉN benoemde grondslag', async () => {
    const resultaat = fixture()
    mockSweep.mockResolvedValue(resultaat)
    renderSectie()

    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    const rij = screen.getByText(/Belegbaar vermogen aan het eind/i).closest('tr')
    expect(rij).toBeTruthy()
    expect(rij!.textContent).toMatch(/zonder je huis en ander niet-liquide bezit/i)
    for (const v of resultaat.varianten) {
      expect(rij!.textContent).toMatch(euroPattern(v.eindvermogenBelegbaarNominaal!))
    }
    // De tweede grondslag (netto incl. niet-liquide bezit) staat NERGENS in de
    // tabel — twee vermogensgrondslagen mogen niet op één as belanden.
    for (const v of resultaat.varianten) {
      expect(screen.queryAllByText(euroPattern(v.eindvermogenNettoNominaal!)).length).toBe(0)
    }
  })

  it('vertaalt het verschil met de referentie naar vrijheidstijd', async () => {
    const resultaat = fixture()
    mockSweep.mockResolvedValue(resultaat)
    renderSectie()

    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    // 154.000 − 160.000 = 6.000 minder; bij € 100/dag = 60 dagen = 2 maanden.
    const euroRij = screen.getByText(/In euro’s, over je hele looptijd/).closest('tr')
    expect(euroRij!.textContent).toMatch(euroPattern(6_000))
    expect(euroRij!.textContent).toMatch(/minder/)
    const tijdRij = screen.getByText(/tegen je dagtarief van vandaag/i).closest('tr')
    expect(tijdRij!.textContent).toMatch(/In vrijheidstijd/i)
    expect(tijdRij!.textContent).toMatch(/2 maanden meer vrijheid/i)
    // Wft: het is een verschil tussen indicaties, geen belofte van besparing.
    expect(screen.queryByText(/je bespaart/i)).toBeNull()
  })

  it('laat de vrijheidstijd-vertaling weg zonder bekend dagtarief', async () => {
    const resultaat = fixture()
    mockSweep.mockResolvedValue(resultaat)
    renderSectie(0)

    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    // Geen eigen dag-conversie verzinnen: liever niets dan een "∞"-regel.
    expect(screen.queryByText(/vrijheid$/i)).toBeNull()
    expect(screen.queryByText(/∞/)).toBeNull()
  })

  it('toont de zes kanttekeningen, met het gebruikte Box 1-jaar', async () => {
    const resultaat = fixture()
    mockSweep.mockResolvedValue(resultaat)
    renderSectie()

    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    const lijst = screen.getByText('Kanttekeningen').parentElement!.querySelector('ul')
    expect(lijst).toBeTruthy()
    expect(lijst!.querySelectorAll('li').length).toBe(6)
    const tekst = lijst!.textContent ?? ''
    expect(tekst).toMatch(/náást de projectie, niet erin/i)
    expect(tekst).toMatch(/gewogen gelijktijdige opname/i)
    expect(tekst).toMatch(/Lijfrente is niet apart te sturen/i)
    expect(tekst).toMatch(/Box 1 is per persoon/i)
    expect(tekst).toMatch(new RegExp(`schijven en heffingskortingen zijn die van ${resultaat.box1Jaar}`, 'i'))
    // De zesde: de arbeidskorting-afwijking stuurt de rangschikking (het effect is
    // het grootst vóór de AOW), dus die hoort de lezer te zien — mét beide kanten,
    // want de afwijking is niet systematisch één kant op.
    expect(tekst).toMatch(/arbeidskorting nu ook toe over pensioeninkomen/i)
    expect(tekst).toMatch(/vóór je AOW/i)
    expect(tekst).toMatch(/te hoog/i)
  })

  it('memoïseert op de invoer-hash: een tweede klik rekent niet opnieuw', async () => {
    const resultaat = fixture()
    mockSweep.mockResolvedValue(resultaat)
    renderSectie()

    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())
    expect(mockSweep).toHaveBeenCalledTimes(1)

    // Er is na de uitkomst geen start-knop meer; forceer een tweede ronde door
    // de sectie opnieuw te renderen zou de memo wissen (component-scoped, per
    // opzet). Dus toetsen we de memo op de gemounte instantie: de worker is en
    // blijft precies één keer aangeroepen en de snapshot één keer opgehaald.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Reken de drie varianten door/i })).toBeNull()
  })
})

describe('OptimizerLevenslang — laad- en foutstaten', () => {
  it('toont een skeleton-laadstaat zolang de sweep loopt', async () => {
    const resultaat = fixture()
    let los: (r: unknown) => void = () => {}
    mockSweep.mockImplementation(() => new Promise((r) => (los = r)))
    renderSectie()

    fireEvent.click(startKnop())

    await waitFor(() => expect(screen.getByText('Bezig met doorrekenen')).toBeTruthy())
    const bezig = screen.getByText('Bezig met doorrekenen').closest('div[aria-busy="true"]')
    expect(bezig).toBeTruthy()
    // Skeleton, geen spinner ernaast gestapeld.
    expect(bezig!.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.getByRole('status').textContent).toMatch(/Bezig met doorrekenen/i)

    los(resultaat)
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())
    expect(screen.queryByText('Bezig met doorrekenen')).toBeNull()
  })

  it('toont een foutstaat met herkansing wanneer de worker null teruggeeft', async () => {
    mockSweep.mockResolvedValue(null)
    renderSectie()

    fireEvent.click(startKnop())

    await waitFor(() => expect(screen.getByText(/Er ging iets mis bij het doorrekenen/i)).toBeTruthy())
    expect(screen.queryByRole('table')).toBeNull()
    const opnieuw = screen.getByRole('button', { name: /Opnieuw proberen/i })
    expect(opnieuw).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/niet gelukt/i)

    // Herkansing: dezelfde snapshot, dus geen tweede fetch — wél een tweede solve.
    mockSweep.mockResolvedValue(fixture())
    fireEvent.click(opnieuw)
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockSweep).toHaveBeenCalledTimes(2)
  })

  it('toont een foutstaat wanneer élke variant een kernelFout draagt', async () => {
    const kapot = finaliseerVarianten(
      [
        {
          ...ruw('huidige-volgorde', 'Jouw huidige volgorde', {
            box3: 0,
            box1: 0,
            fire: null,
            belegbaar: 0,
            netto: 0,
            buffer: 0,
          }),
          levenslangeBox3Nominaal: null,
          levenslangeBox1NietVerrekendNominaal: null,
          levenslangeTotaleDrukNominaal: null,
          eindvermogenBelegbaarNominaal: null,
          eindvermogenNettoNominaal: null,
          laagsteBuffer: null,
          kernelFout: 'kernel leverde geen jaarrijen',
        },
      ],
      2026,
    )
    mockSweep.mockResolvedValue(kapot)
    renderSectie()

    fireEvent.click(startKnop())

    await waitFor(() => expect(screen.getByText(/Er ging iets mis bij het doorrekenen/i)).toBeTruthy())
    expect(screen.queryByRole('table')).toBeNull()
  })

  /**
   * Z1 — de GEMENGDE staat: één variant faalt terwijl de rest slaagt. Die haalt de
   * tabel wél (de foutstaat vereist dat élke variant faalt), en zonder de kern-fout-
   * uitgang in `bepaalDiskwalificatie` zette de kolomkop twee boodschappen naast
   * elkaar: "je FIRE-moment valt later dan nu" én "niet doorgerekend voor jouw
   * plan" — een feitelijke uitspraak over een run die nooit heeft gedraaid.
   */
  it('een variant met kern-fout toont ENKEL "niet doorgerekend", geen FIRE-uitspraak', async () => {
    const gemengd = finaliseerVarianten(
      [
        ruw('huidige-volgorde', 'Jouw huidige volgorde', {
          box3: 120_000,
          box1: 40_000,
          fire: 58,
          belegbaar: 250_000,
          netto: 600_000,
          buffer: 30_000,
        }),
        {
          ...ruw('pensioen-laatst', 'Pensioen zo laat mogelijk', {
            box3: 0,
            box1: 0,
            fire: null,
            belegbaar: 0,
            netto: 0,
            buffer: 0,
          }),
          levenslangeBox3Nominaal: null,
          levenslangeBox1NietVerrekendNominaal: null,
          levenslangeTotaleDrukNominaal: null,
          eindvermogenBelegbaarNominaal: null,
          eindvermogenNettoNominaal: null,
          laagsteBuffer: null,
          kernelFout: 'kernel leverde geen jaarrijen',
        },
      ],
      2026,
    )
    expect(gemengd.varianten[1].diskwalificatie).toBeNull()

    mockSweep.mockResolvedValue(gemengd)
    renderSectie()
    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    const kol = kolom('Pensioen zo laat mogelijk')
    expect(kol.textContent).toMatch(/Niet doorgerekend voor jouw plan/i)
    expect(kol.textContent).not.toMatch(/Telt niet mee/i)
    expect(kol.textContent).not.toMatch(/FIRE-moment valt later/i)
    // De geslaagde referentie blijft gewoon de winnaar.
    expect(gemengd.winnaarId).toBe('huidige-volgorde')
  })

  it('toont bij een ontbrekend toekomstplan een lege staat met uitgang, geen fout', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ snapshot: null }),
    } as unknown as Response)
    renderSectie()

    fireEvent.click(startKnop())

    await waitFor(() => expect(screen.getByText(/rekent op je toekomstplan/i)).toBeTruthy())
    expect(mockSweep).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /Naar je toekomstplan/i }).getAttribute('href')).toBe(
      '/toekomst/voorkeuren',
    )
  })

  it('toont een foutstaat wanneer de snapshot-route faalt', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Er ging iets mis. Probeer het later opnieuw.' }),
    } as unknown as Response)
    renderSectie()

    fireEvent.click(startKnop())

    await waitFor(() => expect(screen.getByText(/Er ging iets mis bij het doorrekenen/i)).toBeTruthy())
    expect(mockSweep).not.toHaveBeenCalled()
  })
})

describe('OptimizerLevenslang — privacy-maskering', () => {
  it('laat élk bedrag door de geleverde fc-maskering lopen', async () => {
    const resultaat = fixture()
    mockSweep.mockResolvedValue(resultaat)
    render(<OptimizerLevenslang fc={() => '••••••'} dailyExpenses={DAILY_EXPENSES} />)

    fireEvent.click(startKnop())
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

    const tabel = screen.getByRole('table')
    expect(tabel.textContent).toContain('••••••')
    // Geen enkel €-teken: alle bedragen in deze tabel komen uitsluitend via `fc`.
    expect(tabel.textContent).not.toContain('€')
  })
})
