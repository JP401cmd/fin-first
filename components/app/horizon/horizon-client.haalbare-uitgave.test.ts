/**
 * Bron-grendel op de haalbare-uitgave-regel in de KPI-tegel "Na pensioen" én de
 * vierde-knop-bedrading eromheen (spec 2026-09-18). Wat we vastpinnen:
 *  1. beide layouts (desktop + mobiel) tonen de regel via DEZELFDE helper — geen tweede
 *     berekening, geen tweede formulering;
 *  2. de kleur komt uit de semantische tokens, in de LETTERLIJKE vorm (niet omgekeerd);
 *  3. de regel valt weg in huishoud-/partnerweergave (twee grondslagen niet mengen);
 *  4. de batch-uitkomst landt in state en wordt bij elke uitgang teruggezet;
 *  5. `hasScenario` telt de vierde knop mee — zonder die disjunct bereikt de override
 *     de hook nooit en is de rest decoratie (fix-ronde 1, review-bevinding "valkuil 1");
 *  6. `antwoorden` mapt de eigen `uitgave`-sleutel door naar `uitgave_na_pensioen`;
 *  7. de klik-handler zet de sliderstand (geen kale no-op meer);
 *  8. het doel-herstelpad ("Herstel mijn doel") en de doel-driftdetectie kennen de
 *     vierde knop óók — anders is een reset van "Terug naar basis" wél symmetrisch
 *     maar "Herstel mijn doel" niet (fix-ronde 1, review-bevinding 1).
 *
 * Elke assertie hieronder is met de hand geverifieerd: de bijbehorende regel
 * tijdelijk weghalen laat precies déze test roodlopen (zie task-7-report.md,
 * fix-ronde 1).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { uitgaveNaPensioenRange, UITGAVE_NA_PENSIOEN_STAP } from '@/lib/scenario-events'

const source = readFileSync(
  join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx'),
  'utf8',
)

/** Desktop-strip + mobiele strip. */
const LAYOUTS = 2

describe('haalbare uitgave — bron-grendel', () => {
  it('rendert de regel in beide KPI-layouts via één helper', () => {
    expect(source.match(/data-testid="haalbaar-bij-uitgave"/g) ?? []).toHaveLength(LAYOUTS)
    // Eén aanroep van de kopij-helper, hergebruikt in beide tegels.
    expect((source.match(/haalbaarBijUitgaveRegel\(/g) ?? []).length).toBe(1)
  })

  it('kleurt met de semantische tokens en niets anders', () => {
    const blokken = source.match(/data-testid="haalbaar-bij-uitgave"[\s\S]{0,400}/g) ?? []
    expect(blokken).toHaveLength(LAYOUTS)
    for (const b of blokken) {
      expect(b).toMatch(/haalbareUitgaveToon/)
      expect(b).not.toMatch(/text-(red|emerald|green|rose)-\d/)
      expect(b).not.toMatch(/#[0-9a-fA-F]{6}/)
    }
    // Letterlijke vorm — een losse `text-negative`/`text-positive`-substring-toets
    // (zoals eerder) matcht ook een OMGEKEERDE ternary (`'meer' ? negative : positive`).
    // Dit pint de exacte voorwaarde: 'minder' → negatief, al het andere → positief.
    expect(source).toMatch(
      /const haalbareUitgaveToon =\s*\n\s*haalbareUitgave\?\.richting === 'minder' \? 'text-negative' : 'text-positive'/,
    )
  })

  it('toont niets in huishoud-/partnerweergave', () => {
    expect((source.match(/!hasPerspectiveHero && haalbareUitgaveRegel/g) ?? [])).toHaveLength(LAYOUTS)
  })

  it('zet de batch-uitkomst in state én ruimt hem op bij ELKE uitgang', () => {
    expect(source).toMatch(/setHaalbareUitgave\(batch\.haalbareUitgave \?\? null\)/)
    // Drie opruimplekken: `.catch`, `yearlyExp <= 0` en `!presetBatchNodig` (task-7-brief
    // stap 3). Een losse `toMatch` bewijst alleen "≥1 voorkomen" en mist het als er twee
    // van de drie sneuvelen — vandaar de exacte telling.
    expect(source.match(/setHaalbareUitgave\(null\)/g) ?? []).toHaveLength(3)
  })

  it('geeft de override door aan de scenario-run', () => {
    expect(source).toMatch(/uitgaveNaPensioenPerJaar: scenarioUitgaveNaPensioen/)
  })

  it('hasScenario telt de vierde knop mee — anders bereikt de override de hook nooit', () => {
    // Anker op de hasScenario-declaratie zelf (niet een losse count elders in het
    // bestand): dit is de exacte regel die de override live schakelt.
    const match = source.match(
      /const hasScenario =\s*\n\s*scenarioSliderEvents\.length > 0 \|\|\s*\n\s*Object\.keys\(scenarioReturnDeltas\)\.length > 0 \|\|\s*\n\s*scenarioUitgaveNaPensioen != null/,
    )
    expect(match, 'hasScenario mist de scenarioUitgaveNaPensioen-disjunct').not.toBeNull()
  })

  it('de knop staat als derde in de vijf van het doelscenario (ADR 0170)', () => {
    // De antwoordregel met "Reken hiermee" verviel: de knop draagt zijn grens nu zelf
    // (`computeLabGrenzen`). Wat blijft is dát deze knop bestaat, met zijn basis uit
    // `haalbareUitgave` — één grondslag met de tegelregel erboven.
    const start = source.indexOf('const labKnoppen = useMemo')
    expect(start).toBeGreaterThan(-1)
    const blok = source.slice(start, source.indexOf('const labFormatters', start))
    expect(blok).toContain('out.uitgaveNaPensioen = {')
    expect(blok).toContain('basis: uitgaveNaPensioenBasis')
    expect(blok).toContain("grenzen: grens('uitgaveNaPensioen')")
  })

  it('"Herstel mijn doel" zet de knop terug UIT de stand (ADR 0170: hij reist nu mee)', () => {
    const start = source.indexOf('const handleDoelHerstellen = useCallback')
    expect(start).toBeGreaterThan(-1)
    const body = source.slice(start, source.indexOf('}, [doelBlok', start))
    // Vóór ADR 0170 kende `doel.stand` dit veld niet en viel herstel hard op `null` terug;
    // nu heeft "afwezig in de stand" één betekenis: wat het plan rekent. Sinds ADR 0175 loopt
    // de vertaling via `doelStandNaarLab` (gedeeld met het plan-stoplicht); dat die de
    // knoppen UIT de stand leest, pint `lib/horizon/doel-oordeel.test.ts`.
    expect(body).toContain('doelStandNaarLab(stand,')
    expect(body).toContain('setScenarioUitgaveNaPensioen(lab.uitgaveNaPensioen)')
    expect(body).toContain('setScenarioNalatenschap(lab.nalatenschap)')
  })

  it('de drift-detectie ziet de knop via de stand, niet via een losse noodgreep', () => {
    const start = source.indexOf('const conceptGewijzigd = useMemo')
    expect(start).toBeGreaterThan(-1)
    const body = source.slice(start, source.indexOf('}, [doelActief', start))
    // ADR 0170 — `buildLiveStand` draagt de knop nu zelf, dus de noodgreep ("elke actieve
    // override IS drift") is weg: een doel dát mét de knop is vastgelegd blijft nu terecht
    // "ongewijzigd" staan.
    expect(body).not.toContain('scenarioUitgaveNaPensioen != null ||')
    expect(body).toContain('isDoelConceptGewijzigd(buildLiveStandNow()')
    const standStart = source.indexOf('const buildLiveStandNow = useCallback')
    expect(source.slice(standStart, source.indexOf('const conceptGewijzigd', standStart))).toContain(
      'uitgaveNaPensioen: scenarioUitgaveNaPensioen',
    )
  })

  // ── F1 (eindreview 19 sep) — terugdraaien naar neutraal ondanks raster-afronding ──
  // `uitgaveNaPensioenRange` rondt `min` af op een veelvoud van € 600
  // (UITGAVE_NA_PENSIOEN_STAP), dus de bereikbare sliderstanden liggen op
  // `min + n·600`. De vorige `onChange` nulde de override alleen bij EXACTE
  // gelijkheid met de basis — maar die stand ligt daar zelden op. Een test met een
  // rastervriendelijke basis (zoals de bestaande Task 6-tests, allemaal 30.000)
  // bewijst niets: dát is precies hoe de bug ontsnapte. Deze test gebruikt daarom
  // het spec-rekenvoorbeeld zelf (basis € 38.640) om eerst aan te tonen dat de
  // stand structureel niet-bereikbaar is, en pint daarna dat de bron een
  // halve-stap-tolerantie gebruikt — geen exacte-gelijkheid-check meer.
  it('F1 — basis € 38.640 (spec-voorbeeld) ligt NIET op het bereikbare € 600-raster', () => {
    const basis = 38640
    const range = uitgaveNaPensioenRange(basis, basis)
    // De dichtstbijzijnde stand die de slider daadwerkelijk kan emitteren.
    const dichtstbijzijnde =
      range.min + Math.round((basis - range.min) / UITGAVE_NA_PENSIOEN_STAP) * UITGAVE_NA_PENSIOEN_STAP
    expect(dichtstbijzijnde).not.toBe(basis)
    expect(Math.abs(dichtstbijzijnde - basis)).toBeGreaterThan(0)
    expect(Math.abs(dichtstbijzijnde - basis)).toBeLessThan(UITGAVE_NA_PENSIOEN_STAP / 2)
  })

  it('F1 — de override valt terug op null binnen een halve sliderstap van de basis', () => {
    // Zonder deze tolerantie blijft `hasScenario` waar en blijft de opslaan-balk "gewijzigd"
    // melden nadat de gebruiker precies terugsleepte naar de dichtstbijzijnde bereikbare stand
    // (de test hierboven bewijst dat die stand vrijwel nooit exact de basis is).
    expect(source).toContain('Math.abs(v - uitgaveNaPensioenBasis) < UITGAVE_NA_PENSIOEN_STAP / 2 ? null : v')
    // De oude, te-strenge vorm (exacte gelijkheid) mag nergens meer voorkomen.
    expect(source).not.toMatch(/v === (haalbareUitgave\.huidigPerJaar|uitgaveNaPensioenBasis) \? null : v/)
  })

  // ── F2b (eindreview 19 sep) — tegelregel en antwoordknop komen/gaan samen ──
  it('F2b — de tegelregel verbergt zich mee onder "nu stoppen" (symmetrie met het onderdrukte antwoord)', () => {
    // `labAntwoordenPerKnop` onderdrukt het antwoord onder de knop al met
    // `isNuStoppenMode ? [] : labAntwoorden` (bestaande ADR 0145-regel, hierboven
    // gepind). Zonder dezelfde uitzondering op de tegelregel zou die wél
    // verschijnen terwijl het antwoord eronder is weggevallen.
    expect(source).toMatch(
      /const haalbareUitgaveRegel =\s*\n\s*!isNuStoppenMode && haalbareUitgave \? haalbaarBijUitgaveRegel\(haalbareUitgave, masked\) : null/,
    )
  })

  // ── F2a + F3 (eindreview 19 sep) — de vierde knop, grondslag en zichtbaarheid ──
  it('F2a — de zichtbaarheid van de knop hangt aan zijn grondslag, de sectie aan het perspectief', () => {
    // ADR 0170 — een knop bestaat zodra hij een bereik heeft; de perspectief-gate zit op de
    // sectie als geheel (`verkenSectieZichtbaar`, solo-weergave), niet meer per knop-prop.
    expect(source).toContain('if (uitgaveNaPensioenBasis > 0) {')
    expect(source).toContain('const verkenSectieZichtbaar')
  })

  it('F3 — de knop bestaat onafhankelijk van een opgelost antwoord (verkenning blijft mogelijk zonder vast stopmoment)', () => {
    // `haalbareUitgave` is `null` zodra het anker `solved` is (geen vast
    // stopmoment om tegen te solven) — maar de spec eist dat de knop dan als
    // VERKENNING bruikbaar blijft. De grondslag valt daarom terug op
    // `input?.yearlyMustExpenses`, dat ongeacht het anker bestaat.
    expect(source).toMatch(
      /const uitgaveNaPensioenBasis = haalbareUitgave\?\.huidigPerJaar \?\? input\?\.yearlyMustExpenses \?\? 0/,
    )
    // De oude vorm (het bestaan van de knop rechtstreeks gate'n op `haalbareUitgave`)
    // mag niet terugkomen.
    expect(source).not.toMatch(/uitgaveNaPensioen=\{\s*\n\s*haalbareUitgave\s*\n\s*\? \{/)
  })
})
