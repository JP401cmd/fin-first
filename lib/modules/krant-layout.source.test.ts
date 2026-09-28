/**
 * Bron-scan op de app-shell (Krant 2B): de layout neemt de grens- en
 * Fin-beslissingen uit `lib/modules/krant-grens.ts` en nergens anders vandaan.
 *
 * De layout is een async server component met een batch van tien queries; hem
 * echt renderen in vitest zou een halve app aan mocks vragen. De beslissingen
 * zelf zijn pure functies met eigen tests (`krant-grens.test.ts`); deze scan
 * bewaakt dat de layout ze op de juiste plekken gebruikt:
 *   - de redirect draait alleen voor een Krant-account en leest het pad uit de
 *     proxy-header;
 *   - élk Fin-oppervlak (companion, chatpaneel, deeplink, vragenlijst-popup,
 *     AI-keuze) hangt aan `finEnabled`;
 *   - `children` staat binnen de client-wacht.
 */

import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const src = readSourceLF(resolve(__dirname, '..', '..', 'app', '(app)', 'layout.tsx'))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\/.*$/gm, '')

describe('app-shell — Krant-grens', () => {
  it('redirect alleen voor een Krant-account, op het pad uit de proxy-header', () => {
    expect(src).toMatch(
      /if \(isKrantAccount\(activeModules\)\) \{\s*const krantTarget = krantRedirect\(\s*\(await headers\(\)\)\.get\(PATHNAME_HEADER\),\s*activeModules,\s*isSuperadmin,\s*\)\s*if \(krantTarget\) redirect\(krantTarget\)/,
    )
  })

  it('de superadmin-uitzondering volgt de profielrol', () => {
    expect(src).toMatch(/const isSuperadmin = profile\?\.role === 'superadmin'/)
  })

  it('children staat binnen KrantRouteGuard', () => {
    expect(src).toMatch(/<KrantRouteGuard isSuperadmin=\{isSuperadmin\}>\{children\}<\/KrantRouteGuard>/)
    // …en nergens anders kaal.
    expect(src.match(/\{children\}/g)).toHaveLength(1)
  })
})

describe('app-shell — Fin niet mounten voor een Krant-account (B11)', () => {
  it('finEnabled komt uit shouldMountFin(activeModules)', () => {
    expect(src).toMatch(/const finEnabled = shouldMountFin\(activeModules\)/)
  })

  it.each([
    ['chatpaneel', /\{finEnabled && <ChatPanelLazy \/>\}/],
    ['chat-deeplink', /\{finEnabled && \(\s*<Suspense fallback=\{null\}>\s*<ChatPromptDeeplink \/>/],
    ['companion (FinHome)', /\{finEnabled && \(\s*<Suspense fallback=\{null\}>\s*<FinHome/],
    ['vragenlijst-uitnodiging', /\{finEnabled && <VragenlijstUitnodiging \/>\}/],
  ])('%s hangt aan finEnabled', (_label, pattern) => {
    expect(src).toMatch(pattern)
  })

  it('elk Fin-oppervlak komt precies één keer voor (geen ongegate tweede mount)', () => {
    for (const tag of ['<ChatPanelLazy', '<ChatPromptDeeplink', '<FinHome', '<VragenlijstUitnodiging']) {
      expect(src.split(tag).length - 1, tag).toBe(1)
    }
  })

  it('de AI-keuze-interstitial opent nooit zonder Fin', () => {
    expect(src).toMatch(/<AiConsentInterstitial\s+open=\{\s*finEnabled &&/)
  })

  it('ChatProvider krijgt de vlag mee (verbergt de "Vraag Fin"-ingangen, houdt de chat dicht)', () => {
    expect(src).toMatch(/<ChatProvider\s+finEnabled=\{finEnabled\}/)
  })
})
