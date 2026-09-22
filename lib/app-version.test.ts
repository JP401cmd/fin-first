import { describe, expect, it } from 'vitest'
import { APP_VERSION, APP_VERSION_DISPLAY, formatVersionForDisplay } from './app-version'

describe('formatVersionForDisplay', () => {
  it('vult de patch aan tot drie cijfers', () => {
    expect(formatVersionForDisplay('0.92.1')).toBe('0.92.001')
    expect(formatVersionForDisplay('0.92.12')).toBe('0.92.012')
    expect(formatVersionForDisplay('0.93.0')).toBe('0.93.000')
  })

  it('laat een patch van drie cijfers of meer ongemoeid', () => {
    expect(formatVersionForDisplay('0.92.123')).toBe('0.92.123')
    expect(formatVersionForDisplay('0.92.1234')).toBe('0.92.1234')
  })

  it('geeft een niet-semver-waarde ongewijzigd terug', () => {
    expect(formatVersionForDisplay('dev')).toBe('dev')
  })

  it('APP_VERSION_DISPLAY volgt APP_VERSION', () => {
    expect(APP_VERSION_DISPLAY).toBe(formatVersionForDisplay(APP_VERSION))
  })
})
