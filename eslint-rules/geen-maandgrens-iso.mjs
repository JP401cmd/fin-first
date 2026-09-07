/**
 * ESLint-regel `trifinity/geen-maandgrens-iso`.
 *
 * WAT DEZE REGEL VANGT
 * Een `Date` die uit LOKALE datum-componenten is gebouwd (`new Date(jaar,
 * maand, …)`, dus ≥ 2 argumenten) en vervolgens via `toISOString()`/`toJSON()`
 * naar een `YYYY-MM-DD`-grens wordt omgezet. In UTC+ tijdzones (NL = CET/CEST)
 * rekent `toISOString()` terug naar de vórige dag: de maandgrens schuift een
 * dag terug. Canoniek alternatief: `lib/month-range.ts`
 * (`localMonthStart` / `localMonthBounds` / `localMonthStartMonthsAgo` /
 * `localMonthEnd`).
 *
 * WAAROM DIT GEEN `no-restricted-syntax`-SELECTOR IS (UR3-25, 6 sep 2026)
 * De vorige vangrail was één esquery-selector die `callee.object.type=
 * "NewExpression"` eiste — de `Date` moest in DEZELFDE expressie geconstrueerd
 * zijn. Daarmee kende hij precies één schrijfvorm en zag hij de variabele-vorm
 * (`const d = new Date(j,m,1); d.toISOString()`) structureel niet; vier
 * productie-overtredingen zijn er ongemerkt doorheen geglipt, waarvan één de
 * einddatum van het maandrapport een dag te vroeg zette. Dat is geen te nauw
 * patroon dat je met een betere selector wegpoetst: esquery heeft géén
 * scope-resolutie, dus een selector kan een binding per definitie niet van
 * declaratie naar gebruik volgen. Vandaar een echte regel, die de ontvanger
 * van `toISOString()` oplost via de scope-keten.
 *
 * WAT DEZE REGEL BEWUST NIET VANGT (zie ook docs/gate-dekking.md)
 * - `new Date()` / `new Date(isoString)` (≤ 1 argument) → dat is een echte
 *   timestamp, geen uit componenten gebouwde kalendergrens.
 * - `const d = new Date(); d.setMonth(…); d.toISOString()` — de mutatie-vorm.
 *   64 treffers in de repo; de verschuiving treedt daar alleen op tussen 00:00
 *   en 02:00 lokale tijd. Bewust buiten scope, eigen kaart.
 * - Een helper die geïmporteerd wordt uit een ánder bestand: de regel kijkt
 *   alleen binnen het bestand (ESLint heeft geen cross-file scope).
 * - Een variabele met meerdere toewijzingen: te weinig zekerheid, dus stil.
 *
 * DE REGEL IS BEWUST DOM EN LUID. Een middag-anker (`new Date(j,m,d,12)`)
 * verschuift níét maar wordt wél gemeld. Dat is geen bug: zo'n anker is
 * zeldzaam en verdient een gerichte `// eslint-disable-next-line
 * trifinity/geen-maandgrens-iso -- <reden>`. Een regel die zelf gaat redeneren
 * over uren wordt onvoorspelbaar, en een onvoorspelbare gate wordt genegeerd.
 */

const SERIALIZERS = new Set(['toISOString', 'toJSON'])

/** `new Date(a, b, …)` met ≥ 2 argumenten = een uit componenten gebouwde Date. */
function isComponentDate(node) {
  return (
    !!node &&
    node.type === 'NewExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Date' &&
    node.arguments.length >= 2
  )
}

/**
 * Los een identifier op naar zijn binding — eerst via de reference die ESLint
 * zelf heeft gelegd (exact), anders via een naam-zoektocht omhoog door de
 * scope-keten. Dit is precies wat een tekstuele scan NIET kan: dezelfde naam in
 * twee functiescopes (`d` in lib/test-personas.ts, `target` in
 * lib/natural-milestones.ts) wordt hier correct uit elkaar gehouden.
 */
function resolveIdentifier(scope, identifier) {
  for (let s = scope; s; s = s.upper) {
    const ref = s.references.find((r) => r.identifier === identifier)
    if (ref) return ref.resolved
  }
  for (let s = scope; s; s = s.upper) {
    const variable = s.variables.find((v) => v.name === identifier.name)
    if (variable) return variable
  }
  return null
}

/** De initialisator van een binding met precies één definitie en één write. */
function singleWriteInit(variable) {
  if (!variable || variable.defs.length !== 1) return null
  const writes = variable.references.filter((r) => r.isWrite())
  if (writes.length > 1) return null
  const def = variable.defs[0]
  if (def.type === 'Variable' && def.node.type === 'VariableDeclarator') return def.node.init
  if (def.type === 'FunctionName') return def.node
  return null
}

/** Alle `return`-argumenten van deze functie, zónder in geneste functies te kijken. */
function collectReturnArguments(fnBody) {
  const out = []
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      return // eigen return-scope
    }
    if (node.type === 'ReturnStatement') out.push(node.argument)
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue
      const child = node[key]
      if (Array.isArray(child)) child.forEach(walk)
      else if (child && typeof child.type === 'string') walk(child)
    }
  }
  walk(fnBody)
  return out
}

/** Geeft deze (lokale) functie op ELK pad een uit componenten gebouwde Date terug? */
function returnsOnlyComponentDate(fn) {
  if (!fn) return false
  if (
    fn.type !== 'FunctionDeclaration' &&
    fn.type !== 'FunctionExpression' &&
    fn.type !== 'ArrowFunctionExpression'
  ) {
    return false
  }
  if (fn.body.type !== 'BlockStatement') return isComponentDate(fn.body) // arrow met expressie-body
  const returns = collectReturnArguments(fn.body)
  return returns.length > 0 && returns.every(isComponentDate)
}

export const geenMaandgrensIso = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Verbied het serialiseren van een uit lokale componenten gebouwde Date via toISOString()/toJSON() — dat schuift de maandgrens in NL een dag terug.',
    },
    schema: [],
    messages: {
      maandgrens:
        'Gebruik lib/month-range.ts (localMonthBounds / localMonthStart / localMonthStartMonthsAgo / localMonthEnd) i.p.v. new Date(jaar, maand, …).{{method}}() — die schuift de maandgrens in NL een dag terug. Bewust een anker dat niet verschuift? // eslint-disable-next-line trifinity/geen-maandgrens-iso -- <reden>.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()

    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression' || callee.computed) return
        if (callee.property.type !== 'Identifier' || !SERIALIZERS.has(callee.property.name)) return

        const receiver = callee.object
        let hit = false

        // Vorm 1 — geketend: `new Date(j, m, d).toISOString()`.
        if (isComponentDate(receiver)) {
          hit = true
        }
        // Vorm 2 — variabele: `const d = new Date(j, m, 1); d.toISOString()`.
        else if (receiver.type === 'Identifier') {
          const variable = resolveIdentifier(sourceCode.getScope(receiver), receiver)
          hit = isComponentDate(singleWriteInit(variable))
        }
        // Vorm 3 — functie: `at(j, m, d).toISOString()` met een LOKALE `at`
        // die op elk pad een componenten-Date teruggeeft.
        else if (receiver.type === 'CallExpression' && receiver.callee.type === 'Identifier') {
          const variable = resolveIdentifier(sourceCode.getScope(receiver.callee), receiver.callee)
          hit = returnsOnlyComponentDate(singleWriteInit(variable))
        }

        if (hit) {
          context.report({
            node,
            messageId: 'maandgrens',
            data: { method: callee.property.name },
          })
        }
      },
    }
  },
}

export default geenMaandgrensIso
