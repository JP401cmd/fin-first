import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Given een geïnstalleerde PWA of browsertab, When de browser /favicon.ico
// opvraagt (Next serveert app/favicon.ico), Then draagt die het TriFinity
// T.-merk — niet de create-next-app-default (Vercel-driehoek). Die default
// bleef na de template-init staan en verscheen als wazig zwart rondje met
// witte driehoek op het PWA-laadscherm (melding 31 aug 2026).
const VERCEL_TEMPLATE_FAVICON_MD5 = 'c30c7d42707a47a3f4591831641e50dc'

const faviconPath = join(__dirname, 'favicon.ico')

describe('app/favicon.ico', () => {
  const buf = readFileSync(faviconPath)

  it('is niet de create-next-app-default (Vercel-driehoek)', () => {
    const md5 = createHash('md5').update(buf).digest('hex')
    expect(md5).not.toBe(VERCEL_TEMPLATE_FAVICON_MD5)
  })

  it('is een geldig .ico met frames tot minimaal 48px', () => {
    // ICONDIR: reserved(2)=0, type(2)=1 (icon), count(2)
    expect(buf.readUInt16LE(0)).toBe(0)
    expect(buf.readUInt16LE(2)).toBe(1)
    const count = buf.readUInt16LE(4)
    expect(count).toBeGreaterThanOrEqual(3)
    // ICONDIRENTRY per frame: width op offset 6 + i*16 (0 = 256px)
    const widths = Array.from({ length: count }, (_, i) => {
      const w = buf.readUInt8(6 + i * 16)
      return w === 0 ? 256 : w
    })
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(48)
  })
})
