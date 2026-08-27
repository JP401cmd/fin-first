# Fiscale wijzigingslog

Wat er fiscaal verandert en wat dat raakt in de rekenkern. Bijgehouden via de skill
`.claude/skills/fiscale-wijzigingslog` — daar staat wanneer je kijkt, wat je vastlegt en
welke vier plekken in de code meebewegen.

**Voorstellen worden vastgelegd, niet verwerkt.** Alleen `aangenomen` gaat de code in;
anders rekent de app met wetgeving die er niet is. Een verwerkte wijziging krijgt een ADR
in `docs/adr/`, en dat nummer komt terug in de statuskolom.

| Datum gezien | Bron | Wat verandert | Ingangsdatum | Raakt | Status |
|---|---|---|---|---|---|
| 2026-08-27 | Art. 5.3 lid 2 en lid 3 onder b Wet IB 2001 — bestaande wet | De Box 3-indeling week op vier punten van de wet af. Roerende zaken voor eigen gebruik (auto, sieraden, inboedel) vielen door een fall-through in het 6%-beleggingsforfait i.p.v. buiten de grondslag; een pensioenaanspraak zonder de losse `tax_benefit`-vink werd volledig als belegging belast; en een belastingschuld werd afgetrokken terwijl lid 3 onder b dat verbiedt. De schuldendrempel was al correct. | Al van kracht (achterstand, geen nieuwe wetgeving) | `lib/box3-data.ts` (`classifyAsset` als exhaustive switch, `classifyDebt`, `BOX3_UITSLUITING_REDENEN`, `BOX3_CLASSIFICATIE_NOTITIES`), `lib/box3-taxable-input.ts` (`BOX3_ASSET_TYPES` vervallen), `lib/health-score-input.ts` (`buildTaxData`), `lib/asset-data.ts` (`box3_vrijgesteld`), `components/overview/box3-detail.tsx`, migratie `20260827120000_assets_box3_vrijgesteld.sql`, regressiesuite `box3-belasting` | verwerkt · ADR 0108 |
| 2026-08-26 | Art. 2.10 lid 2 Wet IB 2001 (tariefsaanpassing aftrekbare kosten eigen woning) — bestaande wet, sinds 2014 | De hypotheekrenteaftrek werkte in de motor door tegen het schijftarief waarin hij landde (49,50%) i.p.v. het maximale aftrektarief (37,56% in 2026). De correctie ontbrak volledig; `hypotheekAftrekMaxTarief` stond al in de jaartabel maar had nul rekenconsumenten. | Al van kracht (achterstand, geen nieuwe wetgeving) | `lib/box1-tax.ts` (`computeTariefsaanpassing`, `tariefsaanpassingPct`, `hraAftrekTarief`, velden `tariefsaanpassing` + `eigenwoningBelastingEffect` op `Box1Result`), `lib/hypotheek-vs-beleggen.ts`, `components/overview/belasting/box1-eigen-woning.tsx`, `components/overview/belasting/box1-waterfall.tsx`, UAT WF-BELAST-07 | verwerkt · ADR 0106 |

## De stand van de rekenkern

De jaartabel `BOX3_PARAMS` in `lib/box3-data.ts` dekt op dit moment **2025 en 2026**, met
`CURRENT_TAX_YEAR = 2026`. Alles wat daarvan afhangt — de NL-FIRE-afgeleiden in
`lib/constants.ts` en de vrijstellingsdrempel in `lib/box3-taxable-input.ts` — leidt zich
uit die tabel af en hoort dat te blijven doen.

De jaartabel `BOX1_PARAMS` in `lib/box1-tax.ts` dekt **2025 en 2026**. Sinds ADR 0106
worden het tariefsaanpassingspercentage eigen woning (12,02% / 11,94%) en de drempel
waarboven het geldt (€ 76.817 / € 78.426) **afgeleid** uit die tabel —
`topschijftarief − hypotheekAftrekMaxTarief` en `schijven[len−2].tot`. Komt er een
belastingjaar bij, dan bewegen ze automatisch mee; er is bewust geen losse constante.

**Eerstvolgende bekende ijkpunten:** Prinsjesdag (Belastingplan volgend jaar) en het
Box 3-traject richting 2028 (werkelijk rendement).
