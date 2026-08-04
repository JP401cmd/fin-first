import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  findForeignScript,
  findRepetitionLoop,
  evaluateProofTask,
  runLocalOutputProof,
  LOCAL_PROOF_TASKS,
  PROOF_TIMEOUT_MS,
  type ProofTask,
} from './output-proof'

const task = (id: string): ProofTask => {
  const found = LOCAL_PROOF_TASKS.find((t) => t.id === id)
  if (!found) throw new Error(`onbekende proeftaak ${id}`)
  return found
}

/** Antwoorden waarmee een gezond toestel de drie taken haalt. */
const GEZONDE_ANTWOORDEN: Record<string, string> = {
  'echo-woord': 'vrijheid',
  json: '[{"status":"ok"}]',
  'echo-zin': 'Een euro is opgeslagen tijd, en tijd is de enige echte munt.',
}

function gezondeSessie() {
  return {
    generate: vi.fn(async (messages: { role: string; content: string }[]) => {
      const vraag = messages.find((m) => m.role === 'user')?.content ?? ''
      const hit = LOCAL_PROOF_TASKS.find((t) => t.user === vraag)
      return hit ? GEZONDE_ANTWOORDEN[hit.id] : ''
    }),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('findForeignScript', () => {
  it('laat gewoon Nederlands met accenten en euroteken door', () => {
    expect(findForeignScript('Je hebt zo’n €1.234 aan café-uitgaven — prima!')).toBeNull()
  })

  it('vindt Japans en Cyrillisch — precies wat de Adreno-meting opleverde', () => {
    expect(findForeignScript('Amsterdam です')).toBe('で')
    expect(findForeignScript('antwoord: привет')).toBe('п')
  })
})

describe('findRepetitionLoop', () => {
  it('gewone zin is geen lus', () => {
    expect(findRepetitionLoop('rood, blauw en groen zijn drie kleuren')).toBeNull()
  })

  it('vindt een woord dat vier keer achter elkaar staat', () => {
    expect(findRepetitionLoop('het is de de de de hoofdstad')).toBe('de')
  })

  it('vindt ook een herhaalde woordgroep', () => {
    expect(findRepetitionLoop('ja nee ja nee ja nee ja nee')).toBe('ja nee')
  })

  it('drie keer is nog geen lus — de grens ligt bewust op vier', () => {
    expect(findRepetitionLoop('ho ho ho')).toBeNull()
  })
})

describe('evaluateProofTask', () => {
  it('gezonde antwoorden slagen op alle drie de taken', () => {
    for (const t of LOCAL_PROOF_TASKS) {
      expect(evaluateProofTask(t, GEZONDE_ANTWOORDEN[t.id]), `taak ${t.id}`).toBeNull()
    }
  })

  it('leeg antwoord zakt', () => {
    expect(evaluateProofTask(task('echo-woord'), '   ')).toBe('het model gaf een leeg antwoord')
  })

  // DE LES VAN "DEN HAAG". De eerste versie vroeg naar de hoofdstad van
  // Nederland en verwierp een echte gebruiker op "Den Haag" — een coherent,
  // verdedigbaar antwoord. Een integriteitstoets mag nooit afhangen van parate
  // kennis of van een twistpunt; het goede antwoord hoort in de vraag te staan.
  describe('de proefvragen toetsen integriteit, geen kennis', () => {
    it('elk antwoord is letterlijk uit de vraag af te leiden', () => {
      for (const t of LOCAL_PROOF_TASKS) {
        const gevraagd = t.user.toLowerCase()
        const antwoord = GEZONDE_ANTWOORDEN[t.id].toLowerCase()
        const kern = antwoord.replace(/[^\p{L}\d]/gu, '').slice(0, 12)
        expect(gevraagd.replace(/[^\p{L}\d]/gu, ''), `taak ${t.id}`).toContain(kern)
      }
    })

    it('geen enkele proefvraag stelt een kennisvraag', () => {
      for (const t of LOCAL_PROOF_TASKS) {
        expect(t.user, `taak ${t.id}`).not.toMatch(/\b(wat is|wie is|hoeveel|waar ligt|noem)\b/i)
      }
    })

    it('elke taak zegt in gewone taal wat er verwacht wordt', () => {
      for (const t of LOCAL_PROOF_TASKS) {
        expect(t.verwacht.length, `taak ${t.id}`).toBeGreaterThan(5)
      }
    })
  })

  it('de zin-echo verdraagt leestekens en hoofdletters, maar geen rommel', () => {
    const zin = GEZONDE_ANTWOORDEN['echo-zin']
    expect(evaluateProofTask(task('echo-zin'), zin.toLowerCase().replace(/[.,]/g, ''))).toBeNull()
    expect(evaluateProofTask(task('echo-zin'), 'Een euro is')).toBe('de zin kwam er niet compleet uit')
  })

  // De corruptie-toetsen gaan vóór de taak-toets: "er stond Japans in" is een
  // eerlijker reden dan "het antwoord klopte niet", ook als het antwoord toevallig
  // het goede woord bevat.
  it('vreemd schrift wint van de taak-toets', () => {
    const reason = evaluateProofTask(task('echo-woord'), 'Amsterdam ですです')
    expect(reason).toContain('ander schrift')
  })

  it('herhaallus wint van de taak-toets', () => {
    const reason = evaluateProofTask(task('echo-woord'), 'Amsterdam Amsterdam Amsterdam Amsterdam')
    expect(reason).toContain('herhaling')
  })

  it('json-taak zakt zonder bruikbare JSON', () => {
    expect(evaluateProofTask(task('json'), 'Natuurlijk! Hier komt hij.')).toBe(
      'het model leverde geen bruikbare JSON',
    )
  })

  it('json-taak accepteert een code-fence — dat doet het echte pad ook', () => {
    expect(evaluateProofTask(task('json'), '```json\n[{"status":"ok"}]\n```')).toBeNull()
  })

  it('woord-echo zakt als het gevraagde woord er niet is', () => {
    expect(evaluateProofTask(task('echo-woord'), 'natuurlijk!')).toBe(
      'het gevraagde woord kwam niet terug',
    )
  })
})

describe('runLocalOutputProof', () => {
  it('gezond toestel: alle drie de taken, ok zonder redenen', async () => {
    const sessie = gezondeSessie()
    const outcome = await runLocalOutputProof(sessie)

    expect(outcome.ok).toBe(true)
    expect(outcome.reasons).toEqual([])
    expect(outcome.results).toHaveLength(3)
    expect(sessie.generate).toHaveBeenCalledTimes(3)
  })

  // DE KERNTEST. De upstream-bug (LiteRT #8065) is "de eerste inferentie klopt,
  // alles daarna is stilletjes rommel". Eén proefgeneratie zou dit toestel dus
  // goedkeuren; daarom draaien er drie.
  it('eerste antwoord goed, daarna soep → zakt alsnog', async () => {
    let call = 0
    const sessie = {
      generate: vi.fn(async () => {
        call++
        return call === 1 ? 'vrijheid' : 'ですです привет ですです привет'
      }),
    }

    const outcome = await runLocalOutputProof(sessie)

    expect(outcome.ok).toBe(false)
    expect(outcome.reasons[0]).toContain('ander schrift')
    // Gestopt bij de eerste zakking: taak 3 is niet meer gedraaid.
    expect(sessie.generate).toHaveBeenCalledTimes(2)
    expect(outcome.results).toHaveLength(2)
  })

  it('inferentiefout wordt een leesbare reden, geen throw', async () => {
    const sessie = { generate: vi.fn(async () => { throw new Error('device lost') }) }
    const outcome = await runLocalOutputProof(sessie)

    expect(outcome.ok).toBe(false)
    expect(outcome.reasons[0]).toContain('liep vast tijdens het antwoorden')
    expect(sessie.generate).toHaveBeenCalledTimes(1)
  })

  // Te traag en vastgelopen zijn verschillende problemen: het eerste is in
  // beheer op te rekken, het tweede niet. De melding moet dat onderscheiden,
  // anders gaat iemand een tijdslimiet zoeken bij een crash of andersom.
  it('een tijdslimiet leest anders dan een crash, mét het aantal seconden', async () => {
    vi.useFakeTimers()
    const sessie = { generate: vi.fn(() => new Promise<string>(() => {})) }

    const draaiend = runLocalOutputProof(sessie, { timeoutMs: 12_000 })
    await vi.advanceTimersByTimeAsync(12_001)
    const outcome = await draaiend

    expect(outcome.reasons[0]).toContain('langer dan 12 seconden')
    expect(outcome.reasons[0]).not.toContain('liep vast tijdens')
  })

  // De diagnose staat of valt hiermee: zonder het echte antwoord is "het
  // antwoord klopte niet" niet te onderscheiden van token-soep.
  it('de faalreden toont het daadwerkelijke antwoord', async () => {
    const sessie = { generate: vi.fn(async () => 'ですです привет ですです привет') }
    const outcome = await runLocalOutputProof(sessie)

    expect(outcome.reasons[0]).toContain('Het model antwoordde:')
    expect(outcome.reasons[0]).toContain('ですです')
  })

  // De meting zag naast corrupte uitvoer ook een hang (~3 min GPU-last). Zonder
  // grens zou de proef daar blijven staan.
  it('een hangende generatie wordt afgekapt in plaats van te blijven staan', async () => {
    vi.useFakeTimers()
    const sessie = { generate: vi.fn(() => new Promise<string>(() => {})) }

    const draaiend = runLocalOutputProof(sessie)
    await vi.advanceTimersByTimeAsync(PROOF_TIMEOUT_MS + 1)
    const outcome = await draaiend

    expect(outcome.ok).toBe(false)
    expect(outcome.reasons[0]).toContain('langer dan 45 seconden')
  })
})
