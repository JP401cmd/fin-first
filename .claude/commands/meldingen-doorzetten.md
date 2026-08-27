---
description: Zet openstaande meldingen van testgebruikers door naar Notion via de MCP (handmatige route zolang het app-token er niet is)
argument-hint: "[aantal — optioneel, default 25]"
---

Je zet de **meldingen van testgebruikers** (bug / vraag / aanbeveling) door naar de Notion-database 🧩 Trifinity. Ze staan in Supabase-tabel `public.user_reports` en wachten daar tot ze een kaartje krijgen.

## Waarom dit commando bestaat

De app duwt meldingen zelf naar Notion zodra `notion_api_token` in `app_settings` staat. Zolang dat token er níet is, blijven meldingen liggen met `notion_sync_status = 'pending'` — ze zijn niet kwijt, alleen nog niet doorgezet. Dit commando is de handmatige route: de Notion-MCP is gereedschap van Claude Code, niet van de app, dus de app kan er niet bij en jij wel.

Staat het token er wél, dan is dit commando een **vangnet**: het pakt alleen op wat de automatische route en de dagelijkse cron hebben laten liggen (`notion_page_id IS NULL`).

## Harde regels

1. **Nooit een dubbel kaartje.** Het script levert uitsluitend meldingen zónder `notion_page_id`. Schrijf na élk aangemaakt kaartje de `notion_page_id` terug vóór je aan de volgende begint — breekt de run halverwege af, dan pakt de volgende run alleen de rest.
2. **`Status` is een status-property, geen select.** `{ status: { name: 'Nieuw' } }`. Dit is de bekendste valkuil van deze database; `{ select: … }` geeft een 400.
3. **Alleen bestaande `Tags`-opties**, plus de vaste herkomst-tag `Testgebruiker`. Verzin geen zone-tags.
4. **`Prioriteit` en `Severity` lopen bij een bug bewust uiteen** — `P1` naast `S2 - medium`. Severity zegt hoe erg het defect zelf is (onbekend bij binnenkomst, dus een neutrale middenwaarde), Prioriteit zegt hoe snel we kijken (hoog, want een testgebruiker liep er in echt gebruik tegenaan). Trek ze niet gelijk "voor de consistentie"; stel bij triage liever de Severity bij.
5. **De schermafbeelding-link is kortlevend en gevoelig.** 48 uur geldig, en het is een bearer-credential: wie 'm kopieert haalt het beeld op zonder in te loggen. Plak 'm alleen in het kaartje, nergens anders — niet in de hoofdchat, niet in een samenvatting.
6. **Geen persoonsgegevens in de terminaluitvoer.** Vat samen op aantallen en titels; citeer geen omschrijvingen of e-mailadressen in de hoofdchat.
7. **Het volgnummer komt uít het script, je verzint het niet.** Elke melding krijgt van het script een veld `volgnummer` (`B-001` / `V-004` / `W-012`) — neem dat letterlijk over in de titel. Zelf tellen (of "even doortellen vanaf het vorige kaartje") loopt gegarandeerd uit de pas met de automatische route, die zijn nummer uit dezelfde telling in `lib/user-reports/notion.ts` haalt. Is `volgnummer` `null` (telling mislukt), maak het kaartje dan zónder nummer — een kaartje zonder nummer is beter dan een verkeerd nummer.
8. **Meldingen zonder inhoud gaan niet door.** Het script laat ze al weg; kom je er tóch één tegen (bv. via `--incl-leeg`), maak er dan géén kaartje van en laat de rij op `pending` staan.

## Stappen

### 1. Lees de openstaande meldingen

```
node --env-file=.env.local scripts/meldingen-openstaand.mjs --limit=$ARGUMENTS
```

Geen argument → laat `--limit` weg (default 25). Het script drukt JSON af op stdout en een telling op stderr. Levert het niets op: meld dat en stop.

Elke melding in die JSON draagt een `volgnummer` (`B-001`, `V-004`, `W-012` — bug/vraag/wens) dat je in de titel overneemt. Meldingen zonder inhoud (< 10 tekens omschrijving) laat het script weg en meldt het als aantal op stderr; noem dat aantal in je eindrapport, maar maak er geen kaartjes van. Wil je ze tóch zien: `--incl-leeg`.

### 2. Maak per melding één Notion-kaartje

Gebruik `mcp__notion__notion-create-pages` op data source `d87e54c5-fb52-4607-a72a-52e4b58ee806`. Er zijn **twee servers met dezelfde tools** (`mcp__notion__*` en `mcp__claude_ai_Notion__*`); verloopt het token van de één, val terug op de ander en gebruik daarna consequent dezelfde.

**Property-mapping — spiegelt `lib/user-reports/notion.ts` exact.** Wijkt er iets af, dan verschillen kaartjes uit de handmatige en de automatische route van elkaar; pas in dat geval beide aan.

| Notion-property | Waarde |
|---|---|
| `Feature` (titel) | `<volgnummer> · <YYYY-MM-DD>-testbug-<id6> — <scherm>` · bij vraag `testvraag`, bij aanbeveling `testwens` (die laatste zonder ` — <scherm>`). `<volgnummer>` komt kant-en-klaar uit het script (`B-001`/`V-004`/`W-012`), gevolgd door een spatie-middot-spatie; is het `null`, laat dan het hele voorvoegsel weg. Datum uit `created_at` in Europe/Amsterdam; `id6` = eerste 6 tekens van `id`. |
| `Type` (select) | bug → `Bug` · vraag → `Vraag` · aanbeveling → `Feature` |
| `Status` (status) | `Nieuw` |
| `CC-actie` (select) | `Backlog` |
| `Prioriteit` (select) | op élk kaartje — bug → `P1` · vraag → `P3` · aanbeveling → `P3` |
| `Severity` (select) | alleen bij bug: `S2 - medium` |
| `Tags` (multi_select) | `Testgebruiker` + één zone-tag uit `route`, alleen als die bestaat: `/beheer`→`BEHEER`, budget→`BUDGET`, belasting→`BELAST`, schuld→`SCHULD`, cash→`CASH`, `/toekomst`→`TOEK`, `/mijn`→`MIJN`, `/nieuws` of `/berichten`→`WILL`, `/onboarding`→`START`, `/overzicht`→`OVZ`. Geen match → alleen `Testgebruiker`. |
| `Actual result` | `description` (max ~1900 tekens) |
| `Expected result` | alleen bij bug: `expected` |
| `Steps to reproduce` | alleen bij bug: `Gemeld vanaf: <scherm> (<route>). Zie de omschrijving op de pagina.` |
| `Environment` | `<route> · app <app_version> · <viewport> · <user_agent>` |

**Pagina-body** (hier hoort de vólledige tekst, want properties kappen af):
- kop "Wat ging er mis?" / "De vraag" / "De wens" + de volledige `description`
- bij bug met `expected`: kop "Wat had de melder verwacht?" + de volledige tekst
- callout 🔎: `Toestemming inzage: JA/NEE · Melder: <email>. Informatief — dit geeft geen technische toegang tot het account; neem contact op met de melder als je meer nodig hebt.`
- kop "Technische context" + codeblok met `route`, `page_title`, `user_agent`, `viewport`, `app_version`, `id`, `created_at` — open de fence als ` ```text `, anders raadt Notion een taal (het werd `javascript`) waar de automatische route `plain text` zet
- is er een `screenshot_url`: een image-block met die URL, gevolgd door één regel "Signed link, geldig 48 uur — bron blijft Supabase (`<screenshot_path>`)."

### 3. Schrijf de koppeling terug

Direct na élk kaartje, met `mcp__supabase__execute_sql`:

```sql
UPDATE public.user_reports
SET notion_page_id = '<page-id>',
    notion_sync_status = 'synced',
    notion_last_error = NULL
WHERE id = '<report-id>';
```

### 4. Meld de uitkomst

Eén regel per melding: volgnummer, type, scherm en de kaartje-URL. Plus de telling, en — als het script er meldde — het aantal overgeslagen lege meldingen. Ging er iets mis bij een kaartje, laat de rij dan ongemoeid (`pending`) zodat een volgende run 'm oppakt, en noem het expliciet.

## Token-efficiëntie

Zijn het er meer dan ~10, delegeer de aanmaak dan aan een sub-agent die in zijn eigen context de JSON leest, de kaartjes maakt, de terugschrijf-SQL draait en alleen een compacte telling teruggeeft. Laat die sub-agent zijn werk binnen één beurt afronden — hij wordt niet automatisch hervat.
