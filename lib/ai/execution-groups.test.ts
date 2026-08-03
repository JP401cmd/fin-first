// ── Uitvoergroepen: de keuze oplossen ───────────────────────────────────────
//
// Dit is de rekenkern van de privé-modus: één functie bepaalt of de gegevens van
// een gebruiker naar een AI-leverancier mogen. Een fout hier is geen cosmetisch
// probleem maar een gebroken belofte, dus de randgevallen staan hier expliciet.

import { describe, it, expect } from 'vitest'
import {
  resolveExecutionMode,
  resolveAllExecutionModes,
  cloudAllowedForFeature,
  executionGroupInfo,
  AI_EXECUTION_GROUPS,
  AI_EXECUTION_GROUP_IDS,
  FEATURE_GROUP,
  AI_ROUTE_BINDINGS,
  GATED_AI_ROUTES,
  routeBinding,
} from './execution-groups'

describe('resolveExecutionMode — override wint van hoofdschakelaar', () => {
  it('zonder voorkeur volgt elke groep de hoofdschakelaar', () => {
    expect(resolveExecutionMode({ privacy_mode: false }, 'gesprek')).toBe('cloud')
    expect(resolveExecutionMode({ privacy_mode: true }, 'gesprek')).toBe('lokaal')
  })

  it('een override stuurt één groep de andere kant op', () => {
    const row = { privacy_mode: true, ai_execution_prefs: { nieuws: 'cloud' as const } }
    expect(resolveExecutionMode(row, 'nieuws')).toBe('cloud')
    expect(resolveExecutionMode(row, 'gesprek'), 'andere groepen blijven lokaal').toBe('lokaal')
  })

  it('werkt ook andersom: hoofdschakelaar uit, één groep bewust lokaal', () => {
    const row = { privacy_mode: false, ai_execution_prefs: { transacties: 'lokaal' as const } }
    expect(resolveExecutionMode(row, 'transacties')).toBe('lokaal')
    expect(resolveExecutionMode(row, 'nieuws')).toBe('cloud')
  })

  // Een ontbrekend of onleesbaar profiel mag nooit tot "dan maar cloud" leiden
  // wanneer de hoofdschakelaar aan staat. Andersom is 'cloud' de juiste default
  // voor wie nooit iets heeft ingesteld — dat is het bestaande gedrag.
  it('valt bij ontbrekende gegevens terug op cloud, niet op een gok', () => {
    expect(resolveExecutionMode(null, 'gesprek')).toBe('cloud')
    expect(resolveExecutionMode(undefined, 'gesprek')).toBe('cloud')
    expect(resolveExecutionMode({}, 'gesprek')).toBe('cloud')
  })

  it('negeert rommel in de voorkeurenmap en valt terug op de hoofdschakelaar', () => {
    const rommel = {
      privacy_mode: true,
      // Zoals het eruit kan zien na een handmatige edit of een oudere versie.
      ai_execution_prefs: { gesprek: 'JA' as unknown as 'lokaal', nieuws: null as unknown as 'cloud' },
    }
    expect(
      resolveExecutionMode(rommel, 'gesprek'),
      'een onbekende waarde mag de privé-keuze niet stilzwijgend openbreken',
    ).toBe('lokaal')
    expect(resolveExecutionMode(rommel, 'nieuws')).toBe('lokaal')
  })

  it('resolveAllExecutionModes dekt precies alle zeven groepen', () => {
    const modes = resolveAllExecutionModes({ privacy_mode: true })
    expect(Object.keys(modes).sort()).toEqual([...AI_EXECUTION_GROUP_IDS].sort())
    expect(Object.values(modes).every((m) => m === 'lokaal')).toBe(true)
  })
})

describe('cloudAllowedForFeature', () => {
  it('volgt de groep van de feature', () => {
    const row = { privacy_mode: true, ai_execution_prefs: { transacties: 'cloud' as const } }
    expect(cloudAllowedForFeature(row, 'categorisatie'), 'zit in transacties').toBe(true)
    expect(cloudAllowedForFeature(row, 'chat'), 'zit in gesprek').toBe(false)
  })

  // De nieuws-ingest draait als cron zonder gebruikerssessie en verwerkt alleen
  // openbare bronnen. Die per gebruiker blokkeren zou schijnveiligheid zijn.
  it('platform-taken staan los van de gebruikerskeuze', () => {
    expect(cloudAllowedForFeature({ privacy_mode: true }, 'nieuws_ingest')).toBe(true)
  })
})

describe('registry-samenhang', () => {
  it('elke groep heeft een label, omschrijving en een commerciële koppeling', () => {
    for (const g of AI_EXECUTION_GROUPS) {
      expect(g.label.length, `${g.id} mist een label`).toBeGreaterThan(0)
      expect(g.omschrijving.length, `${g.id} mist een omschrijving`).toBeGreaterThan(0)
      expect(g.commercieleFeatures.length, `${g.id} hangt aan geen enkele AI-feature`).toBeGreaterThan(0)
    }
  })

  // Met de gekozen semantiek ("kan iets lokaal niet, dan blokkeren") mag een
  // gebruiker nooit ontdekken dát iets wegvalt zonder dat het in de UI stond.
  it('een groep die lokaal maar gedeeltelijk kan, benoemt wát er wegvalt', () => {
    for (const g of AI_EXECUTION_GROUPS) {
      if (g.lokaal === 'gedeeltelijk') {
        expect(g.beperkingen.length, `${g.id} is gedeeltelijk maar noemt geen beperking`).toBeGreaterThan(0)
      } else {
        expect(g.beperkingen, `${g.id} is volledig maar noemt toch een beperking`).toEqual([])
      }
    }
  })

  it('executionGroupInfo werpt op een onbekende groep i.p.v. stil undefined terug te geven', () => {
    expect(() => executionGroupInfo('bestaat-niet' as never)).toThrow()
  })

  it('elke feature is ingedeeld en elke groep wordt gebruikt', () => {
    const scopes = new Set(Object.values(FEATURE_GROUP))
    for (const id of AI_EXECUTION_GROUP_IDS) {
      expect(scopes.has(id), `groep "${id}" heeft geen enkele feature — dode groep in de UI`).toBe(true)
    }
  })

  it('GATED_AI_ROUTES bevat alleen gated bindings, en geen platform-taken', () => {
    expect(GATED_AI_ROUTES.length).toBe(AI_ROUTE_BINDINGS.filter((b) => b.gated).length)
    for (const route of GATED_AI_ROUTES) {
      expect(routeBinding(route)?.scope, `${route} is gated maar heeft platform-scope`).not.toBe('platform')
    }
  })

  it('routes zijn uniek per pad', () => {
    const paths = AI_ROUTE_BINDINGS.map((b) => b.route)
    expect(new Set(paths).size, 'dubbele route in de registry').toBe(paths.length)
  })
})
