/**
 * Kopij van de beta-add-on-keuze (ADR 0157) — W-014, eigenaarsbesluit 19-09-2026
 * (optie B): de Connected-popup benoemt kosten en TrueLayer, noemt "180 dagen"
 * als toestemmingsduur en nooit "90 dagen" of "korter dan 90 dagen". De
 * AI-regel blijft ongewijzigd (die is gedeeld met de AI-upsell).
 */

import { describe, expect, it } from 'vitest'
import { BETA_ADDON_COPY, betaAddonNotice } from './beta-addons'
import { BANK_CONNECT_VERBODEN_FRAGMENTEN } from './bank-connect-copy'

describe('betaAddonNotice', () => {
  it('connected: benoemt de kosten en TrueLayer, met de prijs uit de catalogus', () => {
    const tekst = betaAddonNotice('connected')
    expect(tekst).toContain('TrueLayer')
    expect(tekst).toMatch(/kost/)
    expect(tekst).toMatch(/€\s?4 per maand/)
    expect(tekst).toContain('zonder kosten')
  })

  it('ai: ongewijzigd — geen TrueLayer- of bankkosten-tekst in de AI-regel', () => {
    const tekst = betaAddonNotice('ai')
    expect(tekst).toMatch(/^Straks wordt AI een abonnement van €\s?9 per maand\./)
    expect(tekst).not.toContain('TrueLayer')
    expect(tekst).not.toContain('bank')
  })
})

describe('BETA_ADDON_COPY.connected', () => {
  const alles = [
    betaAddonNotice('connected'),
    ...Object.values(BETA_ADDON_COPY.connected.aan),
    ...Object.values(BETA_ADDON_COPY.connected.uit),
    BETA_ADDON_COPY.connected.titel,
  ].join('\n')

  it('noemt 180 dagen als toestemmingsduur (PSD2), nooit 90', () => {
    expect(BETA_ADDON_COPY.connected.aan.waarom).toContain('180 dagen')
    expect(alles).not.toMatch(/90 dagen/)
    expect(alles).not.toMatch(/korter dan/)
  })

  it('draagt geen verboden geruststellingen uit de bank-uitnodiging', () => {
    for (const fragment of BANK_CONNECT_VERBODEN_FRAGMENTEN) {
      expect(alles.toLowerCase()).not.toContain(fragment.toLowerCase())
    }
  })
})
