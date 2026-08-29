#!/usr/bin/env node
/**
 * TriFinity — merkstem-copy-extractie
 * ============================================================================
 * Zero-dependency Node ESM module. Haalt uit een bronbestand alléén de tekst die
 * de LEZER bereikt — JSX-tekstknopen, proza-achtige string-/template-literals,
 * `aria-label`/`alt`/`placeholder` — en normaliseert die tot één deterministische
 * copy-hash. Alles wat vorm is (Tailwind-klassen, CSS-vars, hex, SVG-paden, URL's,
 * losse tokens) valt eruit.
 *
 * WAAROM NIET HET HELE BESTAND HASHEN. Gemeten op commit 394e656f0 (a11y-ronde,
 * uitsluitend het teksttoken `--ink-4` → `--ink-meta`, nul woorden gewijzigd):
 * bestandshashing gaf 6 van 6 vals alarm op zes landingbestanden. Genormaliseerde
 * copy-extractie gaf daar 0 van 6 vals alarm, en sloeg op drie échte copy-commits
 * (119e674a1, 03be09dfa, f66d5aa3d) aan op 10 van 10 geraakte bestanden. Een gate
 * die bij elke opmaakwijziging piept wordt binnen een maand genegeerd; dit is de
 * reden dat de extractie bestaat.
 *
 * WAT DIT NIET IS. Dit meet niet of de copy góéd is — alleen of hij is bewogen
 * sinds iemand hem naast de toon-/claimbron heeft gelegd. Zie scripts/merkstem/scan.mjs.
 *
 * De extractie is en blijft een heuristiek. Copy binnen `{'…'}`-expressies of met
 * `${}`-interpolatie kan gedeeltelijk wegvallen; daarom rapporteert de scanner het
 * aantal gevonden copyregels per bestand — een plotselinge daling is zélf een signaal.
 */

import { createHash } from 'node:crypto'

/**
 * Bare Tailwind-utilities die óók gewone woorden zijn. Zonder deze lijst haalt
 * `relative flex` of `block truncate` de proza-drempel (twee pure-letterwoorden).
 * Bewust kort gehouden: alles mét een koppelteken, dubbele punt of blokhaak valt
 * al af op de woordtest zelf.
 */
const TAILWIND_BARE = new Set([
  'flex', 'grid', 'block', 'inline', 'hidden', 'contents', 'table', 'flow',
  'relative', 'absolute', 'fixed', 'sticky', 'static', 'isolate',
  'truncate', 'italic', 'underline', 'uppercase', 'lowercase', 'capitalize',
  'transition', 'transform', 'container', 'group', 'peer', 'border', 'rounded',
  'shadow', 'ring', 'outline', 'overflow', 'cursor', 'select', 'resize',
  'appearance', 'antialiased', 'invisible', 'visible', 'collapse', 'wrap',
  'nowrap', 'none', 'auto', 'center', 'start', 'end', 'between', 'around',
  'evenly', 'top', 'bottom', 'left', 'right', 'middle', 'baseline', 'sub',
  'super', 'full', 'screen', 'min', 'max', 'fit', 'first', 'last', 'odd',
  'even', 'dark', 'light', 'sr', 'not', 'has', 'aria', 'data',
])

/**
 * Attribuut-/functiecontexten waarvan de string-literal per definitie techniek is.
 * Dit is de goedkoopste en scherpste filter: verreweg de meeste ruis-strings zijn
 * de waarde van `className=` of een `cn(...)`-argument, en die herken je aan wat
 * er vóór het aanhalingsteken staat — niet aan de inhoud.
 *
 * `aria-label`, `alt`, `title` en `placeholder` staan er BEWUST niet in: dat is
 * tekst die de gebruiker bereikt en dus merkstem.
 */
const TECHNICAL_CONTEXT =
  /(?:^|[\s{([,;:])(?:className|class|classNames|cn|clsx|cva|twMerge|twJoin|style|viewBox|d|fill|stroke|strokeLinecap|strokeLinejoin|xmlns|href|src|srcSet|action|method|rel|target|as|type|name|id|key|htmlFor|role|tabIndex|testId|dataTestId|import|require|from|url|path|route|slug|icon|color|bg|variant|size|align|encoding|charset)\s*[=:(]\s*\{?\s*$/

/**
 * Eén scan over de bron die drie dingen tegelijk oplevert:
 *  - `literals`  string-/template-literals met hun positie en voorafgaande context
 *  - `skeleton`  even lange kopie waarin commentaar én literal-INHOUD zijn geblankt,
 *                zodat de JSX-tekstextractie (`>`…`<`) niet struikelt over een `>`
 *                in een string of een `<` in een commentaarregel
 *
 * Bewust één handgeschreven scanner in plaats van regexes over de rauwe bron:
 * commentaar in een string en aanhalingstekens in commentaar zijn precies de
 * gevallen waar een regex-aanpak stil verkeerde tekst binnenlaat.
 */
export function scanSource(source) {
  const literals = []
  const skeleton = new Array(source.length)
  for (let i = 0; i < source.length; i++) skeleton[i] = source[i]

  const blank = (from, to) => {
    for (let i = from; i < to && i < source.length; i++) {
      skeleton[i] = source[i] === '\n' ? '\n' : ' '
    }
  }

  let i = 0
  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]

    // ── commentaar ────────────────────────────────────────────────────────────
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      blank(i, stop)
      i = stop
      continue
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }
    // JSX-commentaar `{/* … */}` valt al onder de blokcommentaar-tak hierboven.

    // ── gewone string ─────────────────────────────────────────────────────────
    if (c === '"' || c === "'") {
      const startBody = i + 1
      let j = startBody
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === c) break
        if (source[j] === '\n') break // ongesloten string: niet doorlopen
        j++
      }
      const body = source.slice(startBody, j)
      literals.push({ index: i, text: unescapeLiteral(body), context: source.slice(Math.max(0, i - 60), i) })
      blank(startBody, j)
      i = j + 1
      continue
    }

    // ── template-literal ──────────────────────────────────────────────────────
    if (c === '`') {
      const startBody = i + 1
      let j = startBody
      let body = ''
      while (j < source.length) {
        if (source[j] === '\\') {
          body += source.slice(j, j + 2)
          j += 2
          continue
        }
        if (source[j] === '`') break
        if (source[j] === '$' && source[j + 1] === '{') {
          // Interpolatie: sla de expressie over en zet er één placeholder neer, zodat
          // een hernoemde variabele geen copy-drift is maar een gewijzigde zin wel.
          let depth = 1
          let k = j + 2
          while (k < source.length && depth > 0) {
            if (source[k] === '{') depth++
            else if (source[k] === '}') depth--
            k++
          }
          body += '{}'
          blank(j, k)
          j = k
          continue
        }
        body += source[j]
        j++
      }
      literals.push({ index: i, text: unescapeLiteral(body), context: source.slice(Math.max(0, i - 60), i) })
      blank(startBody, j)
      i = j + 1
      continue
    }

    i++
  }

  return { literals, skeleton: skeleton.join('') }
}

/** Draai de escapes terug die de lezer niet ziet (`\'`, `\"`, `` \` ``, `\\`, `\n`). */
function unescapeLiteral(body) {
  return body.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, ' ')
}

/** Witruimte normaliseren: opmaak (inspringing, regelafbreking) is geen copy. */
export function normalize(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function isTailwindBare(word) {
  return TAILWIND_BARE.has(word.toLowerCase())
}

/** Aantal "echte" woorden: pure letters, minstens twee tekens, geen bare Tailwind-utility. */
export function wordCount(text) {
  let n = 0
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/^[("'’“”«‘]+/, '').replace(/[.,!?;:()"'’“”»…]+$/, '')
    if (/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’]+$/.test(w) && !isTailwindBare(w)) n++
  }
  return n
}

/**
 * Is dit tekst die een lezer bereikt? Twee echte woorden, of één echt woord met
 * zinsafsluiting ("Klaar."). Alles wat als vorm herkenbaar is, valt er vóór die
 * telling al uit.
 */
export function looksLikeProse(text) {
  const t = normalize(text)
  if (t.length < 3 || t.length > 8000) return false
  if (/^(https?:)?\/\//.test(t)) return false
  if (/^(data:|mailto:|tel:|--|\$\{|@[a-z]|#[0-9a-fA-F]{3,8}$)/.test(t)) return false
  if (/^[a-zA-Z-]+\([^)]*\)$/.test(t)) return false // var(--x), rgb(…), calc(…)
  if (/^[MmLlHhVvCcSsQqTtAaZz][\d\s.,-]/.test(t)) return false // SVG-pad
  if (/^[\d\s.,%€$+-]+$/.test(t)) return false // los getal/bedrag
  if (/^\/[^\s]*$/.test(t)) return false // route-pad
  if (/^use (client|server|strict)$/.test(t)) return false // directive-prologue
  return wordCount(t) >= 2 || (wordCount(t) === 1 && /[.!?…]$/.test(t))
}

/**
 * Alle copyregels uit één bronbestand, in documentvolgorde.
 *
 * Volgorde telt bewust mee in de hash: copy verplaatsen ís een copywijziging
 * (de leesvolgorde verandert), en een gate die verplaatsing niet ziet, ziet ook
 * het verplaatsen van een claim naar een andere sectie niet.
 */
export function extractCopy(source, { jsx = true } = {}) {
  const { literals, skeleton } = scanSource(source)
  const found = []

  for (const lit of literals) {
    if (TECHNICAL_CONTEXT.test(lit.context)) continue
    const t = normalize(lit.text)
    if (looksLikeProse(t)) found.push({ index: lit.index, text: t })
  }

  // JSX-tekstknopen: alles tussen `>` en `<` in het SKELET — literal-inhoud en
  // commentaar zijn daar weggeblankt, dus een `>` in een zin of een `<` in een
  // commentaarregel misleidt de match niet. We nemen de skelet-tekst zelf over
  // (níét dezelfde uitsnede uit de rauwe bron), anders lekt geblankt commentaar
  // alsnog de copy in.
  //
  // Alleen voor .tsx/.jsx: in een gewoon .ts-bestand zijn `<` en `>` gewoon
  // vergelijkingsoperatoren, en dan levert dit patroon codefragmenten op i.p.v.
  // copy — dat is precies wat het eerste prototype op lib/briefing/directives.ts deed.
  if (jsx) {
    const jsxText = />([^<>{}]+)</g
    let m
    while ((m = jsxText.exec(skeleton)) !== null) {
      const t = normalize(m[1])
      if (looksLikeProse(t)) found.push({ index: m.index + 1, text: t })
    }
  }

  found.sort((a, b) => a.index - b.index)
  return found.map((f) => f.text)
}

/** sha256 over de samengevoegde copyregels — leeg bestand ⇒ hash van de lege string. */
export function copyHash(source, options) {
  return createHash('sha256').update(extractCopy(source, options).join('\n')).digest('hex')
}

/** JSX-extractie aan/uit op basis van de bestandsextensie (.tsx/.jsx = wél). */
export function jsxForFile(file) {
  return /\.[jt]sx$/.test(file)
}

/**
 * Eén gemarkeerde `== NAAM ==`-sectie uit een DNA-bestand. De secties in
 * lib/ai/dna/base.ts zijn al zo gemarkeerd, dus dit is een letterlijke uitsnede —
 * geen heuristiek. Retourneert null als de sectie niet bestaat (dat is drift, geen
 * "geen wijziging"; de caller moet dat hard behandelen).
 */
export function extractDnaSection(source, name) {
  const re = new RegExp('^== ' + name + ' ==\\s*$([\\s\\S]*?)(?=^== |\\s*$(?![\\s\\S]))', 'm')
  const m = source.match(re)
  return m ? normalize(m[1]) : null
}

/**
 * Eén `## <naam>`-sectie uit een markdown-bestand (de claimlijst in
 * compliance-check/SKILL.md). Read-only: dit script schrijft nóóit in .claude/.
 */
export function extractMarkdownSection(source, heading) {
  const re = new RegExp('^##\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))', 'm')
  const m = source.match(re)
  return m ? normalize(m[1]) : null
}
