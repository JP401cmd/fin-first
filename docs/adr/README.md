# Architecture Decision Records (ADR's)

Korte, gedateerde notities van architectuurbesluiten en hun *waarom*. De
architectuurplaat-generator (`scripts/architecture/generate.mjs`) scant deze map
en hangt elk besluit aan de elementen in de `elements:`-frontmatter, zodat je op
`/beheer/architectuur` per element ziet welke besluiten erop rusten.

## Een ADR toevoegen

Maak `docs/adr/NNNN-korte-titel.md` met frontmatter:

```markdown
---
id: 0006-mijn-besluit
title: Korte titel van het besluit
status: aanvaard            # voorgesteld | aanvaard | vervangen | verworpen
date: 2026-06-10
elements: [as-planning, fn-toekomstplannen]   # element-id's uit archimate-model.ts
---

Eén alinea context + besluit (wordt als samenvatting op de plaat getoond).

## Context
…

## Besluit
…

## Gevolgen
…
```

De geldige element-id's staan in `lib/architecture/archimate-model.ts`
(bv. `as-planning`, `fn-toekomstplannen`, `t-supabase`, `data-cont`).
