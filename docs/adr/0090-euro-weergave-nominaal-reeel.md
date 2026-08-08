---
id: 0090-euro-weergave-nominaal-reeel
title: Euro-weergave "toekomstige ⇄ huidige euro's" — deflatie aan de render-grens op de kernelfactor
status: aanvaard
date: 2026-08-08
elements: [do-meta, app-comp, as-planning, fn-toekomstplannen]
---

## Context

Geprojecteerde bedragen op `/toekomst` staan in **toekomstige euro's**: de horizon-kernel rekent
nominaal-throughout (ADR 0032, Excel-oracle op maandbasis). Een vermogen van €1,2 mln op leeftijd 67
is dus niet de koopkracht van vandaag. Gebruikers willen kunnen wisselen naar **huidige euro's**.

De voor de hand liggende route — "zet inflatie op 0" — is expliciet **niet** de oplossing.
`inflationRate` is een echte engine-knop: hij werkt door in uitgaven-, salaris- en AOW-indexering,
in de Box 3-drempels, in de solver en in het doelbedrag. Inflatie 0 is een *andere simulatie*, geen
weergavekeuze; hij verschuift de FIRE-leeftijd. (ADR 0016 legde ooit het omgekeerde vast — "reëel
intern, nominaal getoond" — maar is vervangen door ADR 0032; de v2-engine die dat droeg is verwijderd.)

De canonieke deflator bestaat al, per rij, uit de kernel zelf:
`UnifiedProjectionRow.inflationFactor = (1 + inflatie)^k`, met jaar 0 exact 1.0.

Bij het uitwerken bleek een tweede probleem, en dat is de eigenlijke aanleiding om dit vast te leggen:
er bestonden **vier verschillende reëel/nominaal-mechanismen met verschillende grondslag**.
`phase-detail-table` consumeerde de kernelfactor (correct); `horizon-year-details-sheet` droeg twee
grondslagen in één bestand (een lokale `1 / (1+i)^years` naast een consumerende callsite);
`net-worth-projection-chart` draait een volledig eigen compound-projectie náást de kernel; de
sim-chart-doellijn gebruikt eigen koopkracht-factoren. Een globale deflator daaroverheen leggen zonder
sanering geeft **dubbele deflatie**, precies op de plekken waar het het minst opvalt.

## Besluit

**1. Deflatie is presentatie, geen simulatie.** De view-switch raakt engine, solver en de 735
parity-fixtures niet. Deflateren = `bedrag / row.inflationFactor` aan de **render-grens**.

**2. De factor komt ALTIJD uit de kernelrijen.** Geen enkele component berekent zijn eigen
`Math.pow(1 + i, n)` om te deflateren. Dit is de "consume, don't recompute"-regel uit CLAUDE.md
toegepast op de deflator. `lib/euro-display.ts` is het enige deflatie-gereedschap:
`deflate(value, factor, view)`, `buildFactorByAge(rows)`, `factorAtAge(rows, age)`.

**3. Elk bedrag wordt exact één keer gedeeld.** Dat is de harde invariant. Oppervlakken die zelf al
koopkracht-logica dragen worden niet nogmaals gedeflateerd maar gemarkeerd met `// euro-view: exempt`.

**4. Geen centrale `deflateUnifiedRows`-transform.** Rijen blijven nominaal tot aan de render. Een
centrale transform zou rij-interne consistentie breken (breakdowns, stacked rows moeten optellen tot
hun totaal) en garandeert niets over componenten met eigen factor-logica.

**5. De voorkeur is een scalar op de eigen profielrij** — `profiles.euro_view text not null default
'nominal' check (euro_view in ('nominal','real'))` — precies zoals `display_mode` (ADR 0026): één
globale waarde, dus scalar en geen JSONB. Server-side gelezen in de app-layout (SSR-seed, geen flash),
geschreven via `PUT /api/euro-view` als own-row update met de anon RLS-client, nooit service-role
(ADR 0058).

**6. Geen backfill** — het verschil met ADR 0026. Daar zou een kale default bestaande gebruikers
degraderen naar een ingeklapte UI, dus was een backfill naar `'full'` nodig. Hier is `'nominal'` voor
iedereen **exact het huidige beeld**; een backfill zou juist een gedragswijziging zijn.

**7. Geen lokale override.** De Nominaal/Reëel-pill in `phase-detail-table` blijft bestaan, maar is nu
een *control op de globale voorkeur*, geen eigen state. Twee bronnen naast elkaar is precies de drift
die dit besluit opheft.

**8. De badge is onzichtbaar in nominaal.** `EuroViewBadge` rendert `null` in `'nominal'`, zodat de
default byte-identiek blijft aan vandaag en geen enkel bestaand scherm ruis krijgt. In `'real'`
verschijnt hij — daar is hij noodzakelijk, want dan wijken de bedragen af van de nominale projectie.

**9. Geen `calculations.ts`-entry.** Dit is presentatie, geen rekenmotor. Wel deze ADR.

## Gevolgen

**Goed.** De vraag "wat is dit waard in geld van vandaag?" is één ⌘K-commando, cross-device. Drie
bestaande overtredingen van consume-don't-recompute zijn opgeheven. De fallback buiten een provider is
`'nominal'`, waardoor alle bestaande component-tests zonder wijziging groen blijven — meteen de
sterkste regressiegarantie die er is.

**Kosten.** Elk nieuw oppervlak met projectiebedragen moet de deflatie bewust doorvoeren; vergeten
levert een surface dat niet meebeweegt. De badge maakt dat zichtbaar in plaats van stil.

**Bewust open gelaten.** `components/core/net-worth-projection-chart.tsx` draait een eigen
compound-projectie naast de kernel. Dat is een echte grondslag-overtreding, maar een andere dan deze
kaart: hij is hier `exempt` gemarkeerd en de sanering is apart geagendeerd. Hem hier meenemen zou een
presentatie-besluit vermengen met een rekenmotor-correctie.

**Gefaseerd.** Wave 1 (dit besluit) levert de infrastructuur, de sanering en de /toekomst-fasetabel.
Wave 2 (/toekomst-oppervlakken: `horizon-client`, hero-figures, sim-chart, de 75 fase-modal-callsites)
en wave 3 (/overzicht + widgets, inclusief een contractuitbreiding op `SimRow`/`SimNetWorthRow`, die
de factor vandaag niet dragen) volgen apart. Tot dan tonen niet-omgezette oppervlakken nominaal — de
badge maakt per surface zichtbaar welke weergave geldt.

## Amendement (2026-08-08, wave 2/3 — zie ADR 0093)

Besluit 4's motivering was niet helemaal precies. Er stond dat een centrale `deflateUnifiedRows`-
transform "rij-interne consistentie breekt". Dat klopt strikt genomen niet: binnen één rij deelt elk
veld dezelfde factor, dus élke rij-*interne* identiteit (een breakdown die optelt tot zijn totaal)
blijft na een blanket-deling exact staan. Wat een centrale transform wél breekt, is iets anders:

- **kruis-rij-aggregaten** — een som of gemiddelde over méérdere jaren (de fase-kassabon-waterval,
  klasse C in ADR 0093/D1-D2) heeft geen canonieke per-jaar-deflator; deflateer je elke term met zijn
  eigen jaarfactor, dan sluit de optelling niet meer en verdwijnt het verschil in een rij die
  "afronding" heet;
- **typegelijkheid** — een gedeflateerde rij is met het type-systeem van vóór dit amendement niet te
  onderscheiden van een nominale rij, dus dubbele deflatie was onzichtbaar (opgelost door het merk-type
  `InEuroView<T>` uit ADR 0093, dat een tweede omzetting een compile-fout maakt).

Besluit 4 zelf verandert niet — er komt nog steeds geen centrale transform. Alleen de reden ervoor is
hier scherper gezet, zodat een latere lezer 'm niet op het net-niet-kloppende argument toepast.
Uitwerking voor wave 2/3 (render-grens in `horizon-client.tsx`, de twee kruis-regimes, de fase-
kassabons, het wave-3-bundelcontract, de AI-context): zie ADR 0093.
