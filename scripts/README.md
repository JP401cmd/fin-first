# `scripts/`

Losse ontwikkel- en onderhoudsscripts. Alleen deze zijn onderdeel van de
build/CI-flow (zie `package.json`):

- `scripts/architecture/generate.mjs` — scant de architectuur-feiten (`npm run arch:diagram`).
- `scripts/audit-kpi-actions.mjs` — KPI-/actie-audit.
- `scripts/copy-pdfjs-worker.mjs` — kopieert de pdf.js-worker (postinstall/build).

Terugkerende, handmatig of via een routine aangeroepen checks (geen build/CI,
wél onderhouden en getest):

- `scripts/perf/route-sizes.mjs` — bundle-budget per route (`npm run perf:route-sizes`).
- `scripts/litert/release-check.mjs` — is er een nieuwere `@litert-lm/core` dan
  onze pin, en noemt de changelog de Adreno-GPU-correctheidsfix?
  (`npm run litert:check`). Signaleert alleen — heropent de bouwfase van de
  mobiele lokale AI (L3) nooit zelf; zie de docblock in het script.

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
