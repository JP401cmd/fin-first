---
id: 0111-productiecijfers-niet-in-git
title: 'Productiecijfers horen niet in git — relatief formuleren, exact meten buiten de repo'
status: aanvaard
date: 2026-08-28
elements: [app-comp, t-supabase]
---

# 0111 — Productiecijfers horen niet in git

## Context

`supabase/migrations/**` en `docs/adr/**` zijn de twee plekken waar we ons huiswerk
opschrijven. Dat is goede engineering-hygiëne: een migratie die zegt *waarom* hij
veilig is, is te reviewen; een ADR die zijn meting toont, is te controleren. Het
gaat mis op één punt — **deze repo is publiek** (`gh repo view` → `PUBLIC`), en die
metingen gaan over echte gebruikers.

De sweep van 26–28 augustus 2026 vond drie klassen, in oplopende ernst:

**A. Gegevens op recordniveau.** Een migratiecommentaar somde vier individuele
spaardoelbedragen op van vier expliciet als verschillend benoemde echte
gebruikers. Dat is geen telemetrie meer; dat zijn records. Een ADR-tabel bevatte
per productieaccount de portefeuillewaarde en het gedekte deel daarvan — dus de
vermogenspositie van vrijwel de hele gebruikersbasis, in één tabel.

<!-- productiecijfer-ok: dit ADR beschrijft de gate zelf; onderstaande termen zijn geciteerde patronen, geen meting -->
**B. Het gebruikers-/accountaantal.** Commercieel verraderlijker dan een rijaantal:
een rijaantal zegt een concurrent weinig, een gebruikersaantal zegt precies waar
het product staat. Het stond er zowel als cijfer ("N gebruikers") als uitgeschreven
("vier van de vijf productieaccounts") — die tweede vorm ontsnapt aan elke
cijferregex.

**C. Een directe identifier naast een vermogenscijfer.** `docs/adr/0027` noemde een
e-mailadres en in dezelfde zin het vermogensverschil van dat account. Een tweede
ADR gebruikte de local-part van datzelfde adres als persona-naam. Bij de eigenaar
van een publieke repo — naam, commitgeschiedenis, org-site — is dat een triviaal
identificeerbare persoon wiens vermogenspositie daarmee publiek staat.

**Waarom dit een gate wordt en geen afspraak.** De vorige schoonverklaring leunde
op "we hebben een uuid- en e-mailregex gedraaid, nul treffers". Klasse A kán die
test per constructie niet zien (bedragen zonder identifier ernaast bevatten geen
uuid en geen e-mailadres) — en klasse C werd gemíst terwijl de regex hem hoorde te
vinden. Een handmatige regex-ronde is geen controle: hij wordt één keer gedraaid,
door één persoon, en daarna geloofd. Bovendien: een eerdere opruiming van precies
dit patroon werd zeven minuten later door de volgende commit tenietgedaan.

## Besluit

**1. De norm.** Exacte productiemetingen horen in een rapport **buiten git**. In
code, migratiecommentaar en ADR's formuleer je **relatief**: "een tabel in de orde
van tienduizenden rijen", "FIRE schuift enkele jaren later", "ruim een factor zes
lager". En **nooit** gegevens op recordniveau, ook niet zonder identifier ernaast.

Het argument mag daar niet onder lijden. "De indexbouw is sub-seconde op een tabel
van tienduizenden rijen" draagt exact hetzelfde gewicht als hetzelfde met een
exact rijaantal — het getal was nooit het argument, de orde van grootte wel.

**2. Nul telt niet.** "0 conflicterende groepen", "0 rijen met `account_id IS NULL`"
zegt dat iets níét bestaat. Dat is afwezigheid, geen schaal, en het is meestal het
hele argument van de migratie. Een nul scrubben is theater en maakt de migratie
slechter leesbaar.

**3. Geen history-rewrite.** Een force-push maakt oude commits onbereikbaar, niet
weg: ze blijven via hun SHA opvraagbaar, blijven in elke fork en clone staan, en de
push-events zijn al door publieke archieven opgepikt. Er wordt bovendien vanuit
meerdere sessies tegelijk naar deze repo gepusht; een herschreven master is daar
actief schadelijk. Dus: **vooruit opruimen in een gewone commit**, en de
historische blob als geaccepteerd restrisico noteren.

**4. De gate.** `scripts/check-productiecijfers.mjs`, blokkerend in
`.husky/pre-push`, gemodelleerd op `scripts/check-client-data-reads.mjs` (inclusief
een `RESIDUE`-lijst die alléén mag krimpen: een entry die geen overtreding meer is,
laat de gate hard falen).

## Hoe de gate onderscheidt

De kern is dat **een getal op zichzelf niets zegt**. `LIMIT 1000`, "2 GB
werkgeheugen", "een batch van 250 rijen" en "twee gebruikers die dezelfde broker
gebruiken" zijn ontwerpparameters en hypothetische scenario's. Wat een getal tot
productiegegeven maakt, is de mededeling eromheen: *"gemeten op remote"*,
*"pre-flight"*, *"op het eigenaar-account"*.

Daarom vuren de omvang- en euro-regels **uitsluitend binnen een meetblok** — een
<!-- productiecijfer-ok: '12 regels' is de venstergrootte van de gate, geen productiemeting -->
venster van 12 regels ná zo'n marker. Een eerdere opzet die élk getal bij een
eenheidswoord flagde kwam op 54 treffers, waarvan de overgrote meerderheid
ontwerpparameters: precies de te-brede gate die binnen een week wordt uitgezet, en
dan minder waard is dan geen gate. Twee regels staan bewust wél altijd aan, omdat
ze geen valse positieven kennen: een **e-mailadres** en een **plat wachtwoord**.

Blijft er een geval over waarin een exact getal het argument écht draagt, dan is er
een ontsnappingsmarker mét verplichte reden:

```
-- productiecijfer-ok: <waarom dit getal hier moet staan>
<!-- productiecijfer-ok: <reden> -->
```

De marker dekt zijn eigen regel plus vier regels erna. Dat is ook de release-klep
voor de restonzuiverheid van het 12-regelsvenster: pakt het venster een blok
ontwerpparameters mee dat toevallig vlak onder een meting staat, dan zet je er een
marker met reden boven in plaats van de gate te verbreden.

## Reikwijdte — bewust nauw

Alleen `supabase/migrations/**.sql` en `docs/adr/**.md`. Dat is een scope-keuze,
**geen dekkingsbewijs**. Er staan vandaag nog echte eigenaar-cijfers en
e-mailadressen in onder meer `lib/horizon/networth-rows.test.ts`,
`scripts/horizon-oracle/**` en `specs/**`. Die paden verbreden kan, maar pas nadat
ze zijn opgeruimd — een gate die op dag één rood start, wordt genegeerd.

## Gevolgen

- Zes migraties en negen ADR's zijn relatief geherformuleerd; geen SQL, geen DDL,
  geen applicatiecode geraakt.
- De gate draait bij elke push en faalt hard op een nieuwe treffer.
- **Restrisico blijft**: de historische blobs zijn bereikbaar. Bewuste keuze (§3).
- **Openstaand, acuut en van een andere orde**:
  `supabase/migrations/20260325000002_create_landing_test_users.sql` bevat een
  gedeeld wachtwoord in platte tekst, en de vier accounts die die migratie in
  productie aanmaakte bestaan nog — bevestigd, met dat wachtwoord nog geldig en een
  aanmelding in de afgelopen week. Dat is geen schaalgegeven maar een **werkende
  inlogroute vanuit een publieke repo**. Opruimen in git helpt pas ná rotatie of
  intrekken van die accounts; dat is een productie-actie en vereist expliciete
  goedkeuring van de eigenaar. Staat tot die tijd als enige entry op de
  `RESIDUE`-lijst, die bij elke run luid wordt geprint.
