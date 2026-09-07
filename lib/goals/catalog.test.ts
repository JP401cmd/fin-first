import { describe, it, expect } from 'vitest'
import { GOAL_MODULE_PRESETS, isGoalSlug } from './catalog'
import { MODULE_CATALOG } from '@/lib/module-registry'
import type { GoalSlug } from './types'

/**
 * De doel-stap is in juni 2026 uit de onboarding gehaald en komt niet terug
 * (eigenaarsbesluit UR3-28). Wat overbleef is een vangnet: een oud
 * localStorage-concept kan nog doel-slugs meesturen naar
 * `app/api/onboarding/save-own-data`, dat daaruit de te activeren modules
 * afleidt. Deze suite bewaakt exact dat restant — dekkend voor élke slug, en
 * met module-ids die daadwerkelijk in het register bestaan. Zonder deze
 * borging valt een tikfout in een preset pas op wanneer een legacy-concept
 * binnenkomt, en dat gebeurt zelden genoeg om onopgemerkt te blijven.
 */

const ALLE_SLUGS: readonly GoalSlug[] = [
  'grip-uitgaven',
  'vermogen-overzicht',
  'noodfonds',
  'schulden-aflossen',
  'eerder-stoppen',
  'bewust-leven',
]

const BEKENDE_MODULE_IDS = new Set(MODULE_CATALOG.map((m) => m.id))

describe('GOAL_MODULE_PRESETS', () => {
  it('dekt elke doel-slug met minstens één module', () => {
    for (const slug of ALLE_SLUGS) {
      expect(GOAL_MODULE_PRESETS[slug], `preset ontbreekt voor ${slug}`).toBeDefined()
      expect(GOAL_MODULE_PRESETS[slug].length, `lege preset voor ${slug}`).toBeGreaterThan(0)
    }
  })

  it('verwijst uitsluitend naar module-ids die in het register bestaan', () => {
    for (const slug of ALLE_SLUGS) {
      for (const moduleId of GOAL_MODULE_PRESETS[slug]) {
        expect(BEKENDE_MODULE_IDS.has(moduleId), `onbekende module ${moduleId} bij ${slug}`).toBe(
          true,
        )
      }
    }
  })

  it('heeft geen dubbele modules binnen één preset', () => {
    for (const slug of ALLE_SLUGS) {
      const preset = GOAL_MODULE_PRESETS[slug]
      expect(new Set(preset).size, `dubbele module in preset ${slug}`).toBe(preset.length)
    }
  })
})

describe('isGoalSlug', () => {
  it('herkent elke bekende slug', () => {
    for (const slug of ALLE_SLUGS) {
      expect(isGoalSlug(slug)).toBe(true)
    }
  })

  it('wijst onbekende of niet-string invoer af', () => {
    // De guard bewaakt vrije invoer uit localStorage: alles wat geen bekende
    // slug is moet eruit vallen, ook de verwijderde routes en lege waarden.
    for (const invoer of ['', 'onbekend', '/core', 'Grip-Uitgaven', null, undefined, 0, {}, []]) {
      expect(isGoalSlug(invoer), `${String(invoer)} werd ten onrechte geaccepteerd`).toBe(false)
    }
  })
})
