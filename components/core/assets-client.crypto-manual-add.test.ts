/**
 * WF-BEZIT-21-bug4 — de crypto-empty-state mag geen handmatige invoer beloven.
 *
 * De repro: `TypedHoldingsSection` in `components/core/assets-client.tsx`
 * toonde bij 0 gekoppelde coins "Voeg holdings toe via een exchange-koppeling,
 * wallet-adres of handmatige invoer", met daaronder alleen "Koppel exchange".
 * Handmatige crypto-invoer bestaat nergens in de app — sterker nog,
 * `POST /api/holdings` WEIGERT `asset_type === 'crypto'` sinds 26 juli 2026 met
 * een 400, omdat een handmatige coin anders in `investment_holdings` belandt:
 * onzichtbaar op de crypto-pagina, waarna de asset-rollup (die
 * `crypto_holdings` bevraagt) de bestaande assetwaarde nulde.
 *
 * Eigenaarsbesluit 3 sep 2026 = **optie B**: de guard blijft, de tekst past
 * zich aan. Deze suite bewaakt precies die afspraak en houdt de drie
 * oppervlakken bij elkaar — een belofte in de UI, een blokkade in de route en
 * een testvoorwaarde in de UAT-definitie mogen niet uit elkaar lopen.
 *
 * Bronbestand-toetsen (net als `horizon-client.euro-view.test.ts`): het gaat
 * hier om een regel OVER de tekst, niet om gerenderd gedrag — en de tekst zit
 * in een branch van een component die alleen met een volledige assets-pagina
 * te renderen is.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BEZIT_ACCEPTANCE } from '@/lib/uat/acceptance/bezit'

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('WF-BEZIT-21-bug4 — geen dode belofte van handmatige crypto-invoer', () => {
  it('de backend-guard die crypto-invoer weigert staat er nog (de reden voor de tekstregel)', () => {
    // Verdwijnt deze guard, dan verandert de afspraak en moet de kopij
    // opnieuw gewogen worden — dan hoort deze test bewust rood te worden.
    const route = read('app/api/holdings/route.ts')
    expect(route).toContain(
      'Crypto-posities kunnen niet via dit endpoint worden toegevoegd',
    )
  })

  it('de holdings-empty-state biedt handmatige invoer niet langer aan', () => {
    const source = read('components/core/assets-client.tsx')
    // De letterlijke belofte uit de bugmelding, in beide schrijfwijzen waarin
    // een herintroductie waarschijnlijk zou landen.
    expect(source).not.toContain('of handmatige invoer')
    expect(source).not.toContain('of handmatig invoeren')
  })

  it('de crypto-variant van die empty-state verwijst naar de koppeling', () => {
    const source = read('components/core/assets-client.tsx')
    expect(source).toContain(
      'Voeg coins toe via een exchange-koppeling of wallet-adres',
    )
    // En zegt expliciet waaróm er geen handmatig alternatief is, zodat de
    // gebruiker niet blijft zoeken naar een knop die niet bestaat.
    expect(source).toContain('Handmatig invoeren kan niet')
  })

  it('de enige aangeboden route landt direct op de koppelingenpagina', () => {
    // De tekst wijst de koppeling nu aan als het ENIGE pad; dan mag de knop
    // er niet via het legacy-pad + redirect heen. Zusje-empty-state
    // (crypto-holdings-page.tsx) doet dit al goed.
    const source = read('components/core/assets-client.tsx')
    expect(source).toContain('/mijn/koppelingen')
    expect(source).not.toContain("'/identity/koppelingen'")
  })

  it('het crypto-holdings doc-comment claimt geen asset-detail-flow meer', () => {
    // Dit comment beweerde "Handmatige toevoeging blijft via de
    // asset-detail-flow op de items-tab" — die flow bestaat niet.
    const source = read(
      'components/core/deepenings/crypto-holdings/crypto-holdings-page.tsx',
    )
    expect(source).not.toContain('Handmatige toevoeging blijft via de')
  })

  it('de UAT-precondition van WF-BEZIT-21 veronderstelt geen handmatige invoerstap meer', () => {
    const criterion = BEZIT_ACCEPTANCE.criteria.find(
      (c) => c.workflow === 'WF-BEZIT-21',
    )
    expect(criterion).toBeDefined()
    // De oude formulering beschreef een stap die de UI niet kan uitvoeren.
    expect(criterion!.given).not.toContain('handmatig toegevoegd')
    // De coins komen uit de seed (of een echte koppeling), en dat staat er nu.
    expect(criterion!.given).toContain('crypto_holdings')
  })
})
