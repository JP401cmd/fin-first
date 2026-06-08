# Check-in reflectievragen — diversificatie & aanspreekvorm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maak de "gespreksstarters" (reflectievragen) aan het einde van de maandelijkse check-in gevarieerder, breder en relevanter — en grammaticaal correct voor zowel solo- als huishoud-gebruikers — door de generatie te verplaatsen naar een pure, geteste engine.

**Architecture:** Verplaats alle generatie-logica uit `app/api/checkin/gespreksstarters/route.ts` naar een pure module `lib/checkin/gespreksstarters.ts` (spiegelt `lib/aandachtspunten.ts`). De engine bevat: een `Voice`-laag (solo "je/jij" vs huishouden "jullie", incl. werkwoordvervoeging), detectoren die per onderwerp een kandidaat met 2-3 formuleringsvarianten leveren, deterministische variant-rotatie op maand-index, en relevantie-scoring met diversiteit-cap i.p.v. sentiment-slice. De route wordt dun (data ophalen + engine aanroepen).

**Tech Stack:** TypeScript, Next.js 16 route handlers, Supabase (server client), Vitest. Geen nieuwe dependencies.

**Spec:** `docs/superpowers/specs/2026-06-08-checkin-reflectievragen-diversificatie-design.md`

> **Uitvoeringsnotitie (correctie tijdens implementatie, commit 36dc7b25):** De `Voice`
> is uitgebreid met inversie-vormen `heb`/`wil`/`kun` (naast `hebt`/`wilt`/`bent`) omdat
> Nederlands in vraag-inversie de 2e-persoons "-t" laat vallen ("je hebt" → "heb je",
> "je wilt" → "wil je", "je kunt" → "kun je"). In geïnverteerde posities (werkwoord vóór
> het onderwerp) gebruiken templates `v.heb`/`v.wil`/`v.kun`; in niet-geïnverteerde
> posities blijven `v.hebt`/`v.wilt`/`v.bent`. De template-strings in Task 3 en Task 5
> hieronder zijn op die plekken naar de inversie-vorm gebracht.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid |
|---|---|
| `lib/checkin/gespreksstarters.ts` | **Nieuw.** Pure engine: types, `Voice`, freedom-helpers, detectoren, scoring/selectie, `buildGespreksstarters()`. |
| `lib/checkin/gespreksstarters.test.ts` | **Nieuw.** Unit-tests engine. |
| `lib/checkin/fire-age.ts` | **Nieuw.** Gedeelde FIRE-leeftijd-helper (DRY — nu inline in overview-route). |
| `lib/checkin/fire-age.test.ts` | **Nieuw.** Unit-tests FIRE-helper. |
| `app/api/checkin/gespreksstarters/route.ts` | **Herschrijven naar dun.** Data ophalen + perspectief + `buildGespreksstarters()`. |
| `app/api/checkin/overview/route.ts` | **Wijzigen.** Gebruik gedeelde `computeFireAge()` i.p.v. inline duplicaat. |
| `lib/regression-tests/suites/checkin-flow.ts` | **Wijzigen.** Importeer onderwerp-id-registry uit engine + voice-contract-test. |

> **Belangrijk patroon:** de bestaande regressietests in `checkin-flow.ts` repliceren logica *lokaal* (eigen kopie van `freedomLabel`, eigen ID-lijst). Ze breken dus niet door engine-wijzigingen, maar worden wel stale. Taak 9 maakt ze weer betekenisvol.

---

## Task 1: Engine-scaffold — types, `Voice`, freedom-helpers

**Files:**
- Create: `lib/checkin/gespreksstarters.ts`
- Test: `lib/checkin/gespreksstarters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/checkin/gespreksstarters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildVoice,
  freedomDays,
  freedomLabel,
  formatEUR,
} from './gespreksstarters'

describe('buildVoice', () => {
  it('household uses jullie + plural verbs', () => {
    const v = buildVoice('household')
    expect(v.subj).toBe('jullie')
    expect(v.subjCap).toBe('Jullie')
    expect(v.poss).toBe('jullie')
    expect(v.hebt).toBe('hebben')
    expect(v.wilt).toBe('willen')
    expect(v.bent).toBe('zijn')
    expect(v.voelt).toBe('voelen jullie je')
    expect(v.samen).toBe('samen')
  })

  it('solo uses je/jij + singular verbs', () => {
    const v = buildVoice('solo')
    expect(v.subj).toBe('je')
    expect(v.subjCap).toBe('Je')
    expect(v.poss).toBe('je')
    expect(v.hebt).toBe('hebt')
    expect(v.wilt).toBe('wilt')
    expect(v.bent).toBe('bent')
    expect(v.voelt).toBe('voel je je')
    expect(v.samen).toBe('voor jezelf')
  })
})

describe('freedomDays', () => {
  it('returns 0 when dailyExpenses <= 0', () => {
    expect(freedomDays(1000, 0)).toBe(0)
  })
  it('rounds amount / dailyExpenses', () => {
    expect(freedomDays(1000, 100)).toBe(10)
    expect(freedomDays(-450, 100)).toBe(5) // uses absolute value
  })
})

describe('freedomLabel', () => {
  it('formats days, months and years in Dutch', () => {
    expect(freedomLabel(1)).toBe('1 dag')
    expect(freedomLabel(5)).toBe('5 dagen')
    expect(freedomLabel(30)).toBe('1 maanden')
    expect(freedomLabel(45)).toBe('1 maanden en 15 dagen')
    expect(freedomLabel(365)).toBe('1 jaar')
    expect(freedomLabel(400)).toBe('1 jaar en 1 maanden')
  })
})

describe('formatEUR', () => {
  it('formats whole euros nl-NL', () => {
    expect(formatEUR(1234)).toContain('1.234')
    expect(formatEUR(1234)).toContain('€')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: FAIL — cannot resolve `./gespreksstarters` / exports not defined.

- [ ] **Step 3: Write minimal implementation**

Create `lib/checkin/gespreksstarters.ts`:

```ts
/**
 * Pure engine voor de check-in "gespreksstarters" (reflectievragen).
 *
 * Spiegelt lib/aandachtspunten.ts: geen Supabase, geen I/O. De route
 * (app/api/checkin/gespreksstarters/route.ts) haalt data op, stelt
 * GespreksstartersInput samen en roept buildGespreksstarters() aan.
 */
import type { GesprekStarterData } from '@/lib/checkin-types'

// ── Voice (aanspreekvorm) ──────────────────────────────────────────────
// Nederlands vervoegt werkwoorden per onderwerp; Voice levert vooraf-
// vervoegde fragmenten zodat elke template één keer geschreven wordt.

export type Audience = 'solo' | 'household'

export interface Voice {
  audience: Audience
  subj: string      // 'je' | 'jullie'
  subjCap: string   // 'Je' | 'Jullie'
  poss: string      // 'je' | 'jullie'      → "{poss} vermogen"
  hebt: string      // 'hebt' | 'hebben'
  wilt: string      // 'wilt' | 'willen'
  bent: string      // 'bent' | 'zijn'
  voelt: string     // 'voel je je' | 'voelen jullie je'
  samen: string     // 'voor jezelf' | 'samen'
}

export function buildVoice(audience: Audience): Voice {
  if (audience === 'household') {
    return {
      audience,
      subj: 'jullie', subjCap: 'Jullie', poss: 'jullie',
      hebt: 'hebben', wilt: 'willen', bent: 'zijn',
      voelt: 'voelen jullie je', samen: 'samen',
    }
  }
  return {
    audience,
    subj: 'je', subjCap: 'Je', poss: 'je',
    hebt: 'hebt', wilt: 'wilt', bent: 'bent',
    voelt: 'voel je je', samen: 'voor jezelf',
  }
}

// ── Freedom-time helpers (verplaatst uit de route) ─────────────────────

export function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export function freedomDays(amount: number, dailyExpenses: number): number {
  if (dailyExpenses <= 0) return 0
  return Math.round(Math.abs(amount) / dailyExpenses)
}

export function freedomLabel(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365)
    const months = Math.round((days % 365) / 30)
    return months > 0 ? `${years} jaar en ${months} maanden` : `${years} jaar`
  }
  if (days >= 30) {
    const m = Math.floor(days / 30)
    const d = days % 30
    return d > 0 ? `${m} maanden en ${d} dagen` : `${m} maanden`
  }
  return `${days} ${days === 1 ? 'dag' : 'dagen'}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: PASS (all `buildVoice`/`freedomDays`/`freedomLabel`/`formatEUR` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/gespreksstarters.ts lib/checkin/gespreksstarters.test.ts
git commit -m "feat(checkin): engine-scaffold met Voice + freedom-helpers"
```

---

## Task 2: Selectie-kern — scoring, diversiteit-cap, variant-rotatie

**Files:**
- Modify: `lib/checkin/gespreksstarters.ts`
- Test: `lib/checkin/gespreksstarters.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/checkin/gespreksstarters.test.ts`:

```ts
import {
  selectStarters,
  type StarterCandidate,
} from './gespreksstarters'

// Een kandidaat-factory met 2 varianten zodat rotatie zichtbaar is.
function cand(
  id: string,
  theme: StarterCandidate['theme'],
  score: number,
  sentiment: StarterCandidate['sentiment'] = 'neutral',
): StarterCandidate {
  return {
    id, theme, sentiment, score,
    variants: [
      () => ({ vraag: `${id}-A`, actie: 'a', context: 'c' }),
      () => ({ vraag: `${id}-B`, actie: 'a', context: 'c' }),
    ],
  }
}

describe('selectStarters', () => {
  const v = buildVoice('household')

  it('sorts by score descending', () => {
    const out = selectStarters(
      [cand('low', 'sparen', 10), cand('high', 'vermogen', 90)],
      v, 0, [],
    )
    expect(out[0].id).toBe('high')
    expect(out[1].id).toBe('low')
  })

  it('caps at most 2 per theme', () => {
    const out = selectStarters(
      [
        cand('s1', 'sparen', 90), cand('s2', 'sparen', 80),
        cand('s3', 'sparen', 70), cand('v1', 'vermogen', 60),
      ],
      v, 0, [],
    )
    const sparen = out.filter(o => o.id.startsWith('s'))
    expect(sparen.length).toBe(2)
    expect(out.map(o => o.id)).toContain('v1')
  })

  it('returns at most 5', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      cand(`x${i}`, (['sparen', 'vermogen', 'uitgaven', 'doelen'] as const)[i % 4], 100 - i),
    )
    expect(selectStarters(many, v, 0, []).length).toBe(5)
  })

  it('fills to minimum 2 from fallback when too few candidates', () => {
    const out = selectStarters(
      [cand('only', 'sparen', 50)],
      v, 0,
      [cand('fb1', 'algemeen', 0), cand('fb2', 'algemeen', 0)],
    )
    expect(out.length).toBe(2)
    expect(out.map(o => o.id)).toContain('fb1')
  })

  it('does not duplicate a candidate already chosen via fallback', () => {
    const shared = cand('dup', 'algemeen', 50)
    const out = selectStarters([shared], v, 0, [shared, cand('fb2', 'algemeen', 0)])
    const dupCount = out.filter(o => o.id === 'dup').length
    expect(dupCount).toBe(1)
  })

  it('rotates variant by monthIndex deterministically', () => {
    const m0 = selectStarters([cand('r', 'sparen', 50)], v, 0, [])
    const m1 = selectStarters([cand('r', 'sparen', 50)], v, 1, [])
    const m2 = selectStarters([cand('r', 'sparen', 50)], v, 2, [])
    expect(m0[0].vraag).toBe('r-A')
    expect(m1[0].vraag).toBe('r-B')
    expect(m2[0].vraag).toBe('r-A') // wraps with 2 variants
    // same input + same monthIndex → identical output
    expect(selectStarters([cand('r', 'sparen', 50)], v, 0, [])[0].vraag).toBe('r-A')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: FAIL — `selectStarters` / `StarterCandidate` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/checkin/gespreksstarters.ts`:

```ts
// ── Kandidaat-model + selectie ─────────────────────────────────────────

export type StarterTheme =
  | 'vermogen' | 'sparen' | 'uitgaven' | 'doelen'
  | 'schulden' | 'acties' | 'fire' | 'algemeen'

export interface StarterVariant {
  vraag: string
  actie: string
  context: string
  vrijheidstijd?: string
}

export interface StarterCandidate {
  id: string
  theme: StarterTheme
  sentiment: 'positive' | 'neutral' | 'alert'
  /** Relevantie 0..100 (magnitude-gedreven). */
  score: number
  /** 2-4 formuleringen; de engine roteert per maand. */
  variants: Array<(v: Voice) => StarterVariant>
}

const MAX_STARTERS = 5
const MIN_STARTERS = 2
const MAX_PER_THEME = 2

function materialize(c: StarterCandidate, v: Voice, monthIndex: number): GesprekStarterData {
  const n = c.variants.length
  const idx = ((monthIndex % n) + n) % n // veilig voor negatieve monthIndex
  const variant = c.variants[idx](v)
  return {
    id: c.id,
    sentiment: c.sentiment,
    vraag: variant.vraag,
    context: variant.context,
    actie: variant.actie,
    vrijheidstijd: variant.vrijheidstijd,
  }
}

/**
 * Kies de te tonen starters: score-gesorteerd, max 2 per thema, min 2
 * (aangevuld uit fallback), max 5. Variant gekozen via maand-rotatie.
 */
export function selectStarters(
  candidates: StarterCandidate[],
  voice: Voice,
  monthIndex: number,
  fallback: StarterCandidate[],
): GesprekStarterData[] {
  const sorted = [...candidates].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  )

  const perTheme: Record<string, number> = {}
  const chosen: StarterCandidate[] = []
  for (const c of sorted) {
    if (chosen.length >= MAX_STARTERS) break
    const used = perTheme[c.theme] || 0
    if (used >= MAX_PER_THEME) continue
    perTheme[c.theme] = used + 1
    chosen.push(c)
  }

  for (const f of fallback) {
    if (chosen.length >= MIN_STARTERS) break
    if (chosen.some(c => c.id === f.id)) continue
    chosen.push(f)
  }

  return chosen.slice(0, MAX_STARTERS).map(c => materialize(c, voice, monthIndex))
}

// ── Util ───────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/gespreksstarters.ts lib/checkin/gespreksstarters.test.ts
git commit -m "feat(checkin): selectie-kern met scoring, diversiteit-cap en variant-rotatie"
```

---

## Task 3: Input-type + behouden detectoren (7 onderwerpen → kandidaat-model)

**Files:**
- Modify: `lib/checkin/gespreksstarters.ts`
- Test: `lib/checkin/gespreksstarters.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/checkin/gespreksstarters.test.ts`:

```ts
import {
  buildGespreksstarters,
  type GespreksstartersInput,
} from './gespreksstarters'

// Basis-input zonder enkele trigger; tests zetten per geval velden aan.
function baseInput(over: Partial<GespreksstartersInput> = {}): GespreksstartersInput {
  return {
    audience: 'household',
    monthIndex: 0,
    netWorth: 100000,
    netWorthTrend: 0,
    prevNetWorth: 100000,
    monthlyIncome: 4000,
    monthlyExpenses: 3000,
    prevMonthIncome: 4000,
    prevMonthExpenses: 3000,
    monthlySavings: 1000,
    prevMonthlySavings: 1000,
    savingsRate6m: 20,
    dailyExpenses: 100,
    goals: [],
    totalDebts: 0,
    debtCount: 0,
    completedActionsThisMonth: 0,
    completedActionsFreedomDays: 0,
    pendingActionsCount: 0,
    fireAge: null,
    prevFireAge: null,
    expensesByCategory: [],
    newRecurring: [],
    topAsset: null,
    ...over,
  }
}

function ids(out: { id: string }[]): string[] {
  return out.map(o => o.id)
}

describe('behouden detectoren', () => {
  it('vermogen-groei fires on positive trend', () => {
    const out = buildGespreksstarters(baseInput({ netWorthTrend: 3000, prevNetWorth: 97000 }))
    expect(ids(out)).toContain('vermogen-groei')
  })
  it('vermogen-daling fires on negative trend with alert sentiment', () => {
    const out = buildGespreksstarters(baseInput({ netWorthTrend: -3000, prevNetWorth: 103000 }))
    const hit = out.find(o => o.id === 'vermogen-daling')
    expect(hit).toBeDefined()
    expect(hit!.sentiment).toBe('alert')
  })
  it('negatief-sparen fires when savings <= 0', () => {
    const out = buildGespreksstarters(baseInput({
      monthlySavings: -200, monthlyIncome: 3000, monthlyExpenses: 3200, prevMonthlySavings: 100,
    }))
    expect(ids(out)).toContain('negatief-sparen')
  })
  it('schulden-vrijheid fires when debts exist', () => {
    const out = buildGespreksstarters(baseInput({ totalDebts: 20000, debtCount: 2 }))
    expect(ids(out)).toContain('schulden-vrijheid')
  })
  it('sparen-vrijheid fires when monthly savings > 100', () => {
    const out = buildGespreksstarters(baseInput({ monthlySavings: 1200 }))
    expect(ids(out)).toContain('sparen-vrijheid')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: FAIL — `buildGespreksstarters` / `GespreksstartersInput` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/checkin/gespreksstarters.ts`:

```ts
// ── Input ──────────────────────────────────────────────────────────────

export interface GespreksstartersInput {
  audience: Audience
  /** Absolute maandteller (year*12 + month) → rotatie schuift elke maand. */
  monthIndex: number

  netWorth: number
  netWorthTrend: number          // laatste − vorige snapshot
  prevNetWorth: number
  monthlyIncome: number
  monthlyExpenses: number
  prevMonthIncome: number
  prevMonthExpenses: number
  monthlySavings: number
  prevMonthlySavings: number
  savingsRate6m: number
  dailyExpenses: number

  goals: Array<{
    name: string; current: number; target: number;
    completed: boolean; targetDate: string | null
  }>
  totalDebts: number
  debtCount: number
  completedActionsThisMonth: number
  completedActionsFreedomDays: number
  pendingActionsCount: number

  fireAge: number | null
  prevFireAge: number | null
  expensesByCategory: Array<{ name: string; amount: number; prevAmount: number; limit: number | null }>
  newRecurring: Array<{ name: string; monthlyAmount: number }>
  topAsset: { name: string; value: number } | null
}

type Detector = (input: GespreksstartersInput) => StarterCandidate[]

// ── Behouden detectoren ────────────────────────────────────────────────

const detectVermogen: Detector = (i) => {
  if (i.dailyExpenses <= 0 || i.netWorthTrend === 0) return []
  const days = freedomDays(i.netWorthTrend, i.dailyExpenses)
  if (i.netWorthTrend > 0) {
    const eur = formatEUR(i.netWorthTrend)
    return [{
      id: 'vermogen-groei', theme: 'vermogen', sentiment: 'positive',
      score: clamp(days * 1.5, 5, 100),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} vermogen is gegroeid met ${eur} — dat zijn ${days} extra vrijheidsdagen. Waar willen ${v.subj} die vrijheid aan besteden?`,
          context: `Netto vermogen steeg van ${formatEUR(i.prevNetWorth)} naar ${formatEUR(i.netWorth)}.`,
          actie: `Bespreek ${v.samen} wat de volgende financiële mijlpaal zou kunnen zijn.`,
          vrijheidstijd: freedomLabel(days),
        }),
        (v) => ({
          vraag: `${eur} erbij deze maand — ${freedomLabel(days)} dichter bij volledige vrijheid. Wat ${v.hebt} ${v.subj} goed gedaan?`,
          context: `Vermogensgroei van ${eur} sinds de vorige check-in.`,
          actie: `Benoem ${v.samen} de keuze die het meeste bijdroeg.`,
          vrijheidstijd: freedomLabel(days),
        }),
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} vermogen groeide met ${eur}. Verandert dat hoe ${v.subj} naar ${v.poss} doelen ${v.wilt} kijken?`,
          context: `Van ${formatEUR(i.prevNetWorth)} naar ${formatEUR(i.netWorth)}.`,
          actie: `Toets ${v.samen} of een doel sneller haalbaar is geworden.`,
          vrijheidstijd: freedomLabel(days),
        }),
      ],
    }]
  }
  const eur = formatEUR(Math.abs(i.netWorthTrend))
  return [{
    id: 'vermogen-daling', theme: 'vermogen', sentiment: 'alert',
    score: clamp(days * 1.5 + 10, 15, 100),
    variants: [
      (v) => ({
        vraag: `${v.subjCap} ${v.poss} vermogen is deze maand ${eur} gedaald. Hoe ${v.voelt} daarover, en is er een oorzaak die ${v.subj} ${v.samen} ${v.wilt} aanpakken?`,
        context: `Netto vermogen daalde met ${eur} (${days} vrijheidsdagen).`,
        actie: `Kijk ${v.samen} of het eenmalig was of structureel.`,
        vrijheidstijd: freedomLabel(days),
      }),
      (v) => ({
        vraag: `${eur} eraf deze maand. Was dat een bewuste investering of een tegenvaller?`,
        context: `Vermogensdaling van ${eur} sinds de vorige check-in.`,
        actie: `Bepaal ${v.samen} of er actie nodig is.`,
        vrijheidstijd: freedomLabel(days),
      }),
    ],
  }]
}

const detectSparenVergelijking: Detector = (i) => {
  if (i.monthlySavings > 0 && i.prevMonthlySavings > 0) {
    const delta = i.monthlySavings - i.prevMonthlySavings
    if (delta > 50) {
      const extraDays = freedomDays(delta * 12, i.dailyExpenses)
      const eur = formatEUR(delta)
      return [{
        id: 'sparen-stijging', theme: 'sparen', sentiment: 'positive',
        score: clamp(delta / 8, 10, 90),
        variants: [
          (v) => ({
            vraag: `${v.subjCap} ${v.hebt} deze maand ${eur} meer gespaard dan vorige maand. Op jaarbasis is dat ${freedomLabel(extraDays)} extra vrijheid. Welke keuze maakte het verschil?`,
            context: `Spaarquote: ${i.savingsRate6m.toFixed(0)}% (6-maands).`,
            actie: `Bespreek welke uitgaven ${v.subj} bewust ${v.hebt} verminderd.`,
            vrijheidstijd: freedomLabel(extraDays),
          }),
          (v) => ({
            vraag: `${eur} meer opzij dan vorige maand — ${freedomLabel(extraDays)} extra vrijheid per jaar. Houdbaar?`,
            context: `Maandbesparing steeg met ${eur}.`,
            actie: `Toets ${v.samen} of dit tempo vol te houden is.`,
            vrijheidstijd: freedomLabel(extraDays),
          }),
        ],
      }]
    }
    if (delta < -50) {
      const eur = formatEUR(i.monthlySavings)
      const prev = formatEUR(i.prevMonthlySavings)
      return [{
        id: 'sparen-daling', theme: 'sparen', sentiment: 'neutral',
        score: clamp(Math.abs(delta) / 12, 8, 70),
        variants: [
          (v) => ({
            vraag: `De maandelijkse besparing daalde van ${prev} naar ${eur}. Was dat een bewuste keuze, of onverwachte kosten?`,
            context: `Verschil: ${formatEUR(delta)} minder gespaard.`,
            actie: `Kijk ${v.samen} of ${v.subj} volgende maand terug ${v.wilt} naar het oude niveau.`,
          }),
          (v) => ({
            vraag: `${prev} → ${eur} gespaard. Wat veranderde er deze maand?`,
            context: `Maandbesparing daalde met ${formatEUR(Math.abs(delta))}.`,
            actie: `Benoem ${v.samen} de grootste verschuiving.`,
          }),
        ],
      }]
    }
    return []
  }
  if (i.monthlySavings <= 0 && i.monthlyIncome > 0) {
    return [{
      id: 'negatief-sparen', theme: 'sparen', sentiment: 'alert',
      score: 78,
      variants: [
        (v) => ({
          vraag: `Deze maand ${v.hebt} ${v.subj} meer uitgegeven dan er binnenkwam. Dat kan bewust zijn — maar is het hoe ${v.subj} het ${v.wilt}? Welk klein bedrag zou volgende maand wél opzij kunnen?`,
          context: `Uitgaven (${formatEUR(i.monthlyExpenses)}) overschreden inkomen (${formatEUR(i.monthlyIncome)}).`,
          actie: `Spreek ${v.samen} een realistisch minimaal spaarbedrag af.`,
        }),
        (v) => ({
          vraag: `Rood deze maand: ${formatEUR(i.monthlyExpenses - i.monthlyIncome)} meer uit dan in. Eenmalig of een patroon?`,
          context: `Inkomen ${formatEUR(i.monthlyIncome)} vs uitgaven ${formatEUR(i.monthlyExpenses)}.`,
          actie: `Bepaal ${v.samen} één concrete bijsturing.`,
        }),
      ],
    }]
  }
  return []
}

const detectUitgaven: Detector = (i) => {
  if (i.prevMonthExpenses <= 0 || i.monthlyExpenses <= 0) return []
  const change = ((i.monthlyExpenses - i.prevMonthExpenses) / i.prevMonthExpenses) * 100
  if (change > 15) {
    const extra = i.monthlyExpenses - i.prevMonthExpenses
    const days = freedomDays(extra * 12, i.dailyExpenses)
    return [{
      id: 'uitgaven-stijging', theme: 'uitgaven', sentiment: 'neutral',
      score: clamp(change, 15, 85),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} uitgaven zijn ${change.toFixed(0)}% hoger dan vorige maand. Dat verschil (${formatEUR(extra)}) is op jaarbasis ${freedomLabel(days)}. Welke uitgaven voelden waardevol?`,
          context: `Van ${formatEUR(i.prevMonthExpenses)} naar ${formatEUR(i.monthlyExpenses)}.`,
          actie: `Loop ${v.samen} de grootste categorieën door.`,
        }),
        (v) => ({
          vraag: `${formatEUR(extra)} meer uitgegeven dan vorige maand (+${change.toFixed(0)}%). Bewust of geslopen?`,
          context: `Maanduitgaven stegen naar ${formatEUR(i.monthlyExpenses)}.`,
          actie: `Markeer ${v.samen} wat de moeite waard was.`,
        }),
      ],
    }]
  }
  if (change < -10) {
    const saved = i.prevMonthExpenses - i.monthlyExpenses
    const days = freedomDays(saved, i.dailyExpenses)
    return [{
      id: 'uitgaven-daling', theme: 'uitgaven', sentiment: 'positive',
      score: clamp(days * 2, 10, 85),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.hebt} ${formatEUR(saved)} minder uitgegeven dan vorige maand — ${days} vrijheidsdagen gewonnen! Wat ${v.hebt} ${v.subj} anders gedaan?`,
          context: `Uitgaven daalden ${Math.abs(change).toFixed(0)}%.`,
          actie: `Bespreek of ${v.subj} dit patroon ${v.wilt} vasthouden.`,
          vrijheidstijd: `${days} dagen`,
        }),
        (v) => ({
          vraag: `${formatEUR(saved)} minder uitgegeven — ${freedomLabel(days)} vrijheid erbij. Welke gewoonte hielp?`,
          context: `Uitgaven daalden ${Math.abs(change).toFixed(0)}% t.o.v. vorige maand.`,
          actie: `Leg ${v.samen} vast wat ${v.subj} wilt herhalen.`,
          vrijheidstijd: `${days} dagen`,
        }),
      ],
    }]
  }
  return []
}

const detectDoelen: Detector = (i) => {
  const active = i.goals.filter(g => !g.completed && g.target > 0)
  if (active.length === 0) return []
  const closest = active
    .map(g => ({ ...g, pct: (g.current / g.target) * 100 }))
    .sort((a, b) => b.pct - a.pct)[0]
  if (closest.pct >= 50 && closest.pct < 100) {
    const remaining = closest.target - closest.current
    const days = i.dailyExpenses > 0 ? freedomDays(remaining, i.dailyExpenses) : 0
    return [{
      id: 'doel-bijna', theme: 'doelen', sentiment: 'positive',
      score: clamp(closest.pct, 50, 95),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.bent} al ${closest.pct.toFixed(0)}% op weg naar "${closest.name}". Nog ${formatEUR(remaining)} te gaan! Hoe ${v.wilt} ${v.subj} dit ${v.samen} vieren als het lukt?`,
          context: `Doel "${closest.name}": ${formatEUR(closest.current)} van ${formatEUR(closest.target)}.`,
          actie: `Spreek een kleine beloning af bij het bereiken.`,
          vrijheidstijd: days > 0 ? freedomLabel(days) : undefined,
        }),
        (v) => ({
          vraag: `"${closest.name}" staat op ${closest.pct.toFixed(0)}%. Wat is de laatste zet om het af te maken?`,
          context: `Nog ${formatEUR(remaining)} tot het doel.`,
          actie: `Plan ${v.samen} de resterende stortingen.`,
          vrijheidstijd: days > 0 ? freedomLabel(days) : undefined,
        }),
      ],
    }]
  }
  if (closest.pct < 20) {
    return [{
      id: 'doel-start', theme: 'doelen', sentiment: 'neutral',
      score: 30,
      variants: [
        (v) => ({
          vraag: `${v.poss === 'je' ? 'Je' : 'Jullie'} doel "${closest.name}" staat op ${closest.pct.toFixed(0)}%. Welk concreet bedrag kunnen ${v.subj} per maand opzij leggen om sneller op koers te komen?`,
          context: `Doel "${closest.name}" is net gestart.`,
          actie: `Stel ${v.samen} een automatische maandstorting in.`,
        }),
        (v) => ({
          vraag: `"${closest.name}" is net begonnen. Wat maakt dit doel belangrijk genoeg om vol te houden?`,
          context: `Voortgang: ${closest.pct.toFixed(0)}%.`,
          actie: `Benoem ${v.samen} het "waarom" achter dit doel.`,
        }),
      ],
    }]
  }
  return []
}

const detectSchulden: Detector = (i) => {
  if (i.debtCount <= 0 || i.totalDebts <= 0 || i.dailyExpenses <= 0) return []
  const days = freedomDays(i.totalDebts, i.dailyExpenses)
  return [{
    id: 'schulden-vrijheid', theme: 'schulden', sentiment: 'neutral',
    score: clamp(days / 3, 10, 60),
    variants: [
      (v) => ({
        vraag: `${v.subjCap} ${v.poss} totale schuld is ${formatEUR(i.totalDebts)} — dat is ${freedomLabel(days)} aan vrijheid die ${v.subj} nog terugkopen. Welke schuld ${v.wilt} ${v.subj} het eerste aanpakken?`,
        context: `${i.debtCount} ${i.debtCount === 1 ? 'schuld' : 'schulden'}, totaal ${formatEUR(i.totalDebts)}.`,
        actie: `Bespreek ${v.samen} een extra aflossing op de duurste schuld.`,
        vrijheidstijd: freedomLabel(days),
      }),
      (v) => ({
        vraag: `${formatEUR(i.totalDebts)} schuld = ${freedomLabel(days)} teruggekochte vrijheid. Welke aflossing geeft de meeste rust?`,
        context: `Totale schuldenlast over ${i.debtCount} ${i.debtCount === 1 ? 'schuld' : 'schulden'}.`,
        actie: `Kies ${v.samen} de eerstvolgende schuld om op te focussen.`,
        vrijheidstijd: freedomLabel(days),
      }),
    ],
  }]
}

const detectActies: Detector = (i) => {
  if (i.completedActionsThisMonth > 0) {
    const fd = i.completedActionsFreedomDays
    const n = i.completedActionsThisMonth
    return [{
      id: 'acties-momentum', theme: 'acties', sentiment: 'positive',
      score: clamp(fd * 2 + n * 5, 15, 85),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.hebt} deze maand ${n} ${n === 1 ? 'actie' : 'acties'} afgerond${fd > 0 ? ` en ${fd} vrijheidsdagen verdiend` : ''}. Welke had de meeste impact?`,
          context: `${n} afgeronde ${n === 1 ? 'actie' : 'acties'} deze maand.`,
          actie: `Kies ${v.samen} de volgende actie.`,
          vrijheidstijd: fd > 0 ? `${fd} dagen` : undefined,
        }),
        (v) => ({
          vraag: `${n} ${n === 1 ? 'actie' : 'acties'} afgevinkt deze maand. Wat gaf het beste gevoel?`,
          context: `Afgeronde acties: ${n}.`,
          actie: `Plan ${v.samen} de volgende stap.`,
          vrijheidstijd: fd > 0 ? `${fd} dagen` : undefined,
        }),
      ],
    }]
  }
  if (i.pendingActionsCount > 0) {
    const n = i.pendingActionsCount
    return [{
      id: 'acties-openstaand', theme: 'acties', sentiment: 'neutral',
      score: 25,
      variants: [
        (v) => ({
          vraag: `Er staan ${n} openstaande ${n === 1 ? 'actie' : 'acties'} klaar. Welke ${v.wilt} ${v.subj} deze maand ${v.samen} oppakken?`,
          context: `${n} aanbevolen acties wachten.`,
          actie: `Kies ${v.samen} 1 actie en plan een moment.`,
        }),
        (v) => ({
          vraag: `${n} acties op de plank. Welke geeft de grootste sprong richting vrijheid?`,
          context: `${n} openstaande aanbevelingen.`,
          actie: `Prioriteer ${v.samen} de eerstvolgende.`,
        }),
      ],
    }]
  }
  return []
}

const detectSparenVrijheid: Detector = (i) => {
  if (i.monthlySavings <= 100 || i.dailyExpenses <= 0) return []
  const days = freedomDays(i.monthlySavings, i.dailyExpenses)
  return [{
    id: 'sparen-vrijheid', theme: 'sparen', sentiment: 'positive',
    score: clamp(days * 1.5, 8, 70),
    variants: [
      (v) => ({
        vraag: `${v.subjCap} ${v.hebt} deze maand ${formatEUR(i.monthlySavings)} gespaard — dat zijn ${days} nieuwe vrijheidsdagen. Hoe ${v.voelt} daarover?`,
        context: `Spaarquote: ${i.savingsRate6m.toFixed(0)}% van het inkomen.`,
        actie: `Bespreek of ${v.subj} tevreden ${v.bent} of ${v.wilt} versnellen.`,
        vrijheidstijd: `${days} dagen`,
      }),
      (v) => ({
        vraag: `${formatEUR(i.monthlySavings)} opzij = ${days} vrijheidsdagen erbij. Tevreden met dit tempo?`,
        context: `6-maands spaarquote: ${i.savingsRate6m.toFixed(0)}%.`,
        actie: `Bepaal ${v.samen} of het tempo omhoog kan.`,
        vrijheidstijd: `${days} dagen`,
      }),
    ],
  }]
}

// ── Fallback (geroteerd) ───────────────────────────────────────────────
function buildFallback(_i: GespreksstartersInput): StarterCandidate[] {
  return [
    {
      id: 'algemeen-dromen', theme: 'algemeen', sentiment: 'positive', score: 0,
      variants: [
        (v) => ({
          vraag: `Als ${v.subj} volledig financieel vrij ${v.bent}, hoe ziet een ideale dinsdag eruit?`,
          context: 'Reflectiemoment over levensdoelen.',
          actie: `Schrijf ${v.audience === 'household' ? 'allebei onafhankelijk' : ''} 3 dingen op die ${v.subj} dan zou doen.`,
        }),
        (v) => ({
          vraag: `Stel: geld is geen zorg meer. Wat verandert er morgen in ${v.poss} dag?`,
          context: 'Visie op vrijheid.',
          actie: `Noteer ${v.samen} één ding dat ${v.subj} nú al kan proeven.`,
        }),
      ],
    },
    {
      id: 'algemeen-waarden', theme: 'algemeen', sentiment: 'neutral', score: 0,
      variants: [
        (v) => ({
          vraag: `Welke uitgave van afgelopen maand bracht ${v.subj} het meeste voldoening? En welke het minste?`,
          context: 'Reflectie over bewust besteden.',
          actie: `Identificeer ${v.samen} een terugkerende uitgave die niet bijdraagt.`,
        }),
        (v) => ({
          vraag: `Welke euro van vorige maand zou ${v.subj} zo weer uitgeven — en welke niet?`,
          context: 'Waarden achter bestedingen.',
          actie: `Kies ${v.samen} één uitgave om te schrappen of te vieren.`,
        }),
      ],
    },
  ]
}

// ── Hoofdentry ─────────────────────────────────────────────────────────
const DETECTORS: Detector[] = [
  detectVermogen,
  detectSparenVergelijking,
  detectUitgaven,
  detectDoelen,
  detectSchulden,
  detectActies,
  detectSparenVrijheid,
]

export function buildGespreksstarters(input: GespreksstartersInput): GesprekStarterData[] {
  const voice = buildVoice(input.audience)
  const candidates = DETECTORS.flatMap(d => d(input))
  return selectStarters(candidates, voice, input.monthIndex, buildFallback(input))
}

/** Alle onderwerp-id's die de engine kan produceren (voor tests/registry). */
export const STARTER_IDS = [
  'vermogen-groei', 'vermogen-daling',
  'sparen-stijging', 'sparen-daling', 'negatief-sparen',
  'uitgaven-stijging', 'uitgaven-daling',
  'doel-bijna', 'doel-start',
  'schulden-vrijheid',
  'acties-momentum', 'acties-openstaand',
  'sparen-vrijheid',
  'algemeen-dromen', 'algemeen-waarden',
] as const
```

> **Let op:** `STARTER_IDS` wordt in Task 4/5 uitgebreid met de nieuwe id's. Voeg nieuwe id's toe wanneer je de detector toevoegt.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: PASS (behouden detectoren + eerdere tests).

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/gespreksstarters.ts lib/checkin/gespreksstarters.test.ts
git commit -m "feat(checkin): input-type + 7 behouden detectoren in kandidaat-model"
```

---

## Task 4: Nieuwe detectoren A — FIRE-verschuiving, spaarquote-trend, budgetcategorie, nieuwe vaste last

**Files:**
- Modify: `lib/checkin/gespreksstarters.ts`
- Test: `lib/checkin/gespreksstarters.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/checkin/gespreksstarters.test.ts`:

```ts
describe('nieuwe detectoren A', () => {
  it('fire-versnelling fires when fireAge dropped >= 1 year', () => {
    const out = buildGespreksstarters(baseInput({ fireAge: 52, prevFireAge: 54 }))
    expect(ids(out)).toContain('fire-versnelling')
  })
  it('fire-vertraging fires when fireAge rose >= 1 year (alert)', () => {
    const out = buildGespreksstarters(baseInput({ fireAge: 56, prevFireAge: 54 }))
    const hit = out.find(o => o.id === 'fire-vertraging')
    expect(hit).toBeDefined()
    expect(hit!.sentiment).toBe('alert')
  })
  it('spaarquote-sterk fires when 6m rate >= 25%', () => {
    const out = buildGespreksstarters(baseInput({ savingsRate6m: 32 }))
    expect(ids(out)).toContain('spaarquote-sterk')
  })
  it('spaarquote-laag fires when 6m rate between 0 and 10', () => {
    const out = buildGespreksstarters(baseInput({ savingsRate6m: 6 }))
    expect(ids(out)).toContain('spaarquote-laag')
  })
  it('budgetcategorie-uitschieter fires on largest over-limit category', () => {
    const out = buildGespreksstarters(baseInput({
      expensesByCategory: [
        { name: 'Boodschappen', amount: 650, prevAmount: 500, limit: 500 },
        { name: 'Kleding', amount: 120, prevAmount: 100, limit: 200 },
      ],
    }))
    expect(ids(out)).toContain('budgetcategorie-uitschieter')
  })
  it('nieuwe-vaste-last fires when a new recurring expense exists', () => {
    const out = buildGespreksstarters(baseInput({
      newRecurring: [{ name: 'Spotify', monthlyAmount: 12 }],
    }))
    expect(ids(out)).toContain('nieuwe-vaste-last')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: FAIL — new ids not produced.

- [ ] **Step 3: Write minimal implementation**

In `lib/checkin/gespreksstarters.ts`, add these detectors **above** the `DETECTORS` array:

```ts
// ── Nieuwe detectoren A ────────────────────────────────────────────────

const detectFire: Detector = (i) => {
  if (i.fireAge == null || i.prevFireAge == null) return []
  const delta = i.fireAge - i.prevFireAge // negatief = eerder vrij
  if (delta <= -1) {
    const yrs = Math.abs(delta)
    return [{
      id: 'fire-versnelling', theme: 'fire', sentiment: 'positive',
      score: clamp(yrs * 20, 20, 90),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.bent} ${yrs} jaar dichter bij volledige vrijheid dan vorige maand (FIRE rond ${i.fireAge}). Wat zette dat in beweging?`,
          context: `Geschatte FIRE-leeftijd: ${i.prevFireAge} → ${i.fireAge}.`,
          actie: `Benoem ${v.samen} de keuze die het meeste hielp.`,
        }),
        (v) => ({
          vraag: `FIRE schoof ${yrs} jaar naar voren. Hoe ${v.voelt} bij dat tempo?`,
          context: `FIRE-leeftijd daalde naar ${i.fireAge}.`,
          actie: `Bespreek of ${v.subj} dit tempo ${v.wilt} vasthouden.`,
        }),
      ],
    }]
  }
  if (delta >= 1) {
    const yrs = delta
    return [{
      id: 'fire-vertraging', theme: 'fire', sentiment: 'alert',
      score: clamp(yrs * 20 + 5, 25, 90),
      variants: [
        (v) => ({
          vraag: `${v.poss === 'je' ? 'Je' : 'Jullie'} geschatte FIRE-leeftijd schoof ${yrs} jaar op (naar ${i.fireAge}). Is er iets veranderd dat ${v.subj} ${v.samen} ${v.wilt} bespreken?`,
          context: `FIRE-leeftijd: ${i.prevFireAge} → ${i.fireAge}.`,
          actie: `Kijk ${v.samen} of het door uitgaven of een eenmalige post komt.`,
        }),
        (v) => ({
          vraag: `Volledige vrijheid kwam ${yrs} jaar verder weg te liggen. Eenmalig of structureel?`,
          context: `FIRE-leeftijd steeg naar ${i.fireAge}.`,
          actie: `Bepaal ${v.samen} of bijsturen nodig is.`,
        }),
      ],
    }]
  }
  return []
}

const detectSpaarquoteTrend: Detector = (i) => {
  if (i.monthlyIncome <= 0) return []
  if (i.savingsRate6m >= 25) {
    return [{
      id: 'spaarquote-sterk', theme: 'sparen', sentiment: 'positive',
      score: clamp(i.savingsRate6m, 25, 80),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} spaarquote staat op ${i.savingsRate6m.toFixed(0)}% over 6 maanden — flink boven gemiddeld. Wat maakt dat mogelijk?`,
          context: `6-maands spaarquote: ${i.savingsRate6m.toFixed(0)}%.`,
          actie: `Bespreek ${v.samen} of dit comfortabel voelt of te streng.`,
        }),
        (v) => ({
          vraag: `${i.savingsRate6m.toFixed(0)}% spaarquote — sterk. Voelt de balans tussen nu en later goed?`,
          context: `Gemiddeld over 6 maanden.`,
          actie: `Toets ${v.samen} of ${v.subj} ook genoeg ${v.subj === 'je' ? 'geniet' : 'genieten'}.`,
        }),
      ],
    }]
  }
  if (i.savingsRate6m > 0 && i.savingsRate6m < 10) {
    return [{
      id: 'spaarquote-laag', theme: 'sparen', sentiment: 'neutral',
      score: clamp(15 - i.savingsRate6m, 8, 55),
      variants: [
        (v) => ({
          vraag: `${v.subjCap} ${v.poss} spaarquote ligt op ${i.savingsRate6m.toFixed(0)}% over 6 maanden. Welke kleine stap zou die kunnen verhogen?`,
          context: `6-maands spaarquote: ${i.savingsRate6m.toFixed(0)}%.`,
          actie: `Kies ${v.samen} één uitgave om bij te sturen.`,
        }),
        (v) => ({
          vraag: `Met ${i.savingsRate6m.toFixed(0)}% spaarquote bouwt vrijheid langzaam op. Bewuste keuze of ruimte voor meer?`,
          context: `Gemiddeld over 6 maanden.`,
          actie: `Bepaal ${v.samen} een haalbaar streefpercentage.`,
        }),
      ],
    }]
  }
  return []
}

const detectBudgetcategorie: Detector = (i) => {
  const over = i.expensesByCategory
    .filter(c => c.limit != null && c.limit > 0 && c.amount > c.limit)
    .map(c => ({ ...c, over: c.amount - (c.limit as number) }))
    .sort((a, b) => b.over - a.over)[0]
  if (!over) return []
  const pctOver = Math.round((over.over / (over.limit as number)) * 100)
  const days = freedomDays(over.over, i.dailyExpenses)
  return [{
    id: 'budgetcategorie-uitschieter', theme: 'uitgaven', sentiment: 'neutral',
    score: clamp(pctOver, 10, 80),
    variants: [
      (v) => ({
        vraag: `"${over.name}" ging het meest over budget deze maand (${formatEUR(over.amount)} van ${formatEUR(over.limit as number)}). Wat zat daarachter?`,
        context: `${pctOver}% over budget in ${over.name}.`,
        actie: `Bespreek ${v.samen} of het budget of het gedrag moet bijstellen.`,
        vrijheidstijd: days > 0 ? `${days} dagen` : undefined,
      }),
      (v) => ({
        vraag: `${over.name} schoot er ${formatEUR(over.over)} overheen. Eenmalig, of structureel te krap begroot?`,
        context: `${formatEUR(over.amount)} t.o.v. ${formatEUR(over.limit as number)} budget.`,
        actie: `Beslis ${v.samen}: budget verhogen of uitgave verlagen.`,
        vrijheidstijd: days > 0 ? `${days} dagen` : undefined,
      }),
    ],
  }]
}

const detectNieuweVasteLast: Detector = (i) => {
  if (i.newRecurring.length === 0) return []
  const top = [...i.newRecurring].sort((a, b) => b.monthlyAmount - a.monthlyAmount)[0]
  const annual = top.monthlyAmount * 12
  const days = freedomDays(annual, i.dailyExpenses)
  return [{
    id: 'nieuwe-vaste-last', theme: 'uitgaven', sentiment: 'neutral',
    score: clamp(days, 8, 60),
    variants: [
      (v) => ({
        vraag: `Er is een nieuwe vaste last: ${top.name} (${formatEUR(top.monthlyAmount)}/maand = ${freedomLabel(days)} per jaar). Is die bewust en de moeite waard?`,
        context: `Nieuw terugkerend: ${top.name}.`,
        actie: `Bevestig ${v.samen} of ${v.subj} ${top.name} ${v.wilt} houden.`,
        vrijheidstijd: freedomLabel(days),
      }),
      (v) => ({
        vraag: `${top.name} is een nieuwe maandelijkse uitgave (${formatEUR(top.monthlyAmount)}). Op jaarbasis ${freedomLabel(days)} vrijheid — past dat?`,
        context: `Nieuwe vaste last gedetecteerd.`,
        actie: `Toets ${v.samen} of dit abonnement blijft.`,
        vrijheidstijd: freedomLabel(days),
      }),
    ],
  }]
}
```

Then extend the `DETECTORS` array:

```ts
const DETECTORS: Detector[] = [
  detectVermogen,
  detectSparenVergelijking,
  detectUitgaven,
  detectDoelen,
  detectSchulden,
  detectActies,
  detectSparenVrijheid,
  detectFire,
  detectSpaarquoteTrend,
  detectBudgetcategorie,
  detectNieuweVasteLast,
]
```

And extend `STARTER_IDS` (add before the closing `] as const`):

```ts
  'fire-versnelling', 'fire-vertraging',
  'spaarquote-sterk', 'spaarquote-laag',
  'budgetcategorie-uitschieter',
  'nieuwe-vaste-last',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/gespreksstarters.ts lib/checkin/gespreksstarters.test.ts
git commit -m "feat(checkin): detectoren FIRE-verschuiving, spaarquote-trend, budgetcategorie, nieuwe vaste last"
```

---

## Task 5: Nieuwe detectoren B — doel-deadline, vermogensconcentratie, mijlpaal-nadering

**Files:**
- Modify: `lib/checkin/gespreksstarters.ts`
- Test: `lib/checkin/gespreksstarters.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/checkin/gespreksstarters.test.ts`:

```ts
describe('nieuwe detectoren B', () => {
  // monthIndex high so these score-rank without theme collisions
  it('doel-deadline fires for goal <60d away and <75%', () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 20)
    const out = buildGespreksstarters(baseInput({
      goals: [{ name: 'Vakantie', current: 500, target: 2000, completed: false, targetDate: soon.toISOString().slice(0, 10) }],
    }))
    expect(ids(out)).toContain('doel-deadline')
  })
  it('vermogensconcentratie fires when top asset > 60% of net worth', () => {
    const out = buildGespreksstarters(baseInput({
      netWorth: 100000, topAsset: { name: 'Eigen huis', value: 75000 },
    }))
    expect(ids(out)).toContain('vermogensconcentratie')
  })
  it('mijlpaal-nadering fires when net worth within 5% under next milestone', () => {
    const out = buildGespreksstarters(baseInput({ netWorth: 96000 })) // next 100k, 4% remaining
    expect(ids(out)).toContain('mijlpaal-nadering')
  })
  it('mijlpaal-nadering does NOT fire far from a milestone', () => {
    const out = buildGespreksstarters(baseInput({ netWorth: 62000 }))
    expect(ids(out)).not.toContain('mijlpaal-nadering')
  })
})
```

> **Ontwerpnotitie:** `detectDoelDeadline` en `detectMijlpaal` zijn de enige
> twee detectoren die "vandaag" nodig hebben; zij lezen `new Date()` intern. Dit
> is bewust (server-runtime, geen workflow-script). De tests gebruiken daarom
> *relatieve* datums (vandaag + N dagen) met ruime marge, zodat ze robuust zijn
> en geen vaste datum-literal nodig hebben. De determinisme-tests in Task 6
> richten zich op een tijd-onafhankelijk onderwerp (`vermogen-groei`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: FAIL — new ids not produced.

- [ ] **Step 3: Write minimal implementation**

Add these detectors **above** the `DETECTORS` array in `lib/checkin/gespreksstarters.ts`:

```ts
// ── Nieuwe detectoren B ────────────────────────────────────────────────

const detectDoelDeadline: Detector = (i) => {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const candidates = i.goals
    .filter(g => !g.completed && g.targetDate && g.targetDate >= todayStr && g.target > 0)
    .map(g => {
      const daysUntil = Math.ceil(
        (new Date(g.targetDate as string).getTime() - today.getTime()) / 86400000,
      )
      const pct = (g.current / g.target) * 100
      return { ...g, daysUntil, pct }
    })
    .filter(g => g.daysUntil <= 60 && g.pct < 75)
    .sort((a, b) => a.daysUntil - b.daysUntil)
  const g = candidates[0]
  if (!g) return []
  const remaining = g.target - g.current
  return [{
    id: 'doel-deadline', theme: 'doelen',
    sentiment: g.daysUntil <= 14 ? 'alert' : 'neutral',
    score: clamp(60 - g.daysUntil + (75 - g.pct), 15, 88),
    variants: [
      (v) => ({
        vraag: `Doel "${g.name}" heeft nog ${g.daysUntil} dagen te gaan en staat op ${g.pct.toFixed(0)}%. Is de deadline nog haalbaar, of ${v.wil} ${v.subj} 'm bijstellen?`,
        context: `Nog ${formatEUR(remaining)} tot "${g.name}", deadline over ${g.daysUntil} dagen.`,
        actie: `Beslis ${v.samen}: tempo verhogen of deadline verschuiven.`,
      }),
      (v) => ({
        vraag: `"${g.name}" loopt af over ${g.daysUntil} dagen (nu ${g.pct.toFixed(0)}%). Wat is realistisch?`,
        context: `Resterend: ${formatEUR(remaining)}.`,
        actie: `Maak ${v.samen} een realistisch eindplan voor dit doel.`,
      }),
    ],
  }]
}

const detectVermogensconcentratie: Detector = (i) => {
  if (!i.topAsset || i.netWorth <= 0) return []
  const pct = (i.topAsset.value / i.netWorth) * 100
  if (pct < 60) return []
  return [{
    id: 'vermogensconcentratie', theme: 'vermogen', sentiment: 'neutral',
    score: clamp(pct - 50, 10, 70),
    variants: [
      (v) => ({
        vraag: `"${i.topAsset!.name}" is ${pct.toFixed(0)}% van ${v.poss} vermogen. Voelt die concentratie comfortabel, of ${v.wil} ${v.subj} meer spreiding?`,
        context: `${formatEUR(i.topAsset!.value)} van ${formatEUR(i.netWorth)} netto vermogen.`,
        actie: `Bespreek ${v.samen} of spreiding gewenst is.`,
      }),
      (v) => ({
        vraag: `Het grootste deel van ${v.poss} vermogen (${pct.toFixed(0)}%) zit in "${i.topAsset!.name}". Wat als die waarde sterk schommelt?`,
        context: `Concentratie: ${pct.toFixed(0)}% in één post.`,
        actie: `Weeg ${v.samen} het risico van die concentratie.`,
      }),
    ],
  }]
}

const MILESTONE_STEPS = [10000, 25000, 50000, 100000, 250000, 500000, 1000000]

const detectMijlpaal: Detector = (i) => {
  if (i.netWorth <= 0) return []
  const next = MILESTONE_STEPS.find(m => m > i.netWorth)
  if (!next) return []
  const remaining = next - i.netWorth
  // Alleen "dichtbij": binnen 5% onder de volgende mijlpaal.
  if (remaining > next * 0.05) return []
  const days = freedomDays(remaining, i.dailyExpenses)
  return [{
    id: 'mijlpaal-nadering', theme: 'vermogen', sentiment: 'positive',
    score: clamp(100 - (remaining / (next * 0.05)) * 30, 40, 80),
    variants: [
      (v) => ({
        vraag: `Nog ${formatEUR(remaining)} en ${v.subj} ${v.hebt} de mijlpaal van ${formatEUR(next)} bereikt. Hoe ${v.wil} ${v.subj} dat ${v.samen} markeren?`,
        context: `Netto vermogen ${formatEUR(i.netWorth)}, volgende mijlpaal ${formatEUR(next)}.`,
        actie: `Spreek ${v.samen} een klein vier-moment af bij ${formatEUR(next)}.`,
        vrijheidstijd: days > 0 ? freedomLabel(days) : undefined,
      }),
      (v) => ({
        vraag: `${formatEUR(next)} is bijna in zicht — nog ${formatEUR(remaining)}. Wat betekent die mijlpaal voor ${v.subj}?`,
        context: `Nog ${formatEUR(remaining)} tot ${formatEUR(next)}.`,
        actie: `Benoem ${v.samen} wat de volgende mijlpaal symboliseert.`,
        vrijheidstijd: days > 0 ? freedomLabel(days) : undefined,
      }),
    ],
  }]
}
```

Extend the `DETECTORS` array:

```ts
const DETECTORS: Detector[] = [
  detectVermogen,
  detectSparenVergelijking,
  detectUitgaven,
  detectDoelen,
  detectSchulden,
  detectActies,
  detectSparenVrijheid,
  detectFire,
  detectSpaarquoteTrend,
  detectBudgetcategorie,
  detectNieuweVasteLast,
  detectDoelDeadline,
  detectVermogensconcentratie,
  detectMijlpaal,
]
```

Extend `STARTER_IDS` (before closing `] as const`):

```ts
  'doel-deadline',
  'vermogensconcentratie',
  'mijlpaal-nadering',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/gespreksstarters.ts lib/checkin/gespreksstarters.test.ts
git commit -m "feat(checkin): detectoren doel-deadline, vermogensconcentratie, mijlpaal-nadering"
```

---

## Task 6: Engine-contracten — aanspreekvorm, determinisme, min/max

**Files:**
- Test: `lib/checkin/gespreksstarters.test.ts`

Deze taak voegt **alleen tests** toe die het volledige `buildGespreksstarters`-contract bewaken (geen nieuwe productiecode; als een test faalt is dat een echte bug die je in de engine fixt).

- [ ] **Step 1: Write the failing test**

Append to `lib/checkin/gespreksstarters.test.ts`:

```ts
describe('buildGespreksstarters — contracten', () => {
  it('always returns at least 2 and at most 5', () => {
    const empty = buildGespreksstarters(baseInput())
    expect(empty.length).toBeGreaterThanOrEqual(2)
    const loaded = buildGespreksstarters(baseInput({
      netWorthTrend: 5000, prevNetWorth: 95000,
      monthlySavings: 1500, prevMonthlySavings: 800,
      totalDebts: 30000, debtCount: 2,
      completedActionsThisMonth: 2, completedActionsFreedomDays: 10,
      savingsRate6m: 30, fireAge: 50, prevFireAge: 53,
    }))
    expect(loaded.length).toBeLessThanOrEqual(5)
  })

  it('solo output never leaks "jullie"', () => {
    const out = buildGespreksstarters(baseInput({
      audience: 'solo',
      netWorthTrend: 4000, prevNetWorth: 96000,
      totalDebts: 15000, debtCount: 1,
      monthlySavings: 900,
    }))
    const blob = out.map(o => `${o.vraag} ${o.actie} ${o.context}`).join(' ').toLowerCase()
    expect(blob).not.toContain('jullie')
    // ook geen onjuiste NL-inversievormen (Voice heb/wil/kun)
    for (const bad of ['willen je', 'hebt je', 'kunnen je', 'wilt je', 'hebben je']) {
      expect(blob).not.toContain(bad)
    }
  })

  it('household output uses "jullie" somewhere', () => {
    const out = buildGespreksstarters(baseInput({
      audience: 'household', netWorthTrend: 4000, prevNetWorth: 96000,
    }))
    const blob = out.map(o => o.vraag).join(' ').toLowerCase()
    expect(blob).toContain('jullie')
  })

  it('is deterministic for same input + monthIndex', () => {
    const a = buildGespreksstarters(baseInput({ monthIndex: 7, netWorthTrend: 3000, prevNetWorth: 97000 }))
    const b = buildGespreksstarters(baseInput({ monthIndex: 7, netWorthTrend: 3000, prevNetWorth: 97000 }))
    expect(a).toEqual(b)
  })

  it('different monthIndex yields a different phrasing for a stable topic', () => {
    const m0 = buildGespreksstarters(baseInput({ monthIndex: 0, netWorthTrend: 3000, prevNetWorth: 97000 }))
    const m1 = buildGespreksstarters(baseInput({ monthIndex: 1, netWorthTrend: 3000, prevNetWorth: 97000 }))
    const q0 = m0.find(o => o.id === 'vermogen-groei')!.vraag
    const q1 = m1.find(o => o.id === 'vermogen-groei')!.vraag
    expect(q0).not.toBe(q1)
  })
})
```

- [ ] **Step 2: Run test to verify it (likely) fails or reveals leaks**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: If a "jullie" leak exists in any solo variant, the leak test FAILS, pointing at the offending detector. Otherwise PASS.

- [ ] **Step 3: Fix any leak in the engine**

If the solo-leak test fails, find the variant that hardcoded "jullie"/"Jullie" instead of using `v.subj`/`v.subjCap` and replace it with the Voice fragment. (Common culprits: the `doel-start` and `fire-vertraging` variants that use a literal capitalized pronoun — ensure they use `v.subjCap`.) Re-run until green.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts`
Expected: PASS (all contract tests).

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/gespreksstarters.ts lib/checkin/gespreksstarters.test.ts
git commit -m "test(checkin): engine-contracten (aanspreekvorm, determinisme, min/max)"
```

---

## Task 7: Gedeelde FIRE-leeftijd-helper (DRY)

**Files:**
- Create: `lib/checkin/fire-age.ts`
- Test: `lib/checkin/fire-age.test.ts`
- Modify: `app/api/checkin/overview/route.ts:111-130`

- [ ] **Step 1: Write the failing test**

Create `lib/checkin/fire-age.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeFireAge } from './fire-age'

describe('computeFireAge', () => {
  it('returns null without a date of birth', () => {
    expect(computeFireAge({
      dateOfBirth: null, netWorth: 100000, monthlyIncome: 5000,
      monthlyExpenses: 3000, expectedReturn: 0.07, now: new Date('2026-06-08'),
    })).toBeNull()
  })

  it('returns null when not saving', () => {
    expect(computeFireAge({
      dateOfBirth: '1990-01-01', netWorth: 100000, monthlyIncome: 3000,
      monthlyExpenses: 3000, expectedReturn: 0.07, now: new Date('2026-06-08'),
    })).toBeNull()
  })

  it('computes a reasonable FIRE age', () => {
    const age = computeFireAge({
      dateOfBirth: '1991-01-01', netWorth: 150000, monthlyIncome: 5000,
      monthlyExpenses: 3000, expectedReturn: 0.07, now: new Date('2026-06-08'),
    })
    expect(age).not.toBeNull()
    expect(age!).toBeGreaterThan(35)
    expect(age!).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/fire-age.test.ts`
Expected: FAIL — `./fire-age` not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/checkin/fire-age.ts` (exact extract of the overview-route formula):

```ts
/**
 * Gedeelde FIRE-leeftijd-schatter. Eén bron voor zowel /api/checkin/overview
 * als /api/checkin/gespreksstarters (voorheen inline gedupliceerd).
 *
 * SWR = 0.04 (vaste veilige onttrekking). Simpele years-to-FIRE met
 * samengestelde groei; geeft null als er geen dob is, geen vermogen, geen
 * uitgaven of niet gespaard wordt.
 */
export interface FireAgeInput {
  dateOfBirth: string | null
  netWorth: number
  monthlyIncome: number
  monthlyExpenses: number
  expectedReturn: number | null
  now: Date
}

const SWR = 0.04

export function computeFireAge(input: FireAgeInput): number | null {
  const { dateOfBirth, netWorth, monthlyIncome, monthlyExpenses, now } = input
  if (!dateOfBirth || netWorth <= 0 || monthlyExpenses <= 0) return null

  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses / SWR
  const annualSavings = (monthlyIncome - monthlyExpenses) * 12
  if (annualSavings <= 0) return null

  const expectedReturn = input.expectedReturn || 0.07
  const yearsToFire =
    Math.log((fireTarget * expectedReturn + annualSavings) / (netWorth * expectedReturn + annualSavings)) /
    Math.log(1 + expectedReturn)
  if (!isFinite(yearsToFire) || yearsToFire <= 0) return null

  const birthDate = new Date(dateOfBirth)
  const currentAge = (now.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return Math.round(currentAge + yearsToFire)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/fire-age.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor the overview route to use the helper**

In `app/api/checkin/overview/route.ts`, add the import at the top:

```ts
import { computeFireAge } from '@/lib/checkin/fire-age'
```

Replace the inline FIRE block (currently lines ~111-130, from `// FIRE age estimate` through the closing brace before `return NextResponse.json`) with:

```ts
  // FIRE age estimate — gedeelde helper (lib/checkin/fire-age.ts)
  const profile = profileRes.data
  const fireAge = computeFireAge({
    dateOfBirth: profile?.date_of_birth ?? null,
    netWorth,
    monthlyIncome,
    monthlyExpenses,
    expectedReturn: profile?.expected_return ?? null,
    now,
  })
```

- [ ] **Step 6: Verify the overview route still type-checks**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors). The `fireAge` variable is still referenced in the existing `return NextResponse.json({ ..., fireAge })`.

- [ ] **Step 7: Commit**

```bash
git add lib/checkin/fire-age.ts lib/checkin/fire-age.test.ts app/api/checkin/overview/route.ts
git commit -m "refactor(checkin): gedeelde computeFireAge helper (DRY met overview-route)"
```

---

## Task 8: Route herschrijven naar dun (data ophalen + engine)

**Files:**
- Modify (rewrite): `app/api/checkin/gespreksstarters/route.ts`

> Deze taak heeft geen unit-test (route-handlers worden in dit project niet
> unit-getest; de regressiesuite dekt auth + responsvorm). Verificatie via
> `tsc` + handmatige sanity-run. De **engine** is al volledig getest.

- [ ] **Step 1: Replace the route with a thin handler**

Overwrite `app/api/checkin/gespreksstarters/route.ts` met:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { loadPerspectiveContext } from '@/lib/household/perspective-loader'
import { computeFireAge } from '@/lib/checkin/fire-age'
import {
  buildGespreksstarters,
  type GespreksstartersInput,
} from '@/lib/checkin/gespreksstarters'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const monthStart = new Date(currentYear, currentMonth, 1).toISOString().slice(0, 10)
  const monthEnd = new Date(currentYear, currentMonth + 1, 1).toISOString().slice(0, 10)
  const prevMonthStart = new Date(currentYear, currentMonth - 1, 1).toISOString().slice(0, 10)
  const prevMonthEnd = monthStart
  const sixMonthsAgo = new Date(Date.UTC(currentYear, currentMonth - 6, 1)).toISOString().slice(0, 10)
  const threeMonthsAgo = new Date(currentYear, currentMonth - 3, 1).toISOString().slice(0, 10)

  const [
    assetsRes, debtsRes, curIncomeRes, curExpenseRes, prevIncomeRes, prevExpenseRes,
    goalsRes, budgetsRes, actionsRes, snapshotsRes,
    income6mRes, expense6mRes, profileRes,
    curCatRes, prevCatRes, recurringRes, perspective,
  ] = await Promise.all([
    supabase.from('assets').select('name, current_value').eq('user_id', user.id),
    supabase.from('debts').select('current_balance, name, debt_type, interest_rate, monthly_payment, repayment_type, end_date, start_date, net_worth_inclusion_pct, include_aflossing_in_savings, custom_aflossing_amount, is_active').eq('user_id', user.id),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', false).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', prevMonthStart).lt('date', prevMonthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', false).gte('date', prevMonthStart).lt('date', prevMonthEnd),
    supabase.from('goals').select('name, current_value, target_value, is_completed, target_date').eq('user_id', user.id),
    supabase.from('budgets').select('name, monthly_limit, budget_type').eq('user_id', user.id).eq('budget_type', 'expense'),
    supabase.from('actions').select('id, freedom_days, is_completed, completed_at').eq('user_id', user.id),
    supabase.from('net_worth_snapshots').select('value, snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(6),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', sixMonthsAgo).lt('date', monthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', false).gte('date', sixMonthsAgo).lt('date', monthEnd),
    supabase.from('profiles').select('date_of_birth, expected_return').eq('id', user.id).maybeSingle(),
    supabase.from('transactions').select('amount, category').eq('user_id', user.id).eq('is_income', false).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount, category').eq('user_id', user.id).eq('is_income', false).gte('date', prevMonthStart).lt('date', monthStart),
    supabase.from('transactions').select('amount, counterparty_name, description, date').eq('user_id', user.id).eq('is_income', false).gte('date', threeMonthsAgo).lt('date', monthEnd),
    loadPerspectiveContext(supabase),
  ])

  // ── Kernmetrics ──────────────────────────────────────────────────────
  const assets = assetsRes.data || []
  const totalAssets = assets.reduce((s, a) => s + (a.current_value || 0), 0)
  const totalDebts = (debtsRes.data || []).reduce((s, d) => s + (d.current_balance || 0), 0)
  const netWorth = totalAssets - totalDebts

  const monthlyIncome = (curIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlyExpenses = (curExpenseRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthIncome = (prevIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthExpenses = (prevExpenseRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const prevMonthlySavings = prevMonthIncome - prevMonthExpenses
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0

  // 6-maands spaarquote (incl. aflossing als vermogensopbouw)
  const income6m = (income6mRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const expenses6m = (expense6mRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  let debtAflossing6m = 0
  for (const d of (debtsRes.data || []) as Debt[]) {
    if (!d.is_active || !d.include_aflossing_in_savings) continue
    const aflossing = d.custom_aflossing_amount != null
      ? Number(d.custom_aflossing_amount)
      : (computeRenteAflossingsSplit(d)?.currentAflossing ?? 0)
    debtAflossing6m += aflossing * ((d.net_worth_inclusion_pct ?? 100) / 100)
  }
  debtAflossing6m *= 6
  const savingsRate6m = income6m > 0 ? ((income6m - expenses6m + debtAflossing6m) / income6m) * 100 : 0

  // Snapshots → trend
  const snapshots = snapshotsRes.data || []
  const netWorthTrend = snapshots.length >= 2 ? snapshots[0].value - snapshots[1].value : 0
  const prevNetWorth = snapshots.length >= 2 ? snapshots[1].value : netWorth

  // Acties
  const allActions = actionsRes.data || []
  const completedThisMonth = allActions.filter(a =>
    a.is_completed && a.completed_at && a.completed_at >= monthStart && a.completed_at < monthEnd,
  )
  const completedActionsFreedomDays = completedThisMonth.reduce((s, a) => s + (a.freedom_days || 0), 0)
  const pendingActionsCount = allActions.filter(a => !a.is_completed).length

  // FIRE-leeftijd nu + vorige check-in
  const profile = profileRes.data
  const fireAge = computeFireAge({
    dateOfBirth: profile?.date_of_birth ?? null,
    netWorth, monthlyIncome, monthlyExpenses,
    expectedReturn: profile?.expected_return ?? null, now,
  })
  const prevFireAge = await loadPrevFireAge(supabase, user.id, currentYear, currentMonth)

  // Categorie-uitgaven (huidig vs vorige maand) + budgetlimieten
  const budgetLimits: Record<string, number> = {}
  for (const b of budgetsRes.data || []) {
    if (b.monthly_limit && b.monthly_limit > 0) budgetLimits[b.name] = b.monthly_limit
  }
  const curByCat = sumByCategory(curCatRes.data || [])
  const prevByCat = sumByCategory(prevCatRes.data || [])
  const categoryNames = new Set([...Object.keys(curByCat), ...Object.keys(prevByCat)])
  const expensesByCategory = [...categoryNames].map(name => ({
    name,
    amount: curByCat[name] || 0,
    prevAmount: prevByCat[name] || 0,
    limit: budgetLimits[name] ?? null,
  }))

  // Nieuwe vaste lasten: tegenpartij met >=2 voorkomens in 3 mnd én eerste
  // voorkomen >= 2 maanden geleden (dus pas recent begonnen).
  const newRecurring = detectNewRecurring(recurringRes.data || [], monthStart)

  // Grootste bezitting
  const topAsset = assets.length > 0
    ? assets.reduce((top, a) => (a.current_value || 0) > (top.current_value || 0) ? a : top)
    : null

  const input: GespreksstartersInput = {
    audience: perspective.hasHousehold ? 'household' : 'solo',
    monthIndex: currentYear * 12 + currentMonth,
    netWorth, netWorthTrend, prevNetWorth,
    monthlyIncome, monthlyExpenses, prevMonthIncome, prevMonthExpenses,
    monthlySavings, prevMonthlySavings, savingsRate6m, dailyExpenses,
    goals: (goalsRes.data || []).map(g => ({
      name: g.name, current: g.current_value, target: g.target_value,
      completed: g.is_completed, targetDate: g.target_date ?? null,
    })),
    totalDebts, debtCount: (debtsRes.data || []).filter(d => (d.current_balance || 0) > 0).length,
    completedActionsThisMonth: completedThisMonth.length,
    completedActionsFreedomDays, pendingActionsCount,
    fireAge, prevFireAge,
    expensesByCategory, newRecurring,
    topAsset: topAsset ? { name: topAsset.name, value: topAsset.current_value || 0 } : null,
  }

  return NextResponse.json({ starters: buildGespreksstarters(input) })
}

// ── Helpers ────────────────────────────────────────────────────────────

function sumByCategory(rows: { amount: number | null; category: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of rows) {
    const cat = t.category || 'Overig'
    out[cat] = (out[cat] || 0) + Math.abs(t.amount || 0)
  }
  return out
}

function detectNewRecurring(
  rows: { amount: number | null; counterparty_name: string | null; description: string | null; date: string }[],
  monthStart: string,
): { name: string; monthlyAmount: number }[] {
  const map: Record<string, { total: number; count: number; first: string; inCurrent: boolean }> = {}
  for (const t of rows) {
    const key = t.counterparty_name || t.description || 'Onbekend'
    if (!map[key]) map[key] = { total: 0, count: 0, first: t.date, inCurrent: false }
    map[key].total += Math.abs(t.amount || 0)
    map[key].count += 1
    if (t.date < map[key].first) map[key].first = t.date
    if (t.date >= monthStart) map[key].inCurrent = true
  }
  const out: { name: string; monthlyAmount: number }[] = []
  for (const [name, d] of Object.entries(map)) {
    // recurring (>=2x), zichtbaar deze maand, en pas recent begonnen (eerste
    // voorkomen ná het begin van de 3-maands-window → niet "oud").
    if (d.count >= 2 && d.inCurrent && d.first >= monthStart) {
      out.push({ name, monthlyAmount: Math.round(d.total / d.count) })
    }
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPrevFireAge(supabase: any, userId: string, year: number, month: number): Promise<number | null> {
  const currentKey = `checkin_snapshot_${userId}_${year}-${String(month + 1).padStart(2, '0')}`
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('updated_by', userId)
    .like('key', `checkin_snapshot_${userId}_%`)
    .order('key', { ascending: false })
    .limit(12)
  const prev = (data || []).find((s: { key: string }) => s.key !== currentKey)
  if (!prev) return null
  try {
    const parsed = JSON.parse(prev.value)
    return parsed?.metrics?.fireAge ?? null
  } catch {
    return null
  }
}
```

> **Definitie-keuze (genoteerd in spec-open-punten):** "nieuwe vaste last" =
> tegenpartij die ≥2× voorkomt in de laatste 3 maanden, deze maand voorkomt, en
> waarvan het *eerste* voorkomen in de window ≥ begin huidige maand ligt. Dit is
> een pragmatische heuristiek; verfijn later indien gewenst.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (Let op: `goals` query gebruikt nu `target_date`; `assets` query selecteert `name`. Controleer dat deze kolommen bestaan — ze worden elders ook geselecteerd, zie aandachtspunten/overview routes.)

- [ ] **Step 3: Commit**

```bash
git add app/api/checkin/gespreksstarters/route.ts
git commit -m "refactor(checkin): dunne gespreksstarters-route op pure engine + perspectief"
```

---

## Task 9: Regressietest betekenisvol maken

**Files:**
- Modify: `lib/regression-tests/suites/checkin-flow.ts:939-966` (de `checkin-gespreksstarters-data-driven` test)

- [ ] **Step 1: Replace the stale hardcoded ID test with an engine-backed one**

In `lib/regression-tests/suites/checkin-flow.ts`, voeg bovenaan bij de imports toe:

```ts
import { STARTER_IDS, buildGespreksstarters, type GespreksstartersInput } from '@/lib/checkin/gespreksstarters'
```

Vervang de test met id `checkin-gespreksstarters-data-driven` (het hele test-object,
nu een hardgecodeerde lijst van 15) door:

```ts
  {
    id: 'checkin-gespreksstarters-id-registry', name: 'Gespreksstarters: id-registry uit engine', category: CAT,
    description: 'STARTER_IDS bevat de behouden + nieuwe onderwerpen en is uniek',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const unique = new Set(STARTER_IDS)
      assertEqual(unique.size, STARTER_IDS.length, 'alle starter-ids zijn uniek')
      // Behouden onderwerpen
      for (const id of ['vermogen-groei', 'vermogen-daling', 'sparen-stijging', 'schulden-vrijheid', 'algemeen-dromen']) {
        assertIncludes(STARTER_IDS as readonly string[], id, `bevat ${id}`)
      }
      // Nieuwe onderwerpen
      for (const id of ['fire-versnelling', 'spaarquote-sterk', 'budgetcategorie-uitschieter', 'nieuwe-vaste-last', 'doel-deadline', 'vermogensconcentratie', 'mijlpaal-nadering']) {
        assertIncludes(STARTER_IDS as readonly string[], id, `bevat nieuw onderwerp ${id}`)
      }
    },
  },
  {
    id: 'checkin-gespreksstarters-voice-contract', name: 'Gespreksstarters: solo vs huishouden aanspreekvorm', category: CAT,
    description: 'Solo-output lekt geen "jullie"; huishouden gebruikt "jullie"',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const base: GespreksstartersInput = {
        audience: 'solo', monthIndex: 0,
        netWorth: 100000, netWorthTrend: 4000, prevNetWorth: 96000,
        monthlyIncome: 4000, monthlyExpenses: 3000, prevMonthIncome: 4000, prevMonthExpenses: 3000,
        monthlySavings: 1000, prevMonthlySavings: 1000, savingsRate6m: 20, dailyExpenses: 100,
        goals: [], totalDebts: 15000, debtCount: 1,
        completedActionsThisMonth: 0, completedActionsFreedomDays: 0, pendingActionsCount: 0,
        fireAge: null, prevFireAge: null, expensesByCategory: [], newRecurring: [], topAsset: null,
      }
      const solo = buildGespreksstarters(base)
        .map(s => `${s.vraag} ${s.actie} ${s.context}`).join(' ').toLowerCase()
      assert(!solo.includes('jullie'), 'solo-output bevat geen "jullie"')

      const household = buildGespreksstarters({ ...base, audience: 'household' })
        .map(s => s.vraag).join(' ').toLowerCase()
      assert(household.includes('jullie'), 'huishouden-output bevat "jullie"')
    },
  },
```

- [ ] **Step 2: Run the regression suite type-check + unit-level tests**

Run: `npx vitest run lib/regression-tests/suites/checkin-flow.ts`
Expected: PASS (the two new in-process tests; auth/HTTP tests may be skipped/!200 outside a running server — that is pre-existing behaviour, not a regression).

- [ ] **Step 3: Commit**

```bash
git add lib/regression-tests/suites/checkin-flow.ts
git commit -m "test(checkin): regressietest op engine-id-registry + voice-contract"
```

---

## Task 10: Volledige verificatie

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: PASS — geen errors.

- [ ] **Step 2: Run all touched test files**

Run: `npx vitest run lib/checkin/gespreksstarters.test.ts lib/checkin/fire-age.test.ts lib/regression-tests/suites/checkin-flow.ts`
Expected: PASS.

- [ ] **Step 3: Manual sanity (optioneel maar aanbevolen)**

Start de dev-server (`npm run dev`), doorloop een check-in tot stap "Reflectie",
en controleer:
- Solo-account: geen "jullie" in de gespreksstarters.
- Een aantal nieuwe onderwerpen verschijnt afhankelijk van data.
- Twee opeenvolgende maanden (test via een ander account of testdata) tonen
  andere formuleringen voor hetzelfde onderwerp.

- [ ] **Step 4: Final commit (indien nodig)**

Als er nog losse wijzigingen zijn:

```bash
git add -A
git commit -m "chore(checkin): afronding diversificatie reflectievragen"
```

---

## Self-review (uitgevoerd bij schrijven)

- **Spec-dekking:** herhaling (variatiepools + rotatie → Task 2/3/6), te weinig
  onderwerpen (7→14 → Task 3/4/5), te generiek (scoring + diversiteit-cap →
  Task 2), aanspreekvorm-fix (Voice → Task 1/6/9), DRY FIRE-helper (Task 7),
  dunne route + perspectief (Task 8), tests (Task 1-6, 9, 10). Alle
  spec-secties hebben een taak.
- **Type-consistentie:** `Voice`, `StarterCandidate`, `GespreksstartersInput`,
  `STARTER_IDS`, `computeFireAge` worden in elke taak gelijk benoemd en gebruikt.
- **Geen placeholders:** alle code-stappen bevatten volledige code.
- **Bekende grens:** data blijft die van de huidige gebruiker; alleen de
  aanspreekvorm volgt het huishouden (zoals in de spec vastgelegd).
```
