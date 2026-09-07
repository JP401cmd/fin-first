import { RuleTester } from 'eslint'
import { geenMaandgrensIso } from './geen-maandgrens-iso.mjs'

/**
 * Test op de GATE zelf (huisprecedent: test/uat-stale-scan.test.ts).
 *
 * De aanleiding van UR3-25 was dat niemand ooit had getoetst of de vangrail de
 * vórm ving die hij zei te vangen: hij stond op "error", meldde niets, en dat
 * werd gelezen als bewijs dat er niets mis was. Deze suite pint alle drie de
 * schrijfvormen én de grenzen waar de regel juist stil moet blijven.
 */
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

ruleTester.run('geen-maandgrens-iso', geenMaandgrensIso, {
  valid: [
    // ≤ 1 argument = een echte timestamp, geen uit componenten gebouwde grens.
    'new Date().toISOString()',
    "new Date('2026-09-01').toISOString()",
    'const t = new Date(); t.toISOString()',
    'const t = new Date(ms); t.toJSON()',
    // Een componenten-Date die nooit geserialiseerd wordt.
    'const d = new Date(2026, 8, 1); d.getMonth()',
    // Canoniek alternatief.
    "localMonthStart(new Date(2026, 8, 1))",
    // Andere methode op een componenten-Date.
    'new Date(2026, 8, 1).toLocaleDateString()',
    // SCOPE-RESOLUTIE, de kern van de regel: dezelfde naam in twee scopes. De
    // `d` die geserialiseerd wordt is de veilige. Een tekstuele scan koppelt
    // deze twee verkeerd — dat gaf in het onderzoek twee vals-positieven
    // (lib/test-personas.ts, lib/natural-milestones.ts).
    `function veilig() { const d = new Date(); return d.toISOString() }
     function anders() { const d = new Date(2026, 8, 1); return d.getTime() }`,
    // Een binding met meerdere writes: te weinig zekerheid, dus bewust stil.
    'let d = new Date(2026, 8, 1); d = new Date(); d.toISOString()',
    // Functie-vorm met een pad dat géén componenten-Date teruggeeft.
    `function maybe(x) { if (x) return new Date(2026, 8, 1); return new Date() }
     maybe(1).toISOString()`,
    // Geïmporteerde helper: ESLint heeft geen cross-file scope.
    "import { at } from './at'; at(2026, 8, 1).toISOString()",
    // Geneste functie mag de returns van de buitenste niet vervuilen.
    `function buiten() { const inner = () => new Date(2026, 8, 1); return new Date() }
     buiten().toISOString()`,
  ],

  invalid: [
    // Vorm 1 — geketend (wat de oude esquery-selector al ving).
    { code: 'new Date(2026, 8, 1).toISOString()', errors: [{ messageId: 'maandgrens' }] },
    { code: 'new Date(y, m, 1).toJSON()', errors: [{ messageId: 'maandgrens' }] },
    {
      code: "new Date(year, month, 1).toISOString().split('T')[0]",
      errors: [{ messageId: 'maandgrens' }],
    },

    // Vorm 2 — variabele. HET DEFECT VAN UR3-25: hier zweeg de oude selector,
    // omdat hij `callee.object.type="NewExpression"` eiste.
    {
      code: 'const d = new Date(2026, 8, 1); d.toISOString()',
      errors: [{ messageId: 'maandgrens' }],
    },
    { code: 'let d = new Date(y, m, 1); d.toJSON()', errors: [{ messageId: 'maandgrens' }] },
    // Ook wanneer het gebruik in een geneste scope zit.
    {
      code: 'const d = new Date(y, m, 1); function f() { return d.toISOString() }',
      errors: [{ messageId: 'maandgrens' }],
    },
    // Mutatie ná de constructie maakt de grondslag niet veilig.
    {
      code: 'const d = new Date(y, m, 1); d.setDate(15); d.toISOString()',
      errors: [{ messageId: 'maandgrens' }],
    },

    // Vorm 3 — lokale functie die op elk pad een componenten-Date teruggeeft.
    {
      code: 'const at = (y, m, d) => new Date(y, m - 1, d); at(2026, 8, 7).toISOString()',
      errors: [{ messageId: 'maandgrens' }],
    },
    {
      code: 'function at(y, m, d) { return new Date(y, m, d) } at(2026, 8, 7).toJSON()',
      errors: [{ messageId: 'maandgrens' }],
    },

    // BEWUST DOM EN LUID: een middag-anker verschuift níét maar wordt wél
    // gemeld — dat verdient een gerichte disable, geen uitzondering in de regel
    // (analyse §7). Een regel die over uren gaat redeneren wordt onvoorspelbaar.
    { code: 'new Date(2026, 8, 1, 12).toISOString()', errors: [{ messageId: 'maandgrens' }] },
  ],
})
