/**
 * glossary-data — datastructuur-toets op de jargonbron (bevinding S17).
 *
 * WAAROM DEZE VORM, EN NIET EEN VERBODEN-TERMENLIJST
 * De kaart stelde een "verboden-termenlijst per weergave" voor als borging.
 * Dat is bewust NIET gebouwd: een statische woordenlijst kan niet weten of een
 * treffer in Eenvoudig daadwerkelijk zíchtbaar is — dat hangt af van runtime-
 * `HideInSimple`-nesting — en geeft dus vals alarm precies op de oppervlakken
 * waar het jargon is toegestaan (Volledig, /beheer, de AI-prompts, de
 * DB-enums). Een gate die standaard vals alarm geeft, wordt uitgezet.
 *
 * Wat hier wél getoetst wordt is de DATASTRUCTUUR die de Eenvoudig-substitutie
 * voedt. Nieuw jargon kan alleen nog binnenkomen via een `GlossaryEntry`, en
 * die moet compleet en eenduidig zijn. Dat is mechanisch te controleren zonder
 * runtime-kennis — precies het onderscheid dat de eerdere audit als voorwaarde
 * stelde.
 */

import { describe, it, expect } from 'vitest'
import {
  GLOSSARY_ENTRIES,
  GLOSSARY,
  JARGON_VERTAALTABEL,
  getGlossaryAlternative,
} from './glossary-data'

const entries = Object.entries(GLOSSARY_ENTRIES)

describe('GLOSSARY_ENTRIES — volledigheid', () => {
  it('geeft elke entry een niet-lege naam, uitleg én toegankelijk alternatief', () => {
    const incompleet = entries.filter(
      ([, e]) =>
        !e.name?.trim() || !e.explanation?.trim() || !e.alternative?.trim(),
    )
    expect(incompleet.map(([k]) => k)).toEqual([])
  })

  it('houdt de uitleg leesbaar kort (maximaal 3 zinnen)', () => {
    const teLang = entries.filter(([, e]) => {
      // Punten in bedragen (€ 500.000) en afkortingen tellen niet als zinseinde:
      // alleen een punt gevolgd door spatie + hoofdletter, of het slot.
      const zinnen = e.explanation.split(/[.!?](?:\s+(?=[A-Z€])|\s*$)/).filter((s) => s.trim())
      return zinnen.length > 3
    })
    expect(teLang.map(([k]) => k)).toEqual([])
  })
})

describe('GLOSSARY_ENTRIES — sleutels zijn eenduidig', () => {
  /**
   * De concrete aanleiding: `SWR` naast `swr` en `FIRE` naast `fire`, elk met
   * een ándere `alternative` én een ándere `explanation`. components/future/
   * voorkeuren-view.tsx gebruikte béide casings — twee verschillende uitleg-
   * teksten voor hetzelfde begrip op één pagina.
   */
  it('kent geen twee sleutels die alleen in hoofdlettergebruik verschillen', () => {
    const gezien = new Map<string, string>()
    const dubbel: string[] = []
    for (const key of Object.keys(GLOSSARY_ENTRIES)) {
      const genormaliseerd = key.toLowerCase()
      const eerder = gezien.get(genormaliseerd)
      if (eerder) dubbel.push(`${eerder} ⇄ ${key}`)
      else gezien.set(genormaliseerd, key)
    }
    expect(dubbel).toEqual([])
  })

  it('kent geen twee sleutels met dezelfde weergavenaam', () => {
    const perNaam = new Map<string, string[]>()
    for (const [key, entry] of entries) {
      const naam = entry.name.toLowerCase()
      perNaam.set(naam, [...(perNaam.get(naam) ?? []), key])
    }
    const botsingen = [...perNaam.entries()].filter(([, keys]) => keys.length > 1)
    expect(botsingen).toEqual([])
  })

  it('houdt de opgeheven hoofdletter-sleutels weg', () => {
    expect(GLOSSARY_ENTRIES.SWR).toBeUndefined()
    expect(GLOSSARY_ENTRIES.FIRE).toBeUndefined()
    expect(GLOSSARY_ENTRIES.swr).toBeDefined()
    expect(GLOSSARY_ENTRIES.fire).toBeDefined()
  })
})

describe('simpleLabel — de Eenvoudig-substitutie', () => {
  it('is klein geschreven en een zinsdeel, geen titel', () => {
    // GlossaryTerm neemt de hoofdletter van het oorspronkelijke woord over; een
    // hoofdletter in de bron zou middenin een zin blijven staan.
    const fout = entries.filter(([, e]) => {
      if (!e.simpleLabel) return false
      const eerste = e.simpleLabel.charAt(0)
      return eerste !== eerste.toLowerCase()
    })
    expect(fout.map(([k]) => k)).toEqual([])
  })

  it('is nooit leeg en nooit gelijk aan de vakterm zelf', () => {
    const fout = entries.filter(
      ([, e]) =>
        e.simpleLabel !== undefined &&
        (!e.simpleLabel.trim() ||
          e.simpleLabel.toLowerCase() === e.name.toLowerCase()),
    )
    expect(fout.map(([k]) => k)).toEqual([])
  })

  it('vervangt de vier A-rij-termen van S17', () => {
    expect(GLOSSARY_ENTRIES.avalanche?.simpleLabel).toBe('duurste schuld eerst')
    expect(GLOSSARY_ENTRIES.schuldgraad?.simpleLabel).toBe(
      'schuldenlast ten opzichte van je bezit',
    )
    expect(GLOSSARY_ENTRIES.vervreemdingswinst?.simpleLabel).toBe(
      'winst bij verkoop van je aandeel',
    )
    expect(GLOSSARY_ENTRIES.fire?.simpleLabel).toBe('volledige vrijheid')
  })

  it('laat wettelijke termen bewust staan — die krijgen uitleg, geen vervanging', () => {
    // Kaartregel: "wettelijke termen mógen — mét ene-zin-uitleg ter plekke".
    for (const key of ['box_3', 'heffingsvrij_vermogen', 'forfaitair_rendement', 'tegenbewijs']) {
      expect(GLOSSARY_ENTRIES[key]?.simpleLabel, key).toBeUndefined()
      expect(GLOSSARY_ENTRIES[key]?.explanation.trim().length, key).toBeGreaterThan(0)
    }
  })
})

describe('inhoudelijke grenzen (S17)', () => {
  it('koppelt het inclusiepercentage aan netto vermogen, niet aan vrijheid', () => {
    // Grondslagfout-vangrail: dit percentage weegt het NETTO VERMOGEN (incl.
    // niet-liquide bezit), niet de FIRE-eligible/liquide pot. CLAUDE.md
    // verbiedt die menging; een eerdere deck-tekst was hier al eens onwaar.
    const entry = GLOSSARY_ENTRIES.inclusiepercentage!
    expect(entry.alternative.toLowerCase()).toContain('netto vermogen')
    expect(entry.explanation.toLowerCase()).toContain('netto vermogen')
    expect(`${entry.alternative} ${entry.explanation}`.toLowerCase()).not.toContain('vrijheid')
  })

  it('houdt de tegenbewijs-uitleg beschrijvend — geen gebiedende wijs (Wft)', () => {
    const uitleg = GLOSSARY_ENTRIES.tegenbewijs!.explanation.toLowerCase()
    // Uitleggen hóé het werkt mag; een persoonlijke instructie om een fiscale
    // regeling in te roepen is advies.
    expect(uitleg).not.toMatch(/\bbetaal daarover\b|\blever tegenbewijs\b|\blaat zien wat je/)
    expect(uitleg).toContain('mag')
  })

  it('beschrijft SWR als mogelijkheid, niet als feit', () => {
    // De motor onderscheidt de INGESTELDE van de IMPLICIETE opnamevoet, en bij
    // teren-op-vermogen is er geen vaste voet. "Wat je jaarlijks opneemt" zou
    // het label onwaar maken zodra de gebruiker een vaste SWR instelt.
    expect(GLOSSARY_ENTRIES.swr!.alternative.toLowerCase()).toContain('kunt opnemen')
    expect(GLOSSARY_ENTRIES.swr!.explanation.toLowerCase()).toContain('kunt opnemen')
  })
})

describe('afgeleide tabellen blijven in de pas', () => {
  it('dekt JARGON_VERTAALTABEL alle sleutels', () => {
    expect(Object.keys(JARGON_VERTAALTABEL).sort()).toEqual(Object.keys(GLOSSARY_ENTRIES).sort())
    expect(getGlossaryAlternative('swr')).toBe(GLOSSARY_ENTRIES.swr!.alternative)
  })

  it('dekt GLOSSARY alle sleutels met hun uitleg', () => {
    expect(Object.keys(GLOSSARY).sort()).toEqual(Object.keys(GLOSSARY_ENTRIES).sort())
  })
})

describe('UR3-13 — glossary sluitend (F1)', () => {
  it('kent noodfonds (hernoemd van noodreserve) en niet meer de oude sleutel', () => {
    // Het scherm zegt overal "noodfonds"; de oude sleutel "noodreserve" liet
    // zich vanaf die tekst niet vinden (vier namen voor één pot).
    expect(GLOSSARY_ENTRIES.noodreserve).toBeUndefined()
    expect(GLOSSARY_ENTRIES.noodfonds?.explanation.length).toBeGreaterThan(0)
  })

  it('geeft elke gemeten term uit de heuristische audit een entry', () => {
    // De 7 gemeten (+3 bijvangst) termen uit UR3-13 §2a — P40–P60 is bewust
    // geen losse entry (zelfde begrip als bandbreedte, geen duplicaat).
    for (const key of [
      'bandbreedte',
      'jaarruimte',
      'franchise',
      'aanmerkelijk_belang',
      'forecast',
      'optimizer',
      'ISIN',
      'YTD',
      'middelloon',
      'omslagpunt',
    ]) {
      expect(GLOSSARY_ENTRIES[key]?.explanation.length, key).toBeGreaterThan(0)
    }
  })

  it('geeft ISIN bewust geen simpleLabel — het is een code, geen vervangbaar woord', () => {
    expect(GLOSSARY_ENTRIES.ISIN?.simpleLabel).toBeUndefined()
  })

  it('geeft franchise en aanmerkelijk belang geen simpleLabel — wettelijke termen (S17)', () => {
    expect(GLOSSARY_ENTRIES.franchise?.simpleLabel).toBeUndefined()
    expect(GLOSSARY_ENTRIES.aanmerkelijk_belang?.simpleLabel).toBeUndefined()
  })

  it('breidt de S17 A-rij simpleLabels uit met de §4-optie-A-lijst', () => {
    const verwacht: Record<string, string> = {
      SORR: 'volgorderisico',
      Monte_Carlo: 'marktcheck',
      LTV: 'schuld ten opzichte van je woningwaarde',
      ETF: 'beursgenoteerd beleggingsfonds',
      ter: 'beheerkosten van een fonds',
      vpw: 'leeftijd-afhankelijke opname',
      upo: 'pensioenoverzicht',
      psd2: 'bankkoppeling',
      YTD: 'dit jaar',
      compounding: 'rente op rente',
      rebalancing: 'herbalanceren',
      guardrails: 'vangrails-strategie',
      bucket: 'potjes-strategie',
    }
    for (const [key, label] of Object.entries(verwacht)) {
      expect(GLOSSARY_ENTRIES[key]?.simpleLabel, key).toBe(label)
    }
  })
})
