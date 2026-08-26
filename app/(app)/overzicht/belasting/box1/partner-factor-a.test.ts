import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Partner-privacy regressie-pin (factor A).
 *
 * profiles.pension_factor_a is de EIGEN factor A van de ingelogde gebruiker en
 * mag NOOIT als de factor A van de partner worden hergebruikt (privacylek +
 * rekenfout). De partner-jaarruimtekaart op de Box 1-pagina moet daarom
 * `pensioenAangroei={0}` blijven doorgeven, terwijl de EIGEN kaarten de
 * geresolvede `pensionFactorA` uit de loader-bundel gebruiken.
 *
 * Lichte, robuuste statische assertie: lees het page-bestand en controleer de
 * JSX-literals. Zo faalt het meteen als iemand de partner-kaart per ongeluk op
 * de eigen factor A koppelt (of de eigen kaarten terugdraait naar 0).
 */
describe('Box 1-pagina — partner-privacy factor A', () => {
  const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

  it('partner-jaarruimtekaart geeft pensioenAangroei={0} door (privacy-guard)', () => {
    // De partner-tak gebruikt partnerGrossYearly + pensioenAangroei={0}.
    expect(source).toMatch(/grossYearlyIncome=\{partnerGrossYearly\}\s*\n\s*pensioenAangroei=\{0\}/)
  })

  it('eigen kaarten lezen de geresolvede pensionFactorA, niet 0', () => {
    // Minstens één eigen kaart gebruikt grossYearly + pensioenAangroei={pensionFactorA}.
    expect(source).toMatch(/grossYearlyIncome=\{grossYearly\}\s*\n\s*pensioenAangroei=\{pensionFactorA\}/)
    // pensionFactorA wordt geconsumeerd uit de loader-bundel (geen eigen query).
    expect(source).toContain('horizonData.pensioenFactorA')
  })
})

/**
 * Bevinding H23 — NULL ≠ 0 moet de pagina ook daadwerkelijk DOORGEVEN.
 *
 * `pensioenFactorAKnown` stond al op de horizon-bundel, maar deze pagina las het
 * veld niet: de kaart zei onvoorwaardelijk "berekend met je opgeslagen factor A"
 * onder een bedrag dat de uitleg erboven een "bovengrens" noemt. Zelfde lichte
 * statische assertie als hierboven — hij faalt zodra iemand de wiring terugdraait.
 */
describe('Box 1-pagina — factor-A-bekendheid doorgegeven (H23)', () => {
  const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

  it('leest pensioenFactorAKnown uit de loader-bundel (geen eigen afleiding)', () => {
    expect(source).toContain('horizonData.pensioenFactorAKnown')
  })

  it('geeft factorAKnown door aan de EIGEN jaarruimtekaart(en)', () => {
    expect(source).toMatch(
      /pensioenAangroei=\{pensionFactorA\}\s*\n\s*factorAKnown=\{pensionFactorAKnown\}/,
    )
  })

  it('geeft de partnerkaart een LITERALE false, nooit de eigen bekendheid', () => {
    // De partner heeft geen eigen factor-A-bron; `pensionFactorAKnown` is de
    // bekendheid van de INGELOGDE gebruiker en mag hier niet lekken.
    expect(source).toMatch(/pensioenAangroei=\{0\}\s*\n\s*factorAKnown=\{false\}/)
  })

  it('stuurt ook het uitlegblok op dezelfde bron (geen tweede waarheid)', () => {
    expect(source).toContain('<JaarruimteUitleg factorAKnown={pensionFactorAKnown} />')
  })
})
