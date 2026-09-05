import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Borgt de standaardinstellingen voor nieuwe gebruikers (Notion-kaart "new user
 * standaard instellingen"): bij onboarding worden vier horizon-voorkeuren
 * expliciet actief weggeschreven — op BEIDE resterende write-plekken in de
 * onboarding-route:
 *   1. de `buildRpcPayload`-referentie (behouden als payload-vorm-documentatie
 *      nadat de RPC is gedeprecate — zie "Na deploy issues" / probleem 4),
 *   2. het multi-step save-pad (sinds Keuze B het primaire pad).
 *
 * De vier defaults:
 *   - Eigen woning: verkopen wanneer nodig, op basis van marktwaarde
 *     (`{ mode: 'downsize', trigger: 'on_depletion', saleValuationBasis: 'market' }`).
 *     Vervangt de eerdere `exclude_from_fire`-default; `parseHousingStrategy`
 *     vult de overige velden met `DEFAULT_DOWNSIZE_CONFIG`.
 *   - Onttrekkingsprofiel: afnemend (`withdrawal_profile_config.profiel`), met
 *     de enum-spiegel `withdrawal_strategy = 'static'` (mapping afnemend→static).
 *   - Verdeling bij toename: naar beleggen (`pot_rules.surplus_group`).
 *   - Eindstrategie deplete/90 blijft via de bestaande ?? fallbacks — een
 *     expliciete gebruikerskeuze in de horizon-stap wint en wordt hier niet
 *     geforceerd, dus die assertie hoort niet in deze bron-scan thuis.
 *
 * Deze test scant de bronregels (commentaar gestript) i.p.v. de hele
 * Next.js-handler te importeren — die trekt de AI-extractielaag mee. Zo is de
 * assertie op de write-VALUES robuust en zonder zware afhankelijkheden.
 *
 * Bewust NIET geborgd hier: `DEFAULT_HOUSING_STRATEGY` (resolver-fallback) en de
 * DB-kolom-default blijven `include_full` — die worden door hun eigen tests
 * bewaakt (`test/housing-strategy.test.ts`). Bestaande accounts blijven dus
 * ongemoeid; alleen verse onboardings schrijven de nieuwe defaults.
 */
describe('onboarding save-own-data — standaardinstellingen nieuwe gebruiker', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  // CRLF-veilig: op een verse Windows-checkout gaat de regelgebaseerde strip
  // hieronder stil kapot zonder normalisatie (zie lib/test-utils/read-source.ts).
  const source = readSourceLF(routePath)

  // Strip line- en block-commentaar zodat we alleen écht uitgevoerde code zien.
  // (De comments noemen bewust óók de oude/fallback-waarden voor de uitleg.)
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('schrijft op beide write-plekken housing = downsize/on_depletion/market', () => {
    const writes =
      codeOnly.match(/housing_strategy_config[^=:]*[=:]\s*\{\s*mode:\s*'([a-z_]+)'/g) ?? []

    // Precies twee expliciete writes: de buildRpcPayload-referentie en het
    // multi-step pad. De post-RPC update verviel met de gedeprecate RPC-tak.
    expect(writes).toHaveLength(2)
    for (const write of writes) {
      expect(write).toContain("mode: 'downsize'")
    }
    // Trigger + waarderingsbasis staan naast de mode op dezelfde write-plekken.
    const onDepletion = codeOnly.match(/housing_strategy_config[^=:]*[=:][^}]*trigger:\s*'on_depletion'/g) ?? []
    expect(onDepletion).toHaveLength(2)
    const marketBasis = codeOnly.match(/housing_strategy_config[^=:]*[=:][^}]*saleValuationBasis:\s*'market'/g) ?? []
    expect(marketBasis).toHaveLength(2)
  })

  it('schrijft nergens (in uitgevoerde code) nog exclude_from_fire of include_full als onboarding-default', () => {
    expect(codeOnly).not.toContain("housing_strategy_config: { mode: 'exclude_from_fire' }")
    expect(codeOnly).not.toContain("housing_strategy_config = { mode: 'exclude_from_fire' }")
    expect(codeOnly).not.toContain("housing_strategy_config: { mode: 'include_full' }")
    expect(codeOnly).not.toContain("housing_strategy_config = { mode: 'include_full' }")
  })

  it('schrijft onttrekkingsprofiel = afnemend (met static enum-spiegel)', () => {
    expect(codeOnly).toContain("profiel: 'afnemend'")
    expect(codeOnly).toContain("withdrawal_strategy")
    // De enum-spiegel is 'static' (mapping vast/afnemend/oplopend → static).
    const staticEnum = codeOnly.match(/withdrawal_strategy[^=:]*[=:]\s*'static'/g) ?? []
    expect(staticEnum.length).toBeGreaterThanOrEqual(1)
  })

  it('schrijft verdeling-bij-toename = beleggen (pot_rules.surplus_group)', () => {
    const surplus = codeOnly.match(/surplus_group:\s*'([a-z_]+)'/g) ?? []
    expect(surplus.length).toBeGreaterThanOrEqual(1)
    for (const write of surplus) {
      expect(write).toContain("surplus_group: 'beleggingen'")
    }
  })
})

/**
 * Borgt het plan uit de onboarding-stap "Jouw plan" (ADR 0129, 5 sep 2026): de stap
 * stuurt eind-vorm + stop-anker via horizonData; de route lost beide ÉÉN keer op via
 * `resolveOnboardingPlanColumns` (lib/onboarding-plan.ts — de gedragstests van de
 * mapping staan in lib/onboarding-plan.test.ts) en schrijft de plan-kolommen op
 * beide write-plekken uit dat ene blok. De oude zod-enum blijft de legacy-labels
 * accepteren (drafts/clients van vóór de stap); de helper vertaalt ze naar een
 * anker — het label wordt nooit meer als eind-vorm weggeschreven.
 *
 * Vóór 5 sep 2026 pinde deze suite `profileData.fire_end_strategy =
 * horizonData?.fire_end_strategy ?? … ?? 'deplete'`; die ??-keten leeft nu als
 * `strategy`-invoer van de helper, zodat dezelfde bron-volgorde (horizonData →
 * identity → 'deplete') blijft gelden.
 */
describe('onboarding save-own-data — het plan (stop-anker × eind-vorm, ADR 0129)', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const source = readSourceLF(routePath)
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('accepteert de legacy-labels nog op elke fire_end_strategy zod-enum (identity + horizonData)', () => {
    const enums = codeOnly.match(/fire_end_strategy:\s*z\.enum\(\[[^\]]*\]\)/g) ?? []
    // Beide schema-velden (identity + horizonData) moeten aanwezig zijn.
    expect(enums).toHaveLength(2)
    for (const e of enums) {
      expect(e).toContain("'perpetual'")
      expect(e).toContain("'legacy'")
      expect(e).toContain("'deplete'")
      // Oude drafts/clients sturen 'pensioen' nog; de helper vertaalt het naar anker aow.
      expect(e).toContain("'pensioen'")
    }
  })

  it('accepteert het stop-anker in horizonData via de canonieke allowlist', () => {
    expect(codeOnly).toMatch(/fire_stop_anchor:\s*z\.enum\(STOP_ANCHOR_KINDS\)/)
    expect(codeOnly).toMatch(/fire_stop_age:\s*z\.number\(\)\.nullable\(\)\.optional\(\)/)
  })

  it('lost het plan één keer op via resolveOnboardingPlanColumns — horizonData wint, dan identity, dan deplete/90', () => {
    expect(codeOnly).toMatch(
      /resolveOnboardingPlanColumns\(\{[^}]*strategy:\s*horizonData\?\.fire_end_strategy\s*\?\?\s*identity\.fire_end_strategy\s*\?\?\s*'deplete'/,
    )
    expect(codeOnly).toMatch(
      /resolveOnboardingPlanColumns\(\{[^}]*endAge:\s*horizonData\?\.fire_end_age\s*\?\?\s*identity\.fire_end_age\s*\?\?\s*90/,
    )
    // Een ongeldig of tegenstrijdig plan is een client-fout via de error-envelope.
    expect(codeOnly).toMatch(/if\s*\('error' in planColumns\)\s*return badRequest\(planColumns\.error\)/)
  })

  it('schrijft eind-vorm én ankerkolommen in het multi-step pad uit het opgeloste blok', () => {
    // Het multi-step pad is de enige levende write-plek. `buildRpcPayload` is dood
    // (`void buildRpcPayload`) en de DB-RPC leest de ankerkolommen niet — dat pad
    // wordt hier bewust NIET als write-plek gepind (zie de opmerking bij de functie).
    expect(codeOnly).toMatch(/profileData\.fire_end_strategy\s*=\s*planColumns\.fire_end_strategy/)
    expect(codeOnly).toMatch(/profileData\.fire_end_age\s*=\s*planColumns\.fire_end_age/)
    expect(codeOnly).toMatch(/profileData\.fire_stop_anchor\s*=\s*planColumns\.fire_stop_anchor/)
    expect(codeOnly).toMatch(/profileData\.fire_stop_age\s*=\s*planColumns\.fire_stop_age/)
    // In het levende pad nergens meer een rechtstreekse schrijf van het rauwe label.
    expect(codeOnly).not.toMatch(/profileData\.fire_end_strategy\s*=\s*horizonData\?\.fire_end_strategy/)
  })

  it('beide fire_end_age-schema-velden lezen de ene grens (END_AGE_MIN/END_AGE_MAX = DB-CHECK 60..120)', () => {
    const bands = codeOnly.match(/fire_end_age:\s*z\.number\(\)\.int\(\)\.min\(([^)]*)\)\.max\(([^)]*)\)/g) ?? []
    // identity + horizonData.
    expect(bands).toHaveLength(2)
    for (const b of bands) {
      expect(b).toContain('min(END_AGE_MIN)')
      expect(b).toContain('max(END_AGE_MAX)')
    }
    expect(codeOnly).not.toMatch(/fire_end_age:\s*z\.number\(\)\.int\(\)\.min\(\d/)
  })

  it('neemt de ankerkolommen op in de optionele-kolommenlijst (schema-cache-miss-recovery)', () => {
    expect(codeOnly).toContain("'fire_stop_anchor',")
    expect(codeOnly).toContain("'fire_stop_age',")
  })
})

/**
 * Borgt dat aandelen-holdings-tracking NIET stilzwijgend aangaat bij onboarding
 * (Notion-bugkaart "Aandelen holdings — zet deze standaard uit"). De setup-
 * wizard (/api/aandelen-holdings/setup) is de ENIGE bewuste opt-in; de
 * onboarding-insert moet `has_holdings_tracking` altijd op false zetten,
 * consistent met de DB-default. Budget-tracking blijft WEL module-gestuurd
 * (bewust gewenst gedrag) — die contrast-assertie bewaakt dat we niet te veel
 * hebben uitgezet.
 */
describe('onboarding save-own-data — holdings-tracking standaard uit', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const source = readSourceLF(routePath)
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('zet has_holdings_tracking bij onboarding-insert altijd op false', () => {
    expect(codeOnly).toContain('has_holdings_tracking: false')
  })

  it('koppelt has_holdings_tracking NIET meer aan de aandelenregistratie-module', () => {
    expect(codeOnly).not.toMatch(/has_holdings_tracking:\s*hasAandelenregistratie/)
    expect(codeOnly).not.toContain('const hasAandelenregistratie')
  })

  it('laat has_budget_tracking wél module-gestuurd (contrast, ongewijzigd gedrag)', () => {
    expect(codeOnly).toMatch(
      /has_budget_tracking:\s*hasBudgetteren\s*&&\s*draft\.asset_type\s*===\s*'cash'/,
    )
  })
})

/**
 * Borgt het startsignaal van de rondleiding (ADR 0130): de vlag
 * `module_guide_state['rondleiding:pending']` wordt in DEZELFDE update
 * geschreven als `onboarding_completed = true`, en niet in een losse call die
 * apart kan mislukken.
 *
 * Even belangrijk: die kolom wordt eerst GELEZEN en dan gemerged. De map draagt
 * ook de welkomstgids, de coachmarks en de coach-staat; een blinde
 * `module_guide_state: { 'rondleiding:pending': … }` zou die wissen. De merge
 * zelf zit in `withRondleidingPending` en heeft z'n eigen unit-test
 * (lib/rondleiding/seed.test.ts) — hier bewaken we dat de route 'm gebruikt
 * i.p.v. zelf een object samen te stellen.
 *
 * Bronscan i.p.v. handler-import: deze route trekt de AI-extractielaag mee (zie
 * de suites hierboven).
 */
describe('onboarding save-own-data — rondleiding-startsignaal (ADR 0130)', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const source = readSourceLF(routePath)
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('schrijft de pending-vlag in dezelfde update als onboarding_completed = true', () => {
    // De vlag zit in hetzelfde update-object, achter de leesfout-guard: is de
    // kolom niet leesbaar, dan wordt hij niet aangeraakt (geen merge op een lege basis).
    expect(codeOnly).toMatch(
      /onboarding_completed:\s*true,\s*\.\.\.\(guideStateReadErr\s*\?\s*\{\}\s*:\s*\{\s*module_guide_state:\s*withRondleidingPending\(/,
    )
  })

  it('leest module_guide_state eerst en merget (geen blinde overschrijving)', () => {
    expect(codeOnly).toContain("import { withRondleidingPending } from '@/lib/rondleiding/seed'")
    expect(codeOnly).toContain("select('module_guide_state')")
    expect(codeOnly).toContain('withRondleidingPending(guideStateRow?.module_guide_state)')
    // De leesfout wordt niet genegeerd: hij wordt gedestructureerd en stuurt de patch.
    expect(codeOnly).toContain('error: guideStateReadErr')
    // Nergens een letterlijk object met de sleutel — dat zou de merge omzeilen.
    expect(codeOnly).not.toContain("'rondleiding:pending'")
  })
})
