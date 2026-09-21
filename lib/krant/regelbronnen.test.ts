import { describe, it, expect } from 'vitest'
import { isRegelbron } from './regelbronnen'

describe('isRegelbron', () => {
  it('herkent regelbronnen inclusief subdomeinen', () => {
    expect(isRegelbron('https://www.rijksoverheid.nl/onderwerpen/aow')).toBe(true)
    expect(isRegelbron('https://download.belastingdienst.nl/x.pdf')).toBe(true)
    expect(isRegelbron('https://duo.nl/particulier/rente.jsp')).toBe(true)
    expect(isRegelbron('https://zoek.officielebekendmakingen.nl/stb-2026-1.html')).toBe(true)
  })

  it('weigert lookalikes, marktbronnen en ongeldige URL\'s', () => {
    expect(isRegelbron('https://nos.nl/artikel/1')).toBe(false)
    expect(isRegelbron('https://rijksoverheid.nl.evil.example/aow')).toBe(false)
    expect(isRegelbron('https://notbelastingdienst.nl/x')).toBe(false)
    expect(isRegelbron('geen-url')).toBe(false)
  })

  it('eist https op de standaardpoort', () => {
    expect(isRegelbron('http://duo.nl/particulier/rente.jsp')).toBe(false)
    expect(isRegelbron('https://duo.nl:8443/particulier/rente.jsp')).toBe(false)
    expect(isRegelbron('https://duo.nl:443/particulier/rente.jsp')).toBe(true)
  })
})
