# /toekomst in drie katernen — fase 1 werkplan (checklist)

Bronnen: ADR 0179 · spec `docs/superpowers/specs/2026-09-26-toekomst-drie-katernen-design.md` §9 · structuurkaart `2026-09-26-toekomst-katernen-fase1-kaart.md` (regelnummers gelden voor `horizon-client.tsx` @ `c1b4849eb`) · kopij `…-drie-katernen-kopij.md` · vangnet `2026-09-26-toekomst-katernen-fase1-vangnet.md` (stroom T).

Eigenaarsbesluiten 26 sep: checkpoint-commit per stap **op master, per pad, nooit pushen** · scope deze ronde = fase 1 + 2 · zoveel mogelijk parallel · agents op `model: "opus"`.

## Besluiten op de open vragen (orchestrator, 26 sep)

| # | Vraag (kaart §9) | Besluit |
|---|---|---|
| Q1 | KPI-strip onder het canvas vanaf de routeswitch | **Ja.** Dat is het goedgekeurde ontwerp (ADR 0179 D4, spec §4.3) en haalt de CLS-bron boven de vouw weg. |
| Q2 | `?tab=`-guard | **`has`-regels in `next.config.ts`** (server-side, geen redirect tijdens render; les React #310). `resolveTabRedirect` vervalt in stap 18. |
| Q3 | Hash-deeplinks | Bron-hrefs omzetten (`doelen-view.tsx:260` e.a.). Plus één kleine client-hashhandler op Plan voor oude bladwijzers: `#verken-je-aannames` → `/toekomst/doelen`. `#gebeurtenissen` landt via stroom B al op Instellingen. |
| Q4 | PhaseBar aan de zoom-render-prop | **In fase 1 blijft hij in het canvas, op alle katernen.** Fase 1 = "alles werkt hetzelfde op een andere plek". Fase 2 maakt het canvas katern-afhankelijk (vaste lagen, compact, PhaseBar alleen in Plan) via een katern-context uit de layout (`useSelectedLayoutSegment`; D8: routing alleen in layout en koppen). |
| Q5 | Map overlay-host | **`components/toekomst/overlays/`** |
| Q6 | Statuspunten in fase 1 | De meldingen-hooks gaan in de provider (altijd gemount, GW3b), zodat punten niet verdwijnen bij een katernwissel. In fase 1 blijven ze in de kop (dus op alle katernen). Fase 2 verplaatst ze naar de katern-koppen. |
| Q7 | D8 en `usePathname` bij URL-opruiming | **Toegestaan.** Opruimen tegen de huidige pathname is route-onafhankelijk. D8 verbiedt vertakken óp de route, niet dit. |
| Q8 | Twee `useHorizonFireSim` op Instellingen | **Eerst meten in stap 17.** Verdringen ze elkaar, dan consumeert de view de provider (S-stap, mag). |
| Q9 | Kassabons/host: ShellOverlay of allowlist-verschuiving | **ShellOverlay** (ADR 0039). Een allowlist-entry verhuizen is groei in vermomming. Kleine chroomwijziging, visueel bewezen. |
| Q10 | Ververst de grafiek na wizard/doel vandaag? | A1 verifieert dit vóór stap 3. Klopt de hypothese, dan is het een bijvangst-defect dat stap 3 oplost: noteren in het rapport. |

## Stromen en eigenaarschap (wie mag welk bestand raken)

| Stroom | Bestanden | Status |
|---|---|---|
| B — Instellingen + routing | `components/toekomst/instellingen/**`, `app/(app)/toekomst/instellingen/**`, verwijderen `toekomst/voorkeuren` + `toekomst/gebeurtenissen` (routes), `next.config.ts`, `lib/nav-config.ts`, palette, widget-catalog, page-info, href-sweep buiten horizon/DNA | loopt |
| C — fase 2-bouwstenen | `lib/horizon/katern-copy.ts`, `components/editorial/katern-koppen.tsx`, `components/toekomst/canvas/{modus-switch,lagen-menu,aannamesregel,marktcheck-getallen}.tsx` | **klaar** `c1b4849eb` |
| T — vangnet | vangnet-doc, characterization-tests, visuele baseline in scratchpad | loopt |
| D — marktcheck-leeftijden (fase 2, §7.6) | `lib/horizon-kernel/**` (marktcheck/mc/worker), tests. **Niet** `calculations.ts` zelf: die wijziging levert D aan als patch | nieuw |
| A1 — kern stap 1–3 | **enige schrijver van `components/app/horizon/horizon-client.tsx`**, plus `scripts/check-heading-levels.mjs`, `scripts/check-client-data-reads.mjs`, `lib/architecture/calculations.ts` (r1716) | nieuw |
| X1 — Plan-bladeren (kopie) | `components/toekomst/plan/**` (nieuw) | nieuw |
| X2 — Canvas-bladeren (kopie) | `components/toekomst/canvas/**` (nieuw, **niet** de vier C-bestanden) | nieuw |
| X3 — Doelen-lab + overlay-host (kopie) | `components/toekomst/doelen/**`, `components/toekomst/overlays/**` (nieuw) | nieuw |

**Werkwijze X-stromen:** ze kopiëren blokken uit de vastgepinde bron `git show c1b4849eb:components/app/horizon/horizon-client.tsx`. Ze bewerken `horizon-client.tsx` níet. Per blok één component met props die **exact dezelfde namen** dragen als de variabelen in de parent, zodat de JSX-body byte-gelijk blijft (pure move, controleerbaar met een diff). Elk bestand krijgt een kop met `Verplaatst uit horizon-client.tsx r<van>–<tot> @ c1b4849eb`. Nieuwe bron-scan-tests pinnen dezelfde invarianten op het nieuwe bestand. Oude assertions haalt de integrator weg bij het inpluggen. Per stroom levert de X een **inplug-map**: blok → bestand → exacte JSX-aanroep met alle props.

## Checklist

- [x] 1 P dood weg (A1)
- [x] 2 S legacy Event Form weg, `?modal=life_events` → EventPane catalog (A1)
- [x] 3 S `loadData` → `router.refresh()` + props-als-bron (A1)
- [x] X1/X2/X3 kopieën klaar met inplug-map
- [x] 4 P helpers/typen (integrator, A2)
- [x] 5 P Plan-bladeren inpluggen
- [ ] 6 S-klein kassabons via ShellOverlay inpluggen
- [ ] 7 P canvas-bladeren inpluggen
- [ ] 8 P Plan-meldingen inpluggen
- [ ] 9 P Doelen-lab inpluggen
- [ ] 10 P Plan-verdieping inpluggen (`useInViewOnce` mee)
- [ ] 11 S-klein overlay-host + deeplink-effect E2
- [ ] 12 S provider (a) euro-grens
- [ ] 13 S provider (b) sim/kernel + perspectief + meldingen-hooks
- [ ] 14 S provider (c) scenario/lab + lagen
- [ ] 15 S route-groep met Plan (layout, KaternKoppen uit stroom C, navkaarten + dubbele kop weg)
- [ ] 16 S Doelen in de groep (lab mee; mount-teller-test)
- [ ] 17 S Instellingen de groep in (route van stroom B verhuist; Q8 meten)
- [ ] 18 S `has`-regels (`?tab=`, `?whatif=open`, `?modal=withdrawal|life_events`) + bestaande /toekomst-regels rechtstreeks naar het katern
- [ ] 19 P resterende hrefs in horizon/toekomst-bestanden, `PLAN_REVIEW_HREF`, briefing `validate-hrefs`
- [ ] 20 P platen (calculations/archimate/concerns/hld) + UAT (docs-keepers)
- [ ] 21 P opruimen (horizon-client-rest, nav-cards, `horizon/layout|loading`, stale allowlist-entries)
- [ ] security-specialist (schone context) · gebundelde review · visuele vergelijking met de baseline

## Git-regels voor elke stroom

`git add -- <eigen paden>` direct gevolgd door `git commit -m "…" -- <eigen paden>`. Het bericht eindigt met een lege regel en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nooit `add -A`/`.`, `stash`, `checkout --`, `reset`, `clean`, `--amend`, push. Commit alleen met 0 tsc-fouten in de eigen bestanden. Vitest alleen via PowerShell. Na een route-wijziging eerst `npx next typegen`.
