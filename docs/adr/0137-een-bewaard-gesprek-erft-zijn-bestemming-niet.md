---
id: 0137-een-bewaard-gesprek-erft-zijn-bestemming-niet
title: 'Een bewaard gesprek erft zijn bestemming niet — de gebruiker kiest waar het landt, en lokaal blijft lokaal'
status: aanvaard
date: 2026-09-08
elements: [as-coach, do-gesprek, t-aigateway, t-lokale-ai, sp-inzicht]
---

Gesprekken met Fin leefden tot nu toe alleen in de browser: na een refresh waren
ze weg. Ze bewaren is een wens van testgebruikers (W-004), maar het is geen
gewone opslagkeuze — het is de gevoeligste vrije tekst in de app. Mensen
vertellen een financiële assistent over schulden, ontslag, scheiding en ziekte.
Dit besluit legt vast wáár die tekst mag landen, wie erbij kan, en welke regel
niet onderhandelbaar is.

## Context

Drie dingen dwongen een besluit af in plaats van een implementatiekeuze.

**De app heeft twee AI-paden.** Cloud (via `/api/ai/chat`) en on-device (via
`LocalChatTransport`). Dat tweede pad wordt verkocht met de belofte dat je
gegevens het apparaat niet verlaten; die belofte staat letterlijk op het scherm
zolang die modus aanstaat.

**Persistentie is een nieuwe verwerking, geen technisch detail.** Transacties en
saldi stonden al onder eigen-rij-RLS op de server, maar een gesprek dáárover is
vrije tekst: het bevat wat de gebruiker zélf vertelde, niet wat de app al wist.

**De eerste bouw dacht dat de databaseconstraint de belofte droeg.** Dat bleek
onwaar op één pad — zie "Wat er misging".

## Besluit

**1. De gebruiker kiest de bestemming, en die keuze is een instelling.**
`profiles.chat_history_mode` kent drie waarden: `account` (Supabase, eigen-rij
RLS), `apparaat` (IndexedDB in deze browser) en `uit`. Default is `account`: een
geschiedenis die stil verdampt bij een browserwissel is erger dan geen
geschiedenis, en de gegevens waarover het gesprek gaat stonden daar al.

**2. Lokaal blijft lokaal — die vloer ligt bóven de keuze.** Een gesprek dat via
het on-device pad is gevoerd gaat nooit naar de server, ook niet wanneer de
gebruiker `account` koos, en de gebruiker kan die vloer niet opheffen. Elders in
de app is "de gebruiker mag kiezen" het uitgangspunt; hier niet, omdat de keuze
een belofte zou ondergraven die op datzelfde scherm staat.

**3. Beheer krijgt geen inzage.** Geen service-role-leespad, geen
`/beheer`-venster, geen uitzonderingspolicy. Support gaat via wat de gebruiker
zelf deelt. Een betrokkene die zijn gegevens opvraagt krijgt ze via de
zelf-service-export; daar is geen beheerpad voor nodig.

**4. Er wordt alleen tekst bewaard.** Geen grafieken, actievoorstellen of
aanbevelingen. Die bevatten cijfers die de app elders canoniek berekent, en een
hervat gesprek zou ze bevroren naast de actuele zetten — precies de drift die
"consume, don't recompute" uitbant. Waar een kaart stond komt een neutrale regel.

**5. Een gesprek dat terugkomt uit opslag wordt opnieuw getoetst.** Zie hieronder;
dit is de regel die de eerste bouw miste.

## Wat er misging — en waarom punt 5 er staat

De eerste bouw dwong de vloer op twee plekken af: `resolveBackend()` in de
clientlaag en `CHECK (origin = 'cloud')` op de tabel. Dat lijkt dubbel, maar was
het niet.

De aanmaak-tak riep de resolver aan; de **hervat**-tak nam de opgeslagen waarden
over (`record.backend`, `record.origin`) en sloeg hem over. Een gebruiker met een
cloudgesprek die daarna op de lokale AI overstapte en dat oude gesprek hervatte,
schreef zijn on-device antwoorden alsnog naar de server — terwijl het scherm
"Draait op je toestel" toonde. De splitsregel die dit had moeten vangen kijkt
alleen naar een *verandering* van modus, en die was er niet: hij stond al lokaal.

De CHECK kon hier structureel niet helpen. `origin` staat op het gesprek en dat
gesprek was legitiem `'cloud'`; de fout zat op het niveau van de beurt. Een
constraint die één laag te hoog hangt, leest als een garantie en is er geen.

Daarom, als algemene regel: **elke invariant die bij het aanmaken wordt
afgedwongen, wordt bij het hervatten opnieuw geëvalueerd.** Een record dat
terugkomt uit opslag draagt de context van gisteren, niet die van nu.

## Gevolgen

- Twee tabellen (`chat_conversations`, `chat_messages`) met eigen-rij RLS, géén
  huishoud-deling. `chat_messages` is onveranderlijk: geen UPDATE-policy, en
  sinds de reparatieronde ook geen INSERT-recht — `append_chat_turn` is de enige
  schrijver. Een directe insert liep om de bewaargrens én om de eigenaarscheck
  heen.
- **De belofte "geen beheerinzage" wordt in de applicatielaag afgedwongen, niet
  in RLS** — een service-role omzeilt RLS per definitie. Zie
  `ADMIN_EXPORT_UITGESLOTEN` in `lib/user-data-tables.ts`. Dat is geen
  zwakkere vorm maar de enige die werkt; de plek staat in de migratiekop genoemd
  zodat belofte en code naar elkaar wijzen.
- De volgnummers van beurten komen uit de rug, nooit uit een clientteller. Een
  teller die alleen in het succespad ophoogt loopt na één afgebroken verbinding
  uit de pas, waarna volgende beurten stil op de unieke sleutel botsen en
  verdwijnen.
- `/privacy` moet deze verwerking noemen. Dat loopt via de Grenswachter-route,
  niet als kleine tekstwijziging.
- De migratie draait **vóór** de codedeploy: zonder de tabellen breekt de
  AVG-wisroute (`deleteAllUserData` gooit op een ontbrekende tabel).

## Alternatieven die afvielen

**Alleen in de browser bewaren.** Geen migratie, geen nieuw privacy-oppervlak.
Maar per apparaat apart en weg bij het legen van de browser — precies het
probleem dat de melder wilde opgelost zien.

**Alles op de server, ook de lokale gesprekken.** Eenvoudiger en overal
hetzelfde, maar het maakt de belofte van de privé-modus voorwaardelijk.

**De gebruiker de vloer laten opheffen.** Overwogen en afgewezen: de winst is
klein en het maakt van een garantie een instelling.
