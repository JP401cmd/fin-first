# Verkenning BER-2 — één feedback-ingang?

*9 augustus 2026 · spike, geen bouw · fase 5 van `docs/eenvoudige-weergave-audit.md` · concept-ADR: `docs/adr/0096-een-feedback-ingang.md`*

**Voorstel uit de audit:** de chat-megafoon ("melden vanuit je gesprek") als enige route; `/mijn/feedback` wordt een verwijzing. Uit te werken: wat er gebeurt met `/api/feedback` en de vier categorieën.

## 1 · Wat er nu werkelijk staat (geverifieerd in de code)

Het zijn niet twee schermen op één systeem — het zijn **twee volledig gescheiden systemen**.

| | `/mijn/feedback` (oud) | Chat-megafoon (nieuw) |
|---|---|---|
| Endpoint | `POST /api/feedback` | `POST /api/user-reports` |
| Tabel | `feedback` | `user_reports` |
| Indeling | 4 categorieën: bug · idee · vraag · overig | 3 typen: bug · vraag · aanbeveling |
| Validatie | **geen zod** — rauwe `req.json()`, `slice(0, 4000)` | zod + Nederlandse foutmeldingen; scherm verplicht bij bug/vraag |
| Rem | **geen** | 5 per rollend uur, race-vrij via RPC `reserve_user_report_slot` (advisory lock) |
| Screenshot | ❌ | ✅ privé-bucket, signed URL, PNG/JPEG/WebP tot 4 MB |
| Naar het team | `/beheer/feedback` (eigen admin-inbox, `/api/admin/feedback`, status new/reviewed) | Supabase-first → best-effort push naar de Notion-werkqueue + dagelijkse retry-cron (`/beheer/jobs`) |
| In de nav | **verweesd** — alleen via ⌘K (`navigation-index.ts`) en URL; staat enkel in `EXTRA_ROUTE_TITLES` | megafoon-toggle in de chat-header, bewust **buiten alle AI-gates** |
| Op de architectuurplaat | **komt nergens voor** in `archimate-model.ts` | `as-coach` + `do-melding` + `t-notion`, en in de HLD ("Iets melden vanuit je gesprek met Fin") |

**Vier bevindingen:**

1. **De keuze is de facto al gemaakt.** `/mijn/feedback` staat niet in de navigatie (UAT WF-MIJN-28 noemt 'm letterlijk "verweesd in de nav") en niet op de architectuurplaat. Alleen ⌘K houdt 'm nog in beeld.
2. **De echte kosten liggen bij het team, niet bij de gebruiker.** Er zijn **twee inboxen**: `/beheer/feedback` (tabel `feedback`) en de Notion-werkqueue (tabel `user_reports`). Een melding kan in de ene binnenkomen terwijl er in de andere gekeken wordt.
3. **De splitsing is ooit bewust gemaakt** — de tabelcommentaar bij `user_reports` zegt het zelf: *"Bewust een eigen tabel naast public.feedback — andere levenscyclus (verlaat het systeem) en eigen syncstate."* Dat is een geldige reden om de tabellen gescheiden te houden, maar géén reden om twee *invoerschermen* te houden.
4. **De categorieën zijn niet 1-op-1.** `idee` en `overig` (oud) tegenover `aanbeveling` (nieuw). "Idee" ≈ "aanbeveling"; voor "overig" is er geen bak. Dat is de enige echte functionele delta.

## 2 · Opties

**A · Volledig afsluiten** — `/mijn/feedback` verwijderen, `/api/feedback` weg, ⌘K-item weg, tabel `feedback` na export archiveren.
*Voor:* één weg in, één inbox uit.
*Tegen:* onomkeerbaar zonder migratiepad; `/beheer/feedback` en `/api/admin/feedback` moeten mee; historische rijen verliezen hun leesvorm. De tabel staat bovendien in `lib/user-data-tables.ts` voor de AVG-export en heeft **geen eigen-rij DELETE-policy** — verwijderen raakt dus het AVG-pad.

**B · Verwijzing (het audit-voorstel)** — `/mijn/feedback` blijft bestaan als pagina die uitlegt "melden doe je vanuit je gesprek met Fin" met een knop die de chat in meldmodus opent; `/api/feedback` blijft draaien voor de historie maar krijgt geen nieuwe inzendingen; ⌘K-item wijst naar de nieuwe route.
*Voor:* één invoerweg, geen dataverlies, `/beheer/feedback` blijft de historie tonen, volledig omkeerbaar; de "overig"-categorie vervalt zachtjes.
*Tegen:* er blijft een lege huls-route staan; twee inboxen blijven bestaan tot de oude leeg is.

**C · Niets doen, alleen ⌘K opschonen** — het ⌘K-item "Feedback" naar de meldmodus laten wijzen; de pagina blijft voor wie de URL kent.
*Voor:* nul risico.
*Tegen:* lost bevinding 2 (twee inboxen) niet op; de dubbeling blijft, alleen minder zichtbaar.

## 3 · Aanbeveling

**B.** Het is precies wat de audit voorstelt, en de verificatie versterkt het: de nieuwe route is strikt beter op elk technisch punt dat telt (validatie, rem, screenshot, doorstroom naar de werkqueue, architectonisch gedocumenteerd) en de oude is al onzichtbaar. B haalt de dubbele *ingang* weg zonder de dubbele *tabel* aan te raken — dat laatste is een aparte, latere opruimactie zodra `/beheer/feedback` leeg genoeg is.

**Antwoord op de expliciete vraag van de kaart:**
- **`/api/feedback`** blijft bestaan maar wordt gesloten voor nieuwe inzendingen (voorstel: `410 Gone` met een Nederlandse tekst die naar de meldmodus wijst — een 404 zou een bug lijken). Niet verwijderen zolang `feedback`-rijen in de AVG-export zitten.
- **De vier categorieën** vervallen; `bug` → bug, `vraag` → vraag, `idee` → aanbeveling. **`overig` krijgt geen opvolger** — dat is een bewuste versmalling: een meldingstype dat niets zegt is voor triage waardeloos. Wie niets kan kiezen, kiest "vraag".

## 4 · Uitvoeringsschets (als B wordt aanvaard)

1. `/mijn/feedback` wordt een korte verwijspagina met één primaire actie die de chat in meldmodus opent; formulier + `CATEGORIES` eruit.
2. ⌘K-item "Feedback" in `lib/command-palette/navigation-index.ts` wijst naar diezelfde actie in plaats van de route.
3. `POST /api/feedback` → `410` via `lib/api/respond.ts`-vorm; `GET /api/admin/feedback` en `/beheer/feedback` blijven ongewijzigd voor de historie.
4. `lib/beheer-sections.ts`: de omschrijving van de feedback-inbox markeren als historisch archief.
5. UAT: WF-MIJN-28 herschrijven (formulier → verwijzing); WF-WILL (meldmodus) is leidend; WF-BEHEER-... aanpassen naar "historische inbox".
6. **Niet** in deze stap: tabel `feedback` verwijderen, of de AVG-export/verwijderroute aanpassen.
