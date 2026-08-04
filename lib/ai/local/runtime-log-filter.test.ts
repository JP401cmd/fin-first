import { describe, it, expect, vi, afterEach } from 'vitest'
import { classifyRuntimeLog, withRuntimeLogFilter } from './runtime-log-filter'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('classifyRuntimeLog', () => {
  // De drie regels die de gebruiker als "Console Error" binnenkreeg bij het
  // laden van E4B. Alle drie gezond: ze zeggen juist dat WebGPU gevonden is.
  it('de gemelde opstartregels zijn info, geen fout', () => {
    expect(classifyRuntimeLog('INFO: [environment.cc:30] Creating LiteRT environment with options')).toBe('info')
    expect(
      classifyRuntimeLog('INFO: [accelerator_registry.cc:54] RegisterAccelerator: ptr=0xfa1f30, name=GPU WebGPU'),
    ).toBe('info')
    expect(classifyRuntimeLog('INFO: [cpu_registry.cc:42] CPU accelerator registered.')).toBe('info')
  })

  it('WARNING wordt een waarschuwing, ERROR en FATAL blijven fout', () => {
    expect(classifyRuntimeLog('WARNING: [foo.cc:1] iets')).toBe('warning')
    expect(classifyRuntimeLog('ERROR: [foo.cc:1] iets')).toBe('error')
    expect(classifyRuntimeLog('FATAL: [foo.cc:1] iets')).toBe('error')
  })

  // DE KERN VAN DE FILTER: onze eigen kanaries mogen NOOIT gedempt worden. Zij
  // zijn juist het diagnostische pad bij een mislukte laadpoging.
  it('onze eigen [lokale-ai]-meldingen blijven onaangeroerd fout', () => {
    expect(classifyRuntimeLog('[lokale-ai] Engine.create mislukt:')).toBe('error')
    expect(classifyRuntimeLog('[lokale-ai] inferentie mislukt:')).toBe('error')
  })

  it('onbekende vorm → fout; bij twijfel liever te veel zien', () => {
    expect(classifyRuntimeLog('INFO zonder bronverwijzing')).toBe('error')
    expect(classifyRuntimeLog('')).toBe('error')
    expect(classifyRuntimeLog('Uncaught TypeError: x is not a function')).toBe('error')
  })
})

describe('withRuntimeLogFilter', () => {
  it('degradeert INFO naar debug en laat echte fouten door', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})

    await withRuntimeLogFilter(async () => {
      console.error('INFO: [environment.cc:30] Creating LiteRT environment with options')
      console.error('[lokale-ai] Engine.create mislukt:', new Error('boem'))
    })

    expect(debug).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0][0]).toContain('[lokale-ai]')
  })

  it('herstelt console.error ook wanneer het werk werpt', async () => {
    const before = console.error
    await expect(
      withRuntimeLogFilter(async () => {
        throw new Error('laden mislukt')
      }),
    ).rejects.toThrow('laden mislukt')
    expect(console.error).toBe(before)
  })

  // Een chatsessie die opent terwijl de engine nog laadt, zou anders de
  // originele console.error te vroeg terugzetten.
  it('geneste aanroepen herstellen pas bij de buitenste', async () => {
    const before = console.error
    await withRuntimeLogFilter(async () => {
      await withRuntimeLogFilter(async () => {
        expect(console.error).not.toBe(before)
      })
      expect(console.error, 'binnenste mag nog niet herstellen').not.toBe(before)
    })
    expect(console.error).toBe(before)
  })
})
