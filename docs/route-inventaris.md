# Route-inventaris & IA-status

> Momentopname 2026-06-16. Bron-van-waarheid voor navigatie blijft de code: `lib/nav-config.ts`,
> `lib/navigation.ts`, `lib/command-palette/navigation-index.ts`, `lib/beheer-sections.ts` en
> `next.config.ts`. Dit document cureert de *betekenis* (welke schermen zijn canoniek, legacy of
> test) en legt de bekende IA-drift vast. Het is geen generated artefact.

## Samenvatting

318 page-routes, verdeeld als:

| Categorie | Aantal (ca.) | Status |
|---|---|---|
| Canonieke nav-routes | 43 | Actief, in `nav-config`/command-palette |
| Legacy backing-routes (`/core/*`, `/horizon/*`, `/will`, `/identity`, `/dashboard`) | 46 | Deels redirect, **deels load-bearing** (zie hieronder) |
| Beheer (admin, role-gated) | 40 | Actief via `beheer-sections.ts` + command-palette (aug 2026: `/beheer/roadmap` + `/beheer/development` verwijderd via besluit 02, `/beheer/doelen` via WF-BEHEER-12-bug1) |
| `/test-*` (regressie/dev) | ~185 | Bewust, in prod geblokkeerd via proxy |
| Public/auth/marketing | ~7 | Ingangsroutes |

**Geen échte weesschermen gevonden** — elk pad heeft een doel. De winst zit in *consolidatie* en
*documentatie*, niet in verwijderen.

## Canonieke namespace (nieuw)

- `/overzicht` (+ `/bezittingen`, `/schulden`, `/cashflow`, `/belasting/{box1,box2,box3}`, `/tips`)
- `/toekomst` (+ `/doelen`, `/gebeurtenissen`, `/voorkeuren`, `/rekenhulp`, `/whatif`, `/bibliotheek`, reken-subpagina's)
- `/mijn` (+ `/profiel`, `/account`, `/privacy`, `/koppelingen`, `/notificaties`, `/uiterlijk`, `/geavanceerd`, `/checkins`, `/feedback`)
- Globaal: `/nieuws`, `/berichten`, `/rapportages/*`

## ⚠️ Bekende IA-drift: nieuwe namespace linkt naar legacy

De nieuwe schermen zijn **niet** zelfstandig — ze deep-linken nog naar de oude `/core`- en
`/horizon`-namespace. Voorbeelden (geverifieerd op `/overzicht/bezittingen`):

- Categorie-drilldowns → `/core/assets/{investment,retirement,eigen_huis,real_estate,vehicle}`
- "Herwaarderen" → `/core/assets/revalue`
- Budget-detail/-edit/-new → `/core/budgets/*`
- Cash-import/-connect → `/core/cash/*`
- `/horizon/*` rekenhulp-stubs → `/toekomst/*`

Daardoor zijn de `/core/*`- en `/horizon/*`-detailroutes **load-bearing** (de echte implementatie
leeft daar nog), terwijl de top-level (`/core`, `/will`, `/horizon`, `/identity`, `/dashboard`)
via `next.config.ts` redirecten naar de nieuwe namespace.

## Redirect-only stubs (kandidaat voor next.config)

Server-side `page.tsx` die louter een query-redirect doen — kunnen naar `next.config.ts` (of blijven
voor leesbaarheid):

- `/toekomst/whatif` → `/toekomst?whatif=open`
- `/toekomst/uitgaven-na-pensioen` → `/toekomst?uitgaven=open`
- `/toekomst/strategie` → `/toekomst/gebeurtenissen?strategie=…`
- `/horizon/whatif`, `/horizon/uitgaven-na-pensioen`, `/horizon/inflatie-koopkracht`, `/horizon/samengestelde-interest`
- `/dashboard` → `/overzicht`, `/core/cash` → `/overzicht/budget`

`/horizon/page.tsx` rendert nog een echte `HorizonPage` (niet in nav) — kandidaat om te redirecten
naar `/toekomst` ná controle dat geen interne link er nog op leunt.

## `/test-*` routes (~185)

Bewust aanwezig voor de in-app regressietest (`/beheer/regressietest`) en `/api/verify-*`; in
productie geblokkeerd door de proxy. **Niet verwijderen.** Optioneel later clusteren onder één
route-group (bv. `app/(test)/`) om `app/` overzichtelijker te maken — apart, gepland traject.

## Aanbevolen quick wins (laag risico)

1. Dit document onderhouden bij IA-wijzigingen.
2. Redirect-stubs hierboven naar `next.config.ts` verplaatsen (mét verificatie dat redirects
   blijven werken; geen dubbele hop introduceren).
3. `/horizon/page.tsx`-status bevestigen en zo nodig redirecten.

## Backlog (groot, eigen traject — nu NIET doen)

Volledige IA-consolidatie: de `/core/*`- en `/horizon/*`-detailroutes migreren naar de
`/overzicht/*`- resp. `/toekomst/*`-namespace en alle interne links omzetten. Risicovol (raakt
deep-links, command-palette, bookmarks); vergt eigen plan + brede verificatie.
