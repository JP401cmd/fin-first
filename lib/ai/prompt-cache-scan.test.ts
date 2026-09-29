import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Prompt-caching bewaart de gecachete prefix enkele minuten bij de provider
 * (ADR 0186). Bij de duiding is dat publieke nieuwsbron-tekst en een vaste
 * catalogus. Zet iemand `cacheControl` op een prompt met gebruikerscontext
 * (chat, briefing), dan ligt die context daar óók — dat vraagt eerst een
 * security-run en een blik op het verwerkersregister. Deze scan maakt die
 * stap onvermijdelijk: een nieuwe plek is een bewuste toevoeging mét reden.
 */
const TOEGESTAAN: Record<string, string> = {
  'lib/krant/duiding.ts': 'systeemprompt + schema-tool: vaste catalogus, geen gebruikersdata (cron, userId null)',
}

function bronbestanden(dir: string, uit: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) bronbestanden(p, uit)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) uit.push(p)
  }
  return uit
}

describe('prompt-caching alleen op toegestane plekken', () => {
  it('cacheControl komt alleen voor in de allowlist', () => {
    const treffers = ['app', 'lib', 'components']
      .flatMap((d) => bronbestanden(d))
      .map((p) => p.split(path.sep).join('/'))
      .filter((p) => readSourceLF(p).includes('cacheControl'))
    expect(treffers.sort()).toEqual(Object.keys(TOEGESTAAN).sort())
  })
})
