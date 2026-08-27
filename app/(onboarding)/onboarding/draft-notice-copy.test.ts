import { describe, it, expect } from 'vitest'
import {
  DRAFT_RESTORED_NOTICE,
  SAVE_FAILED_NOTICE,
  SENSITIVE_FIELD_MENTIONS,
} from './draft-notice-copy'
import { SENSITIVE_DRAFT_KEYS } from './draft-persistence'

/**
 * Regressie-lock op kaart C3 — "Onboarding-invoer gaat verloren".
 *
 * Het gedrag (alleen een niet-gevoelig draft persisteren) is bewust en blijft;
 * de meldingen mogen daar nooit meer overheen claimen dat álles bewaard/
 * hersteld is.
 */
describe('onboarding herstel-melding (C3)', () => {
  it('claimt niet langer dat ingevulde gegevens zijn hersteld', () => {
    const text = `${DRAFT_RESTORED_NOTICE.label} ${DRAFT_RESTORED_NOTICE.body}`.toLowerCase()
    expect(text).not.toContain('zijn hersteld')
    expect(text).not.toContain('gegevens hersteld')
  })

  it('benoemt elk niet-bewaard veld, zodat de tekst niet stil kan verouderen', () => {
    const body = DRAFT_RESTORED_NOTICE.body.toLowerCase()
    for (const key of SENSITIVE_DRAFT_KEYS) {
      const mentions = SENSITIVE_FIELD_MENTIONS[key]
      expect(
        mentions.some((word) => body.includes(word.toLowerCase())),
        `herstel-melding noemt "${key}" niet (verwacht een van: ${mentions.join(', ')})`,
      ).toBe(true)
    }
  })

  it('vertelt zowel wat WEL terugkomt als wat NIET bewaard blijft', () => {
    const body = DRAFT_RESTORED_NOTICE.body.toLowerCase()
    expect(body).toContain('onthouden')
    expect(body).toContain('bewaren we niet')
  })

  it('houdt een mention-regel voor precies de gevoelige velden', () => {
    expect(Object.keys(SENSITIVE_FIELD_MENTIONS).sort()).toEqual([...SENSITIVE_DRAFT_KEYS].sort())
  })
})

describe('onboarding opslag-foutmelding (C3)', () => {
  it('claimt niet langer onvoorwaardelijk dat antwoorden blijven staan', () => {
    expect(SAVE_FAILED_NOTICE.body.toLowerCase()).not.toContain('staan nog hier')
  })

  it('waarschuwt expliciet dat verversen de invoer wist', () => {
    const body = SAVE_FAILED_NOTICE.body.toLowerCase()
    expect(body).toContain('ververs de pagina niet')
    expect(body).toContain('kwijt')
  })

  it('houdt de uitnodiging om het opnieuw te proberen', () => {
    expect(SAVE_FAILED_NOTICE.body.toLowerCase()).toContain('opnieuw')
  })
})
