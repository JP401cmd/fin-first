# Shell-agnostische content audit (Fase 0.6)

> Stand 2026-05-05. Voorbereiding voor Fase 1 — welke pagina's hebben ingebakken navigatie-chrome dat de nieuwe shell straks levert. Bron: grep over `app/(app)/**/page.tsx` op patronen `Terug naar`, `← Terug`, `ArrowLeft`, ingebakken `<Breadcrumb>`, en hardcoded module-hrefs.

## Audit-bevindingen

### A. Pagina's met ingebakken back-knoppen (te verwijderen in Fase 1)

Deze pagina's renderen zelf een "← Terug naar X"-link in hun content-header. In de nieuwe shell levert de TopBar (mobile) of pane-header (desktop) deze affordance — de pagina's moeten hun eigen back-knop weghalen.

| Bestand | Module | Huidige back-target | Migratie-actie |
|---|---|---|---|
| `core/debts/[type]/page.tsx` | Kern | `/core/debts` | Back-knop verwijderen; shell levert |
| `core/assets/[type]/page.tsx` | Kern | `/core/assets` | Back-knop verwijderen; shell levert |
| `core/debts/page.tsx` | Kern | `/core` | Back-knop verwijderen |
| `core/checkin/historie/page.tsx` | Kern | `/core/checkin` | Back-knop verwijderen |
| `core/cash/import/page.tsx` | Kern | `/core/assets/cash` | Back-knop verwijderen |
| `core/assets/revalue/page.tsx` | Kern | `/core/assets` | Back-knop verwijderen |
| `core/cash/connect/page.tsx` | Kern | `/core/assets/cash` | Back-knop verwijderen |
| `core/assets/holdings/import/page.tsx` | Kern | `/core/assets/holdings` | Back-knop verwijderen |
| `core/assets/holdings/[id]/page.tsx` | Kern | `/core/assets/holdings` | Back-knop verwijderen |
| `rapportages/budget/page.tsx` | Globaal | `/rapportages` | Back-knop verwijderen |
| `rapportages/balans/page.tsx` | Globaal | `/rapportages` | Back-knop verwijderen |
| `identity/testscenarios/vragenlijsten/page.tsx` | Identiteit | `/identity/testscenarios` | Back-knop verwijderen |
| `identity/testscenarios/vragenlijsten/[id]/page.tsx` | Identiteit | `/identity/testscenarios/vragenlijsten` | Back-knop verwijderen |

**Sandbox-pagina's** (mogen blijven; verwijderbaar samen met sandbox in Fase 4):
- `beheer/shell-prototype/page.tsx` — sandbox.
- `beheer/sidebar-prototype/page.tsx` — sandbox.
- `beheer/blueprints/page.tsx` — sandbox.

**Beheer-routes** (gescheiden context, behoudt eigen layout per §8.6):
- `beheer/vragenlijsten/page.tsx`
- `beheer/testdata/page.tsx`
- `beheer/will-avatar/page.tsx`
→ niet migreren, behoudt eigen back-flows.

**Fase 3 verificatie (2026-05-04)** — `app/(app)/beheer/layout.tsx` blijft een
geïsoleerd shell-context. Het pattern (`mx-auto max-w-4xl px-4 py-5`) is intact
en raakt `ResponsiveShell` of `NavStackProvider` niet. `BeheerNav` en
`BlueprintsLayout` blijven onafhankelijk werken. De nieuwe sidebar/topbar van
`/(app)/layout.tsx` worden hier níet gerenderd — admin krijgt z'n eigen chrome,
en super-admin-redirect naar `/will` blijft werken bij niet-admins.

### B. Ingebakken `<Breadcrumb>`-imports in pagina's

Geen pagina-level breadcrumb-imports gevonden. `<Breadcrumb>` zit alleen in twee module-layouts:
- `app/(app)/core/layout.tsx` — `<Breadcrumb color="amber" />`
- `app/(app)/identity/layout.tsx` — `<Breadcrumb color="teal" />` + `<ModuleNav>`

**Migratie-actie**: in Fase 1+ deze layout-renderingen evalueren. Plan §3 zegt: shell-pad is canonical; Breadcrumb-component blijft beschikbaar voor specifieke contexten (long-form editorial). Voorlopige keuze: behoudt Breadcrumb in core/identity-layout maar verberg op mobile via `lg:hidden` (sidebar/topbar nemen rol over op desktop respectievelijk mobile).

### C. Hardcoded module-hrefs in non-module-pagina's

Slechts 6 vindplaatsen verspreid over 5 bestanden — laag risico:
- `error.tsx` (1) — globale error-page, mag blijven.
- `not-found.tsx` (2) — globale 404, mag blijven.
- `identity/jaaroverzicht/page.tsx` (1) — link naar één module, OK.
- `core/assets/holdings/[id]/not-found.tsx` (1) — sub-not-found, OK.
- `core/belasting/page.tsx` (1) — back naar `/core` in pagina-body, niet in header — ook verwijderen.

### D. Pagina-titel-h1's binnen content (geen actie nodig)

H1's met pagina-titel zijn editorial-koppen (Playfair, hero-stijl) en blijven in de pagina-content. De shell-TopBar (mobile) toont een **kortere** UI-titel (Inter 14px) parallel; geen conflict. Op desktop is er geen TopBar — sidebar voldoet als oriëntatie.

## Migratie-volgorde voorstellen

**Fase 1 (Kern)**: 9 pagina's met back-knoppen verwijderen. Plus eventuele edits aan `core/layout.tsx` voor mobile-Breadcrumb-verberging.

**Fase 2 (Wil + Horizon)**: geen pagina-back-knoppen gevonden in `/will/**` of `/horizon/**` — geen actie nodig. Wil/Horizon hadden al geen breadcrumb (zoals `routing-inventarisatie.md` §H1 noteerde).

**Fase 3 (Identiteit + globaal)**: 2 testscenarios-pagina's + 2 rapportages-pagina's = 4 back-knoppen weg. Plus identity-layout Breadcrumb mobile-verbergen.

**Fase 4 (cleanup)**: sandbox-pagina's verwijderen.

## Niet in scope (audit-bevestiging)

- `/test-*` (~80 QA-routes) — niet migreren, blijven oude shell.
- Inline back-buttons in `BottomSheet`/modals (bv. `year-details-sheet.tsx`, `print-toolbar.tsx`) — die zijn modal-eigen, blijven werken.
- `error.tsx` en `not-found.tsx` — globale fallbacks, eigen back-flow.

## Volgende stap

In Fase 1.x worden deze pagina's per-module aangepast samen met de overlay-migratie. Deze audit dient als checklist tijdens die migraties.
