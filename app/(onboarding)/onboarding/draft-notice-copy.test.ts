import { describe, it, expect } from 'vitest'
import {
  DRAFT_RESTORED_NOTICE,
  INCOMPLETE_INPUT_NOTICE,
  SAVE_FAILED_NOTICE,
  UNRESTORED_FIELD_MENTIONS,
  resolveNoticeDisplay,
} from './draft-notice-copy'
import { UNRESTORED_DRAFT_KEYS } from './draft-persistence'

/**
 * Regressie-lock op kaart C3 (melding mag niet méér claimen dan het product
 * waarmaakt) en op kaart UR2-01 (het product bewaart nu wél alles, dus de
 * melding mag ook niet MINDER claimen: een gebruiker die zijn bedragen gewoon
 * ziet staan, mag niet lezen dat ze weg zijn).
 */
describe('onboarding herstel-melding (C3 + UR2-01)', () => {
  it('bevestigt dat de ingevulde antwoorden terug zijn', () => {
    const body = DRAFT_RESTORED_NOTICE.body.toLowerCase()
    expect(body).toContain('antwoorden')
    expect(body).toContain('bedragen')
  })

  it('claimt niet dat bedragen of posten verloren zijn', () => {
    const body = DRAFT_RESTORED_NOTICE.body.toLowerCase()
    expect(body).not.toContain('vul je opnieuw in')
    expect(body).not.toContain('bewaren we niet op dit apparaat')
  })

  it('benoemt elk niet-hersteld veld, zodat de tekst niet stil kan verouderen', () => {
    const body = DRAFT_RESTORED_NOTICE.body.toLowerCase()
    for (const key of UNRESTORED_DRAFT_KEYS) {
      const mentions = UNRESTORED_FIELD_MENTIONS[key]
      expect(
        mentions.some((word: string) => body.includes(word.toLowerCase())),
        `herstel-melding noemt "${key}" niet (verwacht een van: ${mentions.join(', ')})`,
      ).toBe(true)
    }
  })

  it('houdt een mention-regel voor precies de niet-herstelde velden', () => {
    expect(Object.keys(UNRESTORED_FIELD_MENTIONS).sort()).toEqual(
      [...UNRESTORED_DRAFT_KEYS].sort(),
    )
  })
})

describe('onboarding opslag-foutmelding (C3 + UR2-01)', () => {
  it('claimt niet langer onvoorwaardelijk dat antwoorden blijven staan', () => {
    expect(SAVE_FAILED_NOTICE.body.toLowerCase()).not.toContain('staan nog hier')
  })

  it('waarschuwt niet meer voor verversen — het concept staat server-side', () => {
    const body = SAVE_FAILED_NOTICE.body.toLowerCase()
    expect(body).not.toContain('ververs de pagina niet')
    expect(body).not.toContain('kwijt')
    expect(body).toContain('concept')
  })

  it('houdt de uitnodiging om het opnieuw te proberen', () => {
    expect(SAVE_FAILED_NOTICE.body.toLowerCase()).toContain('opnieuw')
  })
})

/**
 * Twee meldingen, twee oorzaken.
 *
 * Het client-validatiepad (ontbrekende naam/geboortedatum) zette dezelfde
 * `saveError`-state als een écht mislukte opslag, en de banner toonde daarom
 * altijd "Opslaan mislukt / ververs de pagina niet" plus een knop "Opnieuw
 * proberen" — terwijl er nooit een opslagpoging was geweest. De specifieke
 * boodschap ("vul eerst je naam en geboortedatum in") werd nergens getoond.
 * `resolveNoticeDisplay` scheidt de twee gevallen, zodat de banner een pure
 * consument is van één beslissing.
 */
describe('onboarding melding-weergave — validatie vs. opslagfout', () => {
  it('toont niets zonder melding', () => {
    expect(resolveNoticeDisplay(null)).toBeNull()
  })

  it('validatiepad: eigen label, het specifieke bericht, geen herkansing', () => {
    const bericht = 'Vul eerst je naam en geboortedatum in.'
    const display = resolveNoticeDisplay({ kind: 'validation', message: bericht })

    expect(display?.label).toBe(INCOMPLETE_INPUT_NOTICE.label)
    expect(display?.body).toBe(bericht)
    expect(display?.showRetry).toBe(false)
  })

  it('validatiepad: geen opslag-taal — niet "mislukt", niet "ververs"', () => {
    const display = resolveNoticeDisplay({
      kind: 'validation',
      message: 'Vul eerst je naam en geboortedatum in.',
    })
    const tekst = `${display?.label} ${display?.body}`.toLowerCase()

    expect(tekst).not.toContain('opslaan mislukt')
    expect(tekst).not.toContain('ververs')
    expect(tekst).not.toContain('kwijt')
  })

  it('validatiepad zonder bericht valt terug op de vaste toelichting', () => {
    const display = resolveNoticeDisplay({ kind: 'validation', message: '' })
    expect(display?.body).toBe(INCOMPLETE_INPUT_NOTICE.body)
  })

  it('opslagpad: onveranderd de save-copy mét herkansing', () => {
    // Het opslaggeval draagt bewust GEEN message: de banner toont daar de
    // vaste, client-veilige tekst. Een message-veld dat nergens landt, nodigt
    // uit om te denken dat de echte foutmelding de gebruiker bereikt.
    const display = resolveNoticeDisplay({ kind: 'save' })

    expect(display?.label).toBe(SAVE_FAILED_NOTICE.label)
    expect(display?.body).toBe(SAVE_FAILED_NOTICE.body)
    expect(display?.showRetry).toBe(true)
  })

  it('de twee labels zijn onderscheidend — anders leest de gebruiker hetzelfde', () => {
    expect(INCOMPLETE_INPUT_NOTICE.label).not.toBe(SAVE_FAILED_NOTICE.label)
  })
})
