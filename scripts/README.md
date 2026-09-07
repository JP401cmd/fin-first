# `scripts/`

Losse ontwikkel- en onderhoudsscripts. **Waar een script aan hangt is hier de
enige waarheid** — een check die nergens aan hangt draait nooit, zwijgt dus
altijd, en dat zwijgen wordt gelezen als bewijs van dekking. Voeg je een check
toe, haak 'm dan meteen aan en zet 'm in de juiste lijst hieronder.

Onderdeel van de build/CI-flow (zie `package.json`):

- `scripts/architecture/generate.mjs` — scant de architectuur-feiten (`npm run arch:diagram`);
  `--check` draait als versheidsstap in `.github/workflows/ci.yml`.
- `scripts/audit-kpi-actions.mjs` — KPI-/actie-audit.
- `scripts/copy-pdfjs-worker.mjs` — kopieert de pdf.js-worker (postinstall/build).
- `scripts/perf/route-sizes.mjs` — bundle-budget per route
  (`npm run perf:route-sizes`); draait in de `bundle-budget`-job op elke PR.

Blokkerende poorten in `.husky/pre-push` (statisch, offline, < 1s elk):

- `scripts/check-client-data-reads.mjs` · `scripts/check-freedom-time-basis.mjs` ·
  `scripts/check-overlay-standard.mjs` · `scripts/check-tap-targets.mjs` ·
  `scripts/check-heading-levels.mjs` · `scripts/check-productiecijfers.mjs` ·
  `scripts/check-self-modification.mjs` · `scripts/ai-parity/scan.mjs --check` ·
  `scripts/merkstem/scan.mjs --check`
- `scripts/page-info/check-coverage.mjs` — info-knoppen: bestaat de PAGE_INFO-sleutel,
  en draagt elke inhoudspagina een `i`? (`npm run page-info:check`)
- `scripts/glossary/check-coverage.mjs` — begrippenlijst: wijst elke
  `<GlossaryTerm>`/`terms:`-chip naar een bestaande sleutel? (`npm run glossary:check`)

Geplande, **niet-gatende** wachters:

- `scripts/litert/release-check.mjs` — is er een nieuwere `@litert-lm/core` dan
  onze pin, en noemt de changelog de Adreno-GPU-correctheidsfix?
  (`npm run litert:check`). Draait tweemaal per week via
  `.github/workflows/litert-watch.yml`. Signaleert alleen — heropent de bouwfase
  van de mobiele lokale AI (L3) nooit zelf, en is bewust géén push-gate: zijn
  niet-nul exit is het signaal, hij heeft netwerk nodig, en zijn uitkomst
  verandert zonder dat de repo verandert. Zie de docblock in het script.

Alle overige bestanden zijn ad-hoc probes/one-offs; leun er niet op en commit
er geen nieuwe met ingebedde keys.

## Canoniek migratiepad (verplicht)

Databaseschema-wijzigingen lopen via **één** pad:

1. Schrijf de migratie als `supabase/migrations/<timestamp>_<naam>.sql`.
2. Pas 'm toe op remote via de **Supabase-MCP-tool `apply_migration`**
   (lokaal desnoods `supabase db push`).

Zie `reference_supabase_migration_drift.md` en de CLAUDE.md-conventie: lokale
migrations lopen uit de pas met remote, dus DDL altijd via `apply_migration`.

**Niet doen:** ad-hoc `apply-migration-*`-runnerscripts. De historische varianten
(`apply-migration.js`, `-mcp.mjs`, `-mgmt.js`, `-rest.js`, `-via-api.mjs`,
`apply-household-migration.mjs`) zijn verwijderd — ze bevatten hardcoded
project-refs/keys en zijn door het canonieke pad overbodig.
