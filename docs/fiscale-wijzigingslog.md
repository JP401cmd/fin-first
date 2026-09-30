# Fiscale wijzigingslog

Wat er fiscaal verandert en wat dat raakt in de rekenkern. Bijgehouden via de skill
`.claude/skills/fiscale-wijzigingslog` — daar staat wanneer je kijkt, wat je vastlegt en
welke vier plekken in de code meebewegen.

**Voorstellen worden vastgelegd, niet verwerkt.** Alleen `aangenomen` gaat de code in;
anders rekent de app met wetgeving die er niet is. Een verwerkte wijziging krijgt een ADR
in `docs/adr/`, en dat nummer komt terug in de statuskolom.

| Datum gezien | Bron | Wat verandert | Ingangsdatum | Raakt | Status |
|---|---|---|---|---|---|
| 2026-09-30 | Belastingplan 2027 (Prinsjesdag 15 sep 2026), memorie van toelichting, § Parametertabellen, Tabel 1 "Overzicht IB-parameters voor belastingplichtigen jonger dan de AOW-leeftijd" (pdf-blz. 34) — [wetsvoorstel + MvT op rijksfinancien.nl](https://www.rijksfinancien.nl/sites/default/files/bestanden/belastingplan-2027/wetsvoorstel-belastingplan-2027/Wetsvoorstel-Belastingplan-2027.pdf) | Box 1 in 2027 volgens het voorstel: tarief schijf 1 36,23% (was 35,75%), tarief schijf 2 38,16% (was 37,56%), grens schijf 1 € 39.247 (was € 38.883), algemene heffingskorting maximaal € 3.154 (was € 3.115), arbeidskorting maximaal € 5.929 (was € 5.685; in de tabel "bedrag grens 3", in de sleuteltabel 2027 "Arbeidskorting: maximum"). Toptarief 49,50% en grens schijf 2 € 78.426 blijven gelijk. Bedragen geïndexeerd met de voor 48% toegepaste tabelcorrectiefactor (1,01248). | 2027-01-01 | Nog niets in de code: `BOX1_PARAMS` krijgt 2027 pas bij `aangenomen`. Kalender-entry `box1-2027-belastingplan-2027` in `lib/regelkalender.ts` | voorstel |
| 2026-09-30 | Belastingplan 2027, Fiscale sleuteltabel 2027 (pakket Belastingplan 2027, versie september 2026), Box 3, kolom "Niveau 2027" — [sleuteltabel op rijksfinancien.nl](https://www.rijksfinancien.nl/sites/default/files/bestanden/belastingplan-2027/pakket-belastingplan-2027/Fiscale-sleuteltabel-2027-incl-correctie-tarieven-energiebelasting-zelfstandigenaftrek.pdf) | Box 3 in 2027 volgens het voorstel: heffingsvrij vermogen € 60.098 per persoon (was € 59.357). Tarief 36% blijft gelijk. Het bedrag voor partners en de forfaits 2027 staan niet in de stukken en zijn niet vastgelegd. | 2027-01-01 | Nog niets in de code: `BOX3_PARAMS` krijgt 2027 pas bij `aangenomen`. Kalender-entry `box3-2027-belastingplan-2027` in `lib/regelkalender.ts` | voorstel |
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

## Regelkalender (machineleesbare tweeling)

`lib/regelkalender.ts` draagt dezelfde wijzigingen als data: per entry een mechanisme
(`box3-parameter`, `box1-parameter`, `studieschuld-rente`, `aow-leeftijd`, `eigen-risico`),
een jaar, een ingangsdatum, een status, alleen de **nieuwe** waarden (de oude is altijd de
canonieke waarde van het jaar ervóór) en een bron met url of kamerstuk. Bij studieschuld staat
er ook het stelsel bij (`sf15` of `sf35`, zoals in `DUO_RENTE_PCT`). Geen kop en geen
samenvatting: de tekst voor de lezer komt uit vaste sjablonen, niet uit de kalender.

De status betekent hetzelfde als in de tabel hierboven:

- `voorstel` — vastgelegd, niet verwerkt. Het jaar staat nog niet in de canonieke tabel.
- `aangenomen` — besloten (met besluitdatum) en daarmee klaar om de code in te gaan, maar
  nog niet in de canonieke tabel gezet.
- `verwerkt` — staat in de canonieke tabel (`BOX3_PARAMS`, `BOX1_PARAMS`, `DUO_RENTE_PCT`,
  `ZORG_EIGEN_RISICO`) en moet daar exact mee overeenkomen.

**Levensloop.** Een entry gaat van `voorstel` naar `aangenomen` naar `verwerkt`. Komt een jaar
in de canonieke tabel, dan gaat de entry **in dezelfde PR** naar `verwerkt`. Blijft hij op
`voorstel` of `aangenomen` staan, dan wordt de test rood, want het jaar staat dan dubbel.

`lib/regelkalender.test.ts` houdt drift tegen. Rood worden:

- een `verwerkt`-entry die afwijkt van de tabel;
- een `voorstel` of `aangenomen` voor een jaar dat de tabel al kent;
- een waarde die gelijk is aan die van het jaar ervóór (dat is geen wijziging);
- twee entries die voor hetzelfde mechanisme, jaar en dezelfde status dezelfde waarde vullen
  (een Belastingplan naast een losse wet mag, zolang ze elk andere waarden dragen);
- een entry waarvan de url of het kamerstuk niet in dit logbestand staat. Er wordt gezocht met
  een grens erachter: "nr. 3" telt niet als vermelding van "nr. 31".

**Bewust stil.** Kent de tabel het jaar vóór een voorstel niet (een voorstel voor 2028 terwijl
2027 nog niet verwerkt is), dan valt er niets te vergelijken. De toets op "gelijk aan vorig
jaar" zwijgt dan tot het jaar ervóór verwerkt is.

**Uitzondering: de AOW-leeftijd.** Een verschuiving van de AOW-leeftijd staat niet als waarde
in een tabel in de code. De AOW-leeftijden zijn rijen in de database (`aow_leeftijd`), en een
verschuiving is het verschil tussen twee cohorten. Voor `aow-leeftijd` gelden daarom alleen de
schema- en jaarcontrole, geen vergelijking met een tabel. Open punt voor de eigenaar: een
AOW-stap wordt vijf jaar vooruit vastgesteld, terwijl het toegestane jaarbereik nu tot 2030
loopt.

Een entry toevoegen is dus altijd twee dingen tegelijk: een rij hier, met dezelfde url of
hetzelfde kamerstuk, én de entry in de kalender.

**Wie vult hem (besluit 30 sep 2026, herziet dat van 27 sep).** De kalender is gevuld met het
Belastingplan 2027, status `voorstel`. Er staan alleen waarden in die letterlijk in een officieel
stuk op rijksfinancien.nl staan (wetsvoorstel, memorie van toelichting, bijlagen of sleuteltabel,
Miljoenennota of begroting). Niets afgeleid, niets afgerond, niets uit een nieuwsbericht; bij
twijfel blijft een waarde leeg. Niet opgenomen voor 2027, met reden:

- **Heffingsvrij vermogen partners en de box 3-forfaits** — staan niet in de stukken.
- **Eigen risico** — de begroting VWS 2027 schrijft dat het "in 2027 toeneemt naar € 400
  vanwege de indexatie", maar dat is een raming in de begroting, geen voorstel in het
  Belastingplan, en 2027 is niet besloten (zie de opmerking bij `ZORG_EIGEN_RISICO` in
  `lib/constants.ts`). Aan de eigenaar.
- **DUO-rente** — geen percentage voor 2027 in de stukken; DUO maakt het later bekend.
- **AOW-leeftijd** — de begroting SZW 2027 noemt 67 jaar en 0 maanden voor 2026 én 2027: geen
  verschuiving in 2027, en geen onderdeel van het Belastingplan.
