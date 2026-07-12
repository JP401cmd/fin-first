import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

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
  const source = readFileSync(routePath, 'utf8')

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
 * Borgt de eindstrategie-onboardingvraag (jul 2026): de nieuwe stap zet de
 * keuze via horizonData.fire_end_strategy. Keuze 1 (FIRE) → 'deplete', keuze 2
 * (pensioen) → 'pensioen'. Voor 'pensioen' te laten landen moest de zod-enum op
 * BEIDE fire_end_strategy-velden verbreed worden; de default-fallback blijft
 * 'deplete' (één bron van waarheid = de keuze in horizonData).
 */
describe('onboarding save-own-data — eindstrategie-keuze (FIRE vs. pensioen)', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const source = readFileSync(routePath, 'utf8')
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('accepteert pensioen op elke fire_end_strategy zod-enum (identity + horizonData)', () => {
    const enums = codeOnly.match(/fire_end_strategy:\s*z\.enum\(\[[^\]]*\]\)/g) ?? []
    // Beide schema-velden (identity + horizonData) moeten aanwezig zijn.
    expect(enums).toHaveLength(2)
    for (const e of enums) {
      expect(e).toContain("'perpetual'")
      expect(e).toContain("'legacy'")
      expect(e).toContain("'deplete'")
      // De verbreding waardoor keuze 2 (pensioen) door de validatie komt.
      expect(e).toContain("'pensioen'")
    }
  })

  it('laat de eindstrategie via horizonData.fire_end_strategy in profileData landen (default deplete)', () => {
    // Eén bron van waarheid: de keuze uit horizonData wint, met identity als
    // secundaire en 'deplete' als laatste fallback wanneer er geen keuze is.
    expect(codeOnly).toMatch(
      /profileData\.fire_end_strategy\s*=\s*horizonData\?\.fire_end_strategy\s*\?\?[^]*?\?\?\s*'deplete'/,
    )
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
  const source = readFileSync(routePath, 'utf8')
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
