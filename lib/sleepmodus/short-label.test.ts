import { describe, it, expect } from 'vitest'
import { shortBudgetLabel } from './short-label'

describe('shortBudgetLabel', () => {
  it('gebruikt gecureerde korte vormen voor bekende template-namen', () => {
    expect(shortBudgetLabel('Gas, water, licht')).toBe('Gas & licht')
    expect(shortBudgetLabel('Telefoon, internet & tv')).toBe('Telefoon & tv')
    expect(shortBudgetLabel('Verzekeringen wonen & gezondheid')).toBe('Verzekeringen')
    expect(shortBudgetLabel('Gemeentelijke & overige vaste lasten')).toBe('Gemeente & overig')
    expect(shortBudgetLabel('Onderhoud huis & tuin')).toBe('Onderhoud')
    expect(shortBudgetLabel('Inventaris & apparaten')).toBe('Inventaris')
    expect(shortBudgetLabel('Abonnementen & contributies')).toBe('Abonnementen')
  })

  it('is tolerant voor hoofdletters en omringende spaties', () => {
    expect(shortBudgetLabel('  gas, water, licht  ')).toBe('Gas & licht')
  })

  it('laat korte namen ongemoeid', () => {
    expect(shortBudgetLabel('Boodschappen')).toBe('Boodschappen')
    expect(shortBudgetLabel('Huur / hypotheek')).toBe('Huur / hypotheek')
    expect(shortBudgetLabel('Vervoer')).toBe('Vervoer')
  })

  it('knipt lange eigen namen op de eerste scheiding, zonder ellipsis', () => {
    expect(shortBudgetLabel('Boodschappen & huishoudelijk')).toBe('Boodschappen')
    expect(shortBudgetLabel('Sparen, beleggen en pensioen')).toBe('Sparen')
  })

  it('laat lange namen zonder scheiding heel (line-clamp vangt ze op)', () => {
    expect(shortBudgetLabel('Onvoorzienekostenpost')).toBe('Onvoorzienekostenpost')
  })

  it('valt veilig terug op lege invoer', () => {
    expect(shortBudgetLabel('')).toBe('')
    // @ts-expect-error — defensief tegen runtime-null
    expect(shortBudgetLabel(null)).toBe('')
  })
})
