import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ADMIN_ACTIE_LABELS, adminActieLabel, doelIsInstelling, isInzageActie } from './admin-audit-labels'

const ROOT = join(__dirname, '..')

function bronnen(dir: string): string[] {
  const uit: string[] = []
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam)
    if (statSync(pad).isDirectory()) uit.push(...bronnen(pad))
    else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) uit.push(pad)
  }
  return uit
}

/** Elke letterlijke `action: '…'` in een aanroep van logAdminAction. */
function gelogdeActies(): Set<string> {
  const acties = new Set<string>()
  for (const dir of ['app/api', 'app/(app)/beheer']) {
    for (const bestand of bronnen(join(ROOT, dir))) {
      const bron = readFileSync(bestand, 'utf8')
      if (!bron.includes('logAdminAction')) continue
      for (const m of bron.matchAll(/\baction:\s*['"`]([a-z][\w.-]+)['"`]/g)) acties.add(m[1])
    }
  }
  return acties
}

describe('ADMIN_ACTIE_LABELS', () => {
  it('heeft een label voor elke actie die de code daadwerkelijk logt', () => {
    const acties = gelogdeActies()
    // Groen mag niet betekenen dat de scan niets vond.
    expect(acties.size).toBeGreaterThan(10)
    const zonder = [...acties].filter((a) => !(a in ADMIN_ACTIE_LABELS))
    expect(zonder, 'actie zonder label: voeg hem toe aan lib/admin-audit-labels.ts').toEqual([])
  })

  it('een onbekende actie valt terug op de code zelf', () => {
    expect(adminActieLabel('iets.nieuws')).toBe('iets.nieuws')
    expect(adminActieLabel('config.update')).toBe('Configuratie gewijzigd')
  })
})

describe('inzage en doel', () => {
  it('alleen-lezen acties zijn geen ingreep', () => {
    expect(isInzageActie('user.activity')).toBe(true)
    expect(isInzageActie('news-feedback.read')).toBe(true)
    expect(isInzageActie('group.leden.inzage')).toBe(true)
  })

  it('acties die iets wijzigen zijn geen inzage', () => {
    for (const actie of ['config.update', 'user.block', 'user.delete', 'subscription.update', 'errors.resolve']) {
      expect(isInzageActie(actie), actie).toBe(false)
    }
  })

  it('elke inzage-actie heeft ook een label', () => {
    for (const actie of Object.keys(ADMIN_ACTIE_LABELS)) {
      if (isInzageActie(actie)) expect(ADMIN_ACTIE_LABELS[actie].length).toBeGreaterThan(0)
    }
  })

  it('alleen bij een configuratiewijziging is het doel een instelling', () => {
    expect(doelIsInstelling('config.update')).toBe(true)
    for (const actie of ['user.block', 'user.role', 'subscription.update', 'user.delete', 'group.leden']) {
      expect(doelIsInstelling(actie), actie).toBe(false)
    }
  })
})
