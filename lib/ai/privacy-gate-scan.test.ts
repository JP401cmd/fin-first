// ── Privacy-modus guard coverage — vitest gate (ADR 0043, FR-1.3) ───────────
//
// Draait de statische scan over de echte broncode, zodat:
//   1. De belofte "elke AI-route respecteert de uitvoerkeuze van de gebruiker"
//      wordt geverifieerd tegen bron, niet tegen documentatie.
//   2. Een NIEUWE getModel-consument de vastgepinde lijst breekt, met een
//      melding die naar de te maken keuze wijst (in welke uitvoergroep hoort
//      deze functie?) in plaats van stil de garantie uit te hollen.

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  collectGetModelConsumers,
  collectModelReachingRoutes,
  modelReachingExports,
  importedBindingsFrom,
  importsGetModel,
  hasPrivacyGateBeforeModelCall,
  findGateAnchorIndex,
  findModelCallIndex,
  readsPrivacyModeDirectly,
  importedNamesFrom,
  gatedRouteBindings,
  PRIVACY_GATED_ROUTES,
  PRIVACY_GATE_CODE,
} from './privacy-gate-scan'
import { AI_ROUTE_BINDINGS, FEATURE_GROUP, AI_EXECUTION_GROUP_IDS } from './execution-groups'
import { AI_TOKEN_FEATURES } from './token-usage'

// Momentopname. Een nieuwe regel = een nieuwe AI-generatie-callsite: deel 'm in
// bij een uitvoergroep in lib/ai/execution-groups.ts en geef de bijbehorende
// route de privé-gate, vóór je deze lijst bijwerkt.
const KNOWN_GETMODEL_CONSUMERS = [
  'app/api/admin/news-ingest/route.ts',
  'app/api/ai/categorize/route.ts',
  'app/api/ai/chat/route.ts',
  'app/api/ai/recommendations/initial/route.ts',
  'app/api/ai/recommendations/route.ts',
  'app/api/news-ingest/cron/route.ts',
  'app/api/news/route.ts',
  'app/api/onboarding/suggest-budgets/route.ts',
  'app/api/pension/parse/route.ts',
  'app/api/report/route.ts',
  'app/api/subscriptions/advice/route.ts',
  'app/api/subscriptions/analyse-ai/route.ts',
  'app/api/subscriptions/detect-ai/route.ts',
  'app/api/whatif/suggest/route.ts',
  'lib/aangifte/extract-aangifte-data.ts',
  'lib/ai/build-calculator.ts',
  'lib/ai/extract-financial-data.ts',
  'lib/ai/screen-publish-metadata.ts',
  'lib/briefing/redactie.ts',
].sort()

function readRoute(route: string): string {
  const abs = path.join(process.cwd(), ...route.split('/'))
  expect(fs.existsSync(abs), `ontbrekend routebestand: ${route}`).toBe(true)
  return fs.readFileSync(abs, 'utf-8')
}

describe('privacy-gate scan — dekking over alle AI-routes', () => {
  it.each(gatedRouteBindings())(
    '$route draagt de privé-gate vóór de modelcall',
    ({ route, modelCallIn }) => {
      const src = readRoute(route)
      const via = modelCallIn === route ? undefined : modelCallIn

      expect(
        findModelCallIndex(src, via),
        `geen modelcall gevonden in ${route}` +
          (via ? ` (indirect via ${via} — klopt modelCallIn nog?)` : ''),
      ).toBeGreaterThan(-1)

      expect(
        findGateAnchorIndex(src),
        `geen gate-anker in ${route}: verwacht een assertCloudAllowed/isCloudAllowed-aanroep ` +
          `of de letterlijke code "${PRIVACY_GATE_CODE}".`,
      ).toBeGreaterThan(-1)

      expect(
        hasPrivacyGateBeforeModelCall(src, via),
        `de privé-gate moet 403 geven VÓÓR de modelcall in ${route} (FR-1.2) — ` +
          'financiële gegevens mogen de promptopbouw niet bereiken als de groep lokaal draait.',
      ).toBe(true)
    },
  )

  it('pint de volledige lijst getModel-consumenten', () => {
    expect(collectGetModelConsumers().sort()).toEqual(KNOWN_GETMODEL_CONSUMERS)
  })

  it('elke gegate route staat in PRIVACY_GATED_ROUTES', () => {
    expect([...PRIVACY_GATED_ROUTES].sort()).toEqual(gatedRouteBindings().map((b) => b.route).sort())
  })

  // Deze test bestaat omdat de scan hier ooit doorheen keek. /api/ai/chat en
  // /api/ai/categorize droegen een 403 met de juiste foutcode boven een check
  // die alleen de HOOFDSCHAKELAAR las — de per-groep-override werd genegeerd,
  // waardoor twee van de zeven schakelaars op /mijn/privacy niets deden. De
  // gate was aanwezig; de beslisregel was de verkeerde. Aanwezigheid van een
  // anker bewijst dus niets over betekenis, en dáárom kijkt deze test naar wat
  // de route NIET meer mag doen.
  it.each(gatedRouteBindings())(
    '$route rekent de privé-keuze niet zelf uit (geen rauwe privacy_mode-lezing)',
    ({ route }) => {
      const src = readRoute(route)
      expect(
        readsPrivacyModeDirectly(src),
        `${route} leest privacy_mode rechtstreeks. Sinds ADR 0078 is de hoofdschakelaar nog maar de ` +
          'DEFAULT: een per-groep-override in ai_execution_prefs hoort te winnen. Gebruik ' +
          'assertCloudAllowed()/isCloudAllowed() uit lib/ai/privacy-gate.ts — die kent de canonieke ' +
          'beslisregel (resolveExecutionMode) én de terugval bij een ontbrekende kolom.',
      ).toBe(false)
    },
  )
})

describe('registry-samenhang', () => {
  it('elke feature-string is ingedeeld bij een bestaande groep of platform', () => {
    for (const feature of AI_TOKEN_FEATURES) {
      const scope = FEATURE_GROUP[feature]
      expect(
        scope === 'platform' || (AI_EXECUTION_GROUP_IDS as string[]).includes(scope),
        `feature "${feature}" heeft een onbekende scope: ${scope}`,
      ).toBe(true)
    }
  })

  it('elke route-binding verwijst naar bestaande bestanden', () => {
    for (const binding of AI_ROUTE_BINDINGS) {
      for (const rel of [binding.route, binding.modelCallIn]) {
        const abs = path.join(process.cwd(), ...rel.split('/'))
        expect(fs.existsSync(abs), `ontbrekend bestand in binding ${binding.route}: ${rel}`).toBe(true)
      }
    }
  })

  it('de scope van een binding komt overeen met de groep van zijn feature', () => {
    for (const binding of AI_ROUTE_BINDINGS) {
      expect(FEATURE_GROUP[binding.feature], `mismatch bij ${binding.route}`).toBe(binding.scope)
    }
  })

  it('ongegate routes dragen een expliciete reden', () => {
    for (const binding of AI_ROUTE_BINDINGS.filter((b) => !b.gated)) {
      expect(
        binding.ongatedReden,
        `${binding.route} is niet gegate maar geeft geen reden — maak de uitzondering expliciet`,
      ).toBeTruthy()
    }
  })

  it('elke getModel-consument die een route is, staat in de registry', () => {
    const known = new Set(AI_ROUTE_BINDINGS.map((b) => b.route))
    const routeConsumers = collectGetModelConsumers().filter((f) => f.startsWith('app/api/'))
    const missing = routeConsumers.filter((f) => !known.has(f))
    expect(
      missing,
      `route(s) met een modelcall die niet in AI_ROUTE_BINDINGS staan: ${missing.join(', ')}`,
    ).toEqual([])
  })

  // De vorige test kijkt alleen naar DIRECTE getModel-importeurs. Precies daar
  // zat de blinde vlek: de drie routes die een externe provider bereikten zonder
  // abonnementscheck deden dat allemaal via een lib, dus geen enkele test werd
  // rood. Deze variant volgt ook die indirecte weg.
  it('ook INDIRECTE model-bereikende routes staan in de registry', () => {
    const known = new Set(AI_ROUTE_BINDINGS.map((b) => b.route))
    const missing = collectModelReachingRoutes().filter((f) => !known.has(f))
    expect(
      missing,
      `route(s) die een model bereiken via een lib maar niet in AI_ROUTE_BINDINGS staan: ${missing.join(', ')}. ` +
        'Zonder registratie valt zo n route buiten élke gate — privé-keuze én abonnement.',
    ).toEqual([])
  })
})

describe('detector-primitieven', () => {
  it('herkent een echte getModel-import, geen comment/string-vermelding', () => {
    expect(importsGetModel("import { getModel } from '@/lib/ai/config'")).toBe(true)
    expect(importsGetModel("import { getModel, AIConfigError } from '@/lib/ai/config'")).toBe(true)
    expect(importsGetModel('// een model-call (getModel(supabase) ...)')).toBe(false)
    expect(importsGetModel("import { checkTierGate } from '@/lib/require-tier'")).toBe(false)
  })

  it('vereist zowel het anker als de juiste volgorde (directe call)', () => {
    const metGate = [
      "const gate = await assertCloudAllowed(supabase, user.id, 'gesprek')",
      'if (gate) return gate',
      'const m = await getModel(s)',
    ].join('\n')
    expect(hasPrivacyGateBeforeModelCall(metGate)).toBe(true)

    const gateTeLaat = [
      'const m = await getModel(s)',
      "const gate = await assertCloudAllowed(supabase, user.id, 'gesprek')",
    ].join('\n')
    expect(hasPrivacyGateBeforeModelCall(gateTeLaat)).toBe(false)

    expect(hasPrivacyGateBeforeModelCall('const m = await getModel(s)')).toBe(false)
  })

  // De kale foutcode telt bewust NIET meer als bewijs. Hij zegt alleen dat er
  // ergens een 403 met dat label wordt teruggegeven — niet dat de juiste
  // beslisregel is gevolgd. Twee routes kwamen er zo doorheen met een check die
  // de per-groep-override negeerde.
  it('de kale foutcode is geen gate-bewijs meer — alleen een echte helper-aanroep', () => {
    const alleenDeCode = [
      "if (privacyMode) return Response.json({ code: 'privacy_mode_active' }, { status: 403 })",
      'const m = await getModel(s)',
    ].join('\n')
    expect(findGateAnchorIndex(alleenDeCode)).toBe(-1)
    expect(hasPrivacyGateBeforeModelCall(alleenDeCode)).toBe(false)
  })

  it('readsPrivacyModeDirectly herkent een eigen berekening van de keuze', () => {
    expect(readsPrivacyModeDirectly("const { data } = await supabase.from('profiles').select('privacy_mode')")).toBe(true)
    expect(readsPrivacyModeDirectly('const pm = row?.privacy_mode ?? false')).toBe(true)
    // De gedeelde helper aanroepen is juist wél goed — en die noemt de kolom
    // alleen in zijn eigen implementatie, niet in de route.
    expect(readsPrivacyModeDirectly("const gate = await assertCloudAllowed(s, id, 'gesprek')")).toBe(false)
    // Een comment die de kolom noemt is documentatie, geen implementatie.
    expect(readsPrivacyModeDirectly('// valt terug op privacy_mode als de kolom ontbreekt')).toBe(false)
  })

  // Een comment die de foutcode of een functienaam noemt is documentatie, geen
  // code — anders zou een toelichting bóven de gate de scan kunnen misleiden
  // (of, erger, een uitgecommentarieerde gate als echt tellen).
  it('negeert ankers en aanroepen die alleen in commentaar staan', () => {
    expect(
      hasPrivacyGateBeforeModelCall('// hier hoort ooit privacy_mode_active te komen\nconst m = await getModel(s)'),
    ).toBe(false)

    const commentNoemtFunctie = [
      "import { redactBriefing } from '@/lib/briefing/redactie'",
      "import { assertCloudAllowed } from '@/lib/ai/privacy-gate'",
      '// de modelcall zit in redactBriefing (lib/briefing/redactie.ts)',
      'const gate = await assertCloudAllowed(supabase, user.id, "briefing")',
      'if (gate) return gate',
      'const out = await redactBriefing(supabase, entries, {})',
    ].join('\n')
    expect(
      hasPrivacyGateBeforeModelCall(commentNoemtFunctie, 'lib/briefing/redactie.ts'),
      'een functienaam in een comment vóór de gate mag niet als de modelcall tellen',
    ).toBe(true)
  })

  it('erkent de gedeelde helper als gate-anker, maar niet de kale import', () => {
    const metAanroep = [
      "import { assertCloudAllowed } from '@/lib/ai/privacy-gate'",
      'const gate = await assertCloudAllowed(supabase, user.id, "briefing")',
      'const m = await getModel(supabase, "briefing")',
    ].join('\n')
    expect(hasPrivacyGateBeforeModelCall(metAanroep)).toBe(true)

    const alleenImport = [
      "import { assertCloudAllowed } from '@/lib/ai/privacy-gate'",
      'const m = await getModel(supabase, "briefing")',
    ].join('\n')
    expect(
      findGateAnchorIndex(alleenImport),
      'een import zonder aanroep mag niet als gate tellen',
    ).toBe(-1)
  })

  // Dit is de bug die de vorige scan had: bij een route die getModel niet zelf
  // aanroept gaf indexOf('getModel(') -1, dus false — een correcte gate leek
  // kapot en een ontbrekende gate bleef even onzichtbaar.
  it('vindt de modelcall indirect, via een geïmporteerd symbool', () => {
    const src = [
      "import { redactBriefing, applyRedactie } from '@/lib/briefing/redactie'",
      "import { assertCloudAllowed } from '@/lib/ai/privacy-gate'",
      'const gate = await assertCloudAllowed(supabase, user.id, "briefing")',
      'if (gate) return gate',
      'const out = await redactBriefing(supabase, entries, {})',
    ].join('\n')

    expect(findModelCallIndex(src), 'zonder viaModule is er geen directe call').toBe(-1)
    expect(findModelCallIndex(src, 'lib/briefing/redactie.ts')).toBeGreaterThan(-1)
    expect(hasPrivacyGateBeforeModelCall(src, 'lib/briefing/redactie.ts')).toBe(true)

    const zonderGate = [
      "import { redactBriefing } from '@/lib/briefing/redactie'",
      'const out = await redactBriefing(supabase, entries, {})',
    ].join('\n')
    expect(hasPrivacyGateBeforeModelCall(zonderGate, 'lib/briefing/redactie.ts')).toBe(false)
  })

  // Deze verfijning bestaat door een vals alarm: /api/admin/ai-prompts importeert
  // buildRedactiePromptPreview en buildSystemPrompt uit bestanden die elders wél
  // een model aanroepen. Die route toont alleen prompttekst en raakt nooit een
  // model — "importeert uit een model-bereikend bestand" is dus te grof.
  it('modelReachingExports scheidt genererende exports van prompt-previews', () => {
    const lib = [
      "import { getModel } from '@/lib/ai/config'",
      '',
      'export function buildPromptPreview(x) {',
      '  return `prompt voor ${x}`',
      '}',
      '',
      'export async function redigeer(supabase, entries) {',
      "  const model = await getModel(supabase, 'briefing')",
      '  return generate(model, entries)',
      '}',
      '',
      'export const CONSTANTE = 42',
    ].join('\n')

    const reaching = modelReachingExports(lib)
    expect(reaching).toContain('redigeer')
    expect(reaching, 'een preview-functie raakt geen model').not.toContain('buildPromptPreview')
    expect(reaching).not.toContain('CONSTANTE')
  })

  it('importedBindingsFrom geeft zowel de oorspronkelijke als de lokale naam', () => {
    const src = "import { buildSystemPrompt as buildCalcPrompt, buildCalculator } from '@/lib/ai/build-calculator'"
    const { bindings } = importedBindingsFrom(src, 'lib/ai/build-calculator.ts')
    expect(bindings).toEqual([
      { original: 'buildSystemPrompt', local: 'buildCalcPrompt' },
      { original: 'buildCalculator', local: 'buildCalculator' },
    ])
  })

  it('leest geïmporteerde namen incl. alias, en negeert andere modules', () => {
    const src = [
      "import { redactBriefing as redigeer, applyRedactie } from '@/lib/briefing/redactie'",
      "import { iets } from '@/lib/anders'",
    ].join('\n')
    const { names } = importedNamesFrom(src, 'lib/briefing/redactie.ts')
    expect(names.sort()).toEqual(['applyRedactie', 'redigeer'])
  })

  it('telt een gate die NA de modelcall staat niet mee (indirect)', () => {
    const src = [
      "import { redactBriefing } from '@/lib/briefing/redactie'",
      "import { assertCloudAllowed } from '@/lib/ai/privacy-gate'",
      'const out = await redactBriefing(supabase, entries, {})',
      'const gate = await assertCloudAllowed(supabase, user.id, "briefing")',
    ].join('\n')
    expect(hasPrivacyGateBeforeModelCall(src, 'lib/briefing/redactie.ts')).toBe(false)
  })
})
