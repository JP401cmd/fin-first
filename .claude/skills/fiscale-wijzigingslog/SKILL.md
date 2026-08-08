---
name: fiscale-wijzigingslog
description: Gebruik bij elk signaal dat de fiscale regels veranderen — Prinsjesdag, een Kamerbrief of wetsvoorstel over het Box 3-traject richting 2028, een eindejaarsbesluit, of nieuwe jaarcijfers van de Belastingdienst. Ook bij het vaste kwartaalmoment en vóór elke release die de rekenkern raakt. Legt de wijziging vast met bron en status, wijst aan wat er in lib/box3-data.ts en de bewijslast meebeweegt, en koppelt hem aan een ADR.
---

# Fiscale wijzigingslog — de wacht op regels die stil verouderen

**Eerste regel — een fiscale wijziging die niet in `lib/box3-data.ts` landt, geeft geen foutmelding. Alleen een verkeerd antwoord.** De app rekent netjes door met verouderde regels en niemand ziet het. De publieke Vrijheidscheck rekent vandaag al op deze data: een gemiste wijziging maakt een openbaar resultaat onwaar, allowlist open of dicht.

## Wanneer je kijkt

De trigger is de wetgevingskalender, niet de werkqueue:

- **Prinsjesdag** (derde dinsdag september) — het Belastingplan voor het volgende jaar.
- **Het Box 3-traject richting 2028** — elke Kamerbrief, novelle of uitspraak; geen detail maar een herziening van de hele toekomstprojectie.
- **Eindejaarsbesluiten en de definitieve jaarcijfers** (december/januari) — forfaits en vrijstellingen worden dan pas hard.
- **Het kwartaalmoment** — één keer per kwartaal nalopen of er iets langs is gekomen dat je gemist hebt.

Kamerstukken en besluiten komen als PDF binnen: lees ze met de **Read**-tool (`pages`-parameter), niet via een omweg.

## Wat je vastlegt

Per wijziging een rij in `docs/fiscale-wijzigingslog.md`: **datum gezien · bron (Kamerstuk-/besluitnummer + link, nooit "ik las ergens") · wat verandert (één zin, gewone taal) · ingangsdatum (vanaf welk belastingjaar) · raakt (welke parameter in de code) · status.**

Status is `voorstel` · `aangenomen` · `verwerkt` (+ ADR-nummer). **Een voorstel leg je óók vast, maar verwerk je niet** — anders rekent de app met wetgeving die er niet is.

## Van signaal naar code — vier plekken bewegen altijd mee

1. **De jaartabel** — `BOX3_PARAMS[jaar]` in `lib/box3-data.ts` (forfaits, tarief, heffingsvrij, schuldendrempel). Nieuw jaar? Ook `TaxYear` en `CURRENT_TAX_YEAR`. Box 1/Vpb: `lib/box1-tax.ts`.
2. **De afgeleiden** — die leiden zichzelf af uit de tabel en mogen dat blijven doen: `NL_FICTIEF_BELEGGINGEN → BOX3_DRAG/NL_SWR/NL_MULTIPLIER` in `lib/constants.ts`, en `BOX3_VRIJSTELLING_SINGLE` in `lib/box3-taxable-input.ts`. **Nooit los hardcoden** (CLAUDE.md: geen financiële constanten buiten `lib/constants.ts`/`lib/box3-data.ts`). Precies hier ontstond eerder drift: het FIRE-forfait rekende nog 5,88% terwijl de tabel al 6,00% was.
3. **De curatie** — de calc-entry `box3-forfaitair` in `lib/architecture/calculations.ts` (`constants` + `note`), en `box1` als het Box 1 raakt. De Berekeningen-view liegt anders.
4. **De bewijslast** — `lib/box3-data.test.ts`, `lib/box3-taxable-input.test.ts`, `lib/box3-tegenbewijs.test.ts`, `lib/tax-optimizer/box3-optimizer.test.ts` én de regressiesuite `lib/regression-tests/suites/box3-belasting.ts`. Een fiscale wijziging zonder aangepaste verwachtingswaarde is niet verwerkt maar verstopt.

**Verificatie — let op de twee lagen.** De unit-tests: `npx tsc --noEmit` + `npx vitest run lib/box3-data.test.ts lib/box3-taxable-input.test.ts lib/box3-tegenbewijs.test.ts lib/tax-optimizer/box3-optimizer.test.ts`. De regressiesuite draait **niet** onder vitest: die loopt via de server-runner (`/beheer/regressietest`, of `POST /api/regression/run` tegen een draaiende `npm run dev`). `npm run test:run` dekt hem dus niet — draai hem apart.

## De ADR

Elke verwerkte wijziging krijgt een ADR in `docs/adr/NNNN-titel.md` met frontmatter (`id`, `title`, `status`, `date`, `elements` — voor fiscale wijzigingen doorgaans `[as-belasting]`). Gebruik het **eerstvolgende vrije nummer** — kijk in `docs/adr/`, tel niet op uit je hoofd (stand 8 augustus 2026: 0089 is vrij). De reden staat in de ADR, niet in een commit-bericht dat niemand terugvindt. Zet het ADR-nummer terug in de logregel.

## De grens

De log registreert wat de wetgever besluit en wat dat in de code raakt. Het is **geen belastingadvies** en gaat de app niet in als aanbeveling — bij publieke uitingen of AI-teksten hierover eerst `compliance-check` (Wft: inzicht mag, advies niet).

## Verwijzing

Stroom 05 in `trifinity-org/org_plan/30-werkstromen.md`; rollen De Waakhond en De Rekenmeester (`org_plan/10-rollen.md`). Verwant: `extend-feature`, `compliance-check`, `release`.
