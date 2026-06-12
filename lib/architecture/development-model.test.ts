import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import archData from '@/docs/architecture/architecture.json'
import {
  AGENT_CURATION,
  SKILL_CURATION,
  TEAM_GROUPS,
  buildDevelopmentModel,
  type ClaudeTeamFacts,
} from './development-model'

// ── feiten van schijf (.claude/) — de waarheid waar de curatie mee moet syncen ─
const CLAUDE_DIR = path.resolve(process.cwd(), '.claude')

function agentIdsOnDisk(): string[] {
  const dir = path.join(CLAUDE_DIR, 'agents')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort()
}
function skillIdsOnDisk(): string[] {
  const dir = path.join(CLAUDE_DIR, 'skills')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort()
}

const diskAgents = agentIdsOnDisk()
const diskSkills = skillIdsOnDisk()
const facts = (archData as { claudeTeam?: ClaudeTeamFacts }).claudeTeam ?? { agents: [], skills: [] }

// ── sync: curatie ↔ schijf ───────────────────────────────────────────────────
describe('development-model — sync met .claude/', () => {
  it('elke agent op schijf is ingedeeld in AGENT_CURATION', () => {
    const missing = diskAgents.filter((id) => !AGENT_CURATION[id])
    expect(missing, `niet-ingedeelde agents: ${missing.join(', ')}`).toEqual([])
  })

  it('elke gecureerde agent-id bestaat op schijf', () => {
    const stale = Object.keys(AGENT_CURATION).filter((id) => !diskAgents.includes(id))
    expect(stale, `curatie verwijst naar verwijderde agents: ${stale.join(', ')}`).toEqual([])
  })

  it('elke agent-groep verwijst naar een bestaande TEAM_GROUP', () => {
    const groupIds = new Set(TEAM_GROUPS.map((g) => g.id))
    const bad = Object.entries(AGENT_CURATION).filter(([, c]) => !groupIds.has(c.groupId)).map(([id]) => id)
    expect(bad, `agents met onbekende groep: ${bad.join(', ')}`).toEqual([])
  })

  it('elke skill op schijf heeft een SKILL_CURATION-entry', () => {
    const missing = diskSkills.filter((id) => !SKILL_CURATION[id])
    expect(missing, `niet-gecureerde skills: ${missing.join(', ')}`).toEqual([])
  })

  it('elke gecureerde skill-id bestaat op schijf', () => {
    const stale = Object.keys(SKILL_CURATION).filter((id) => !diskSkills.includes(id))
    expect(stale, `curatie verwijst naar verwijderde skills: ${stale.join(', ')}`).toEqual([])
  })
})

// ── model op de echt gegenereerde feiten ─────────────────────────────────────
describe('development-model — op gegenereerde feiten', () => {
  const model = buildDevelopmentModel(facts)

  it('heeft gevulde feiten (draai npm run arch:diagram als dit faalt)', () => {
    expect(facts.agents.length).toBeGreaterThan(0)
    expect(facts.skills.length).toBeGreaterThan(0)
  })

  it('deelt alle agents in — ungrouped is leeg', () => {
    const ids = model.ungrouped.map((a) => a.id)
    expect(ids, `agents zonder curatie: ${ids.join(', ')}`).toEqual([])
  })

  it('counts kloppen met de feiten en met de schijf', () => {
    expect(model.counts.agents).toBe(facts.agents.length)
    expect(model.counts.agents).toBe(diskAgents.length)
    expect(model.counts.skills).toBe(facts.skills.length)
    expect(model.counts.skills).toBe(diskSkills.length)
    expect(model.counts.pijplijnen).toBe(model.skills.filter((s) => s.kind === 'pijplijn').length)
  })

  it('elke agent komt precies één keer voor over de groepen', () => {
    const placed = model.groups.flatMap((g) => g.agents.map((a) => a.id)).sort()
    expect(placed).toEqual(diskAgents)
  })

  it('skills staan op volgorde: pijplijnen, dan tooling, dan ongecategoriseerd', () => {
    const order = { pijplijn: 0, tooling: 1, ongecategoriseerd: 2 } as const
    const ranks = model.skills.map((s) => order[s.kind])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('elke pijplijn-skill heeft minstens één stap', () => {
    for (const s of model.skills.filter((x) => x.kind === 'pijplijn')) {
      expect(s.steps.length, `pijplijn ${s.id} heeft geen stappen`).toBeGreaterThanOrEqual(1)
    }
  })

  it('geen enkele step-agentRef wijst naar een onbestaande agent (drift-bewaking)', () => {
    const drift: string[] = []
    for (const s of model.skills) {
      for (const st of s.steps) {
        for (const ref of st.agentRefs) {
          if (!ref.exists) drift.push(`${s.id} › stap ${st.index} › ${ref.id}`)
        }
      }
    }
    expect(drift, `drift: ${drift.join(', ')}`).toEqual([])
  })
})

// ── pure unit-gevallen (defensief gedrag) ────────────────────────────────────
describe('buildDevelopmentModel — puur & defensief', () => {
  it('lege/null/undefined feiten → leeg-maar-geldig model', () => {
    const inputs: Array<ClaudeTeamFacts | null | undefined> = [undefined, null, { agents: [], skills: [] }]
    for (const input of inputs) {
      const m = buildDevelopmentModel(input)
      expect(m.ungrouped).toEqual([])
      expect(m.counts).toEqual({ agents: 0, skills: 0, pijplijnen: 0 })
      expect(m.skills).toEqual([])
      expect(m.groups.length).toBe(TEAM_GROUPS.length)
      for (const g of m.groups) expect(g.agents).toEqual([])
    }
  })

  it('onbekende skill → kind ongecategoriseerd met description-fallback', () => {
    const m = buildDevelopmentModel({
      agents: [],
      skills: [{ id: 'iets-nieuws', name: 'iets-nieuws', description: 'doet iets', steps: [] }],
    })
    expect(m.skills[0].kind).toBe('ongecategoriseerd')
    expect(m.skills[0].tagline).toBe('doet iets')
    expect(m.counts.pijplijnen).toBe(0)
  })

  it('stap met onbekende agent → agentRef.exists = false', () => {
    const m = buildDevelopmentModel({
      agents: [{ id: 'coder', name: 'coder', description: '' }],
      skills: [
        {
          id: 'new-feature',
          name: 'new-feature',
          description: '',
          steps: [{ index: 1, title: 'Bouwen', agents: ['coder', 'verdwenen-agent'] }],
        },
      ],
    })
    const refs = m.skills[0].steps[0].agentRefs
    expect(refs.find((r) => r.id === 'coder')?.exists).toBe(true)
    expect(refs.find((r) => r.id === 'verdwenen-agent')?.exists).toBe(false)
  })

  it('agent op schijf zonder curatie → in ungrouped met description-fallbacks', () => {
    const m = buildDevelopmentModel({
      agents: [{ id: 'ongecureerd', name: 'ongecureerd', description: 'rol-tekst' }],
      skills: [],
    })
    expect(m.ungrouped.map((a) => a.id)).toEqual(['ongecureerd'])
    expect(m.ungrouped[0].rol).toBe('rol-tekst')
    expect(m.ungrouped[0].inzet).toBe('rol-tekst')
  })
})
