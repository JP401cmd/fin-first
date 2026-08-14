import { describe, it, expect, beforeEach } from 'vitest'
import { purgeAccountScopedStorage, purgeOnIdentityChange } from './browser-account-storage'

/**
 * Een wisseling van account op één toestel mag geen gegevens van de vorige
 * gebruiker laten staan. De achtergrond staat in browser-account-storage.ts.
 */

describe('purgeAccountScopedStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('verwijdert gegevens en concepten van het uitgelogde account', () => {
    localStorage.setItem('fintwo_import_session', '{"accountId":"uuid","fileName":"ABN.csv"}')
    localStorage.setItem('trifinity_onboarding_draft', '{"inkomen":4000}')
    localStorage.setItem('trifinity_onboarding_welcome_seen', 'true')
    localStorage.setItem('vrijheidscheck_draft', '{"stap":3}')
    localStorage.setItem('trifinity-chat-wft-accepted', 'true')
    localStorage.setItem('trifinity_perspective', 'samen')
    localStorage.setItem('trifinity_coach_dismissed_suggestions', '["s1"]')
    localStorage.setItem('budget-edit-draft-abc', '{"bedrag":250}')
    localStorage.setItem('budget-new-draft', '{"naam":"Boodschappen"}')
    localStorage.setItem('tf-celebrated:eerste-ton', 'true')

    purgeAccountScopedStorage()

    for (const key of [
      'fintwo_import_session',
      'trifinity_onboarding_draft',
      'trifinity_onboarding_welcome_seen',
      'vrijheidscheck_draft',
      'trifinity-chat-wft-accepted',
      'trifinity_perspective',
      'trifinity_coach_dismissed_suggestions',
      'budget-edit-draft-abc',
      'budget-new-draft',
      'tf-celebrated:eerste-ton',
    ]) {
      expect(localStorage.getItem(key), key).toBeNull()
    }
  })

  it('verwijdert krant en command-palette van élk account, incl. de oude sleutels', () => {
    // Beide sleutels renderden gebruikersinhoud: de krant een op het financiële
    // profiel gegenereerde editie, de recents de namen van bezittingen en schulden.
    localStorage.setItem('trifinity_news_cache', '{"items":[]}')
    localStorage.setItem('trifinity_news_cache:user-a', '{"items":[]}')
    localStorage.setItem('trifinity.cmdk.recents', '[{"label":"Lening moeder"}]')
    localStorage.setItem('trifinity.cmdk.recents:user-a', '[{"label":"Hypotheek"}]')

    purgeAccountScopedStorage()

    expect(localStorage.getItem('trifinity_news_cache')).toBeNull()
    expect(localStorage.getItem('trifinity_news_cache:user-a')).toBeNull()
    expect(localStorage.getItem('trifinity.cmdk.recents')).toBeNull()
    expect(localStorage.getItem('trifinity.cmdk.recents:user-a')).toBeNull()
  })

  it('verwijdert de navigatiestapel, die een uitlog in hetzelfde tabblad overleeft', () => {
    sessionStorage.setItem('fintwo:nav-stacks', '[{"title":"Hypotheek Rabobank"}]')

    purgeAccountScopedStorage()

    expect(sessionStorage.getItem('fintwo:nav-stacks')).toBeNull()
  })

  it('verloopt de perspectief-cookie, die het server-side dataladen stuurt', () => {
    document.cookie = 'tf_perspective=samen; path=/'
    expect(document.cookie).toContain('tf_perspective=samen')

    purgeAccountScopedStorage()

    expect(document.cookie).not.toContain('tf_perspective=samen')
  })

  it('laat toestelgebonden weergavevoorkeuren staan', () => {
    // Die horen bij de brówser, niet bij het account: ze wissen zou een
    // uitlogactie een instellingen-reset maken. `trifinity-chat-pinned` staat er
    // bewust bij — dat is een boolean of het chatpaneel vastgezet is, geen bericht.
    localStorage.setItem('budgets-view-mode', 'donut')
    localStorage.setItem('horizon_overlay_visible', 'true')
    localStorage.setItem('collapsible_assets-insight', 'closed')
    localStorage.setItem('trifinity-chat-pinned', 'true')

    purgeAccountScopedStorage()

    expect(localStorage.getItem('budgets-view-mode')).toBe('donut')
    expect(localStorage.getItem('horizon_overlay_visible')).toBe('true')
    expect(localStorage.getItem('collapsible_assets-insight')).toBe('closed')
    expect(localStorage.getItem('trifinity-chat-pinned')).toBe('true')
  })
})

describe('purgeOnIdentityChange', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('ruimt op wanneer een ánder account op dit toestel binnenkomt', () => {
    // Given A was hier ingelogd en heeft de browser dichtgegooid — er is dus nooit
    // een uitlogpad doorlopen, de klassieke manier waarop een purge-bij-uitloggen
    // zijn doel mist.
    purgeOnIdentityChange('user-a')
    localStorage.setItem('trifinity_onboarding_draft', '{"inkomen":4000}')

    // When B op hetzelfde toestel inlogt
    purgeOnIdentityChange('user-b')

    // Then zijn A's gegevens weg
    expect(localStorage.getItem('trifinity_onboarding_draft')).toBeNull()
  })

  it('laat de eigen gegevens staan wanneer dezelfde gebruiker terugkomt', () => {
    // Draait bij élke app-render; een concept mag niet bij elke navigatie sneuvelen.
    purgeOnIdentityChange('user-a')
    localStorage.setItem('trifinity_onboarding_draft', '{"inkomen":4000}')

    purgeOnIdentityChange('user-a')
    purgeOnIdentityChange('user-a')

    expect(localStorage.getItem('trifinity_onboarding_draft')).toBe('{"inkomen":4000}')
  })
})
