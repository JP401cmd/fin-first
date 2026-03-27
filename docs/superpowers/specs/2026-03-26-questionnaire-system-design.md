# Vragenlijst-systeem voor testfase

**Datum:** 2026-03-26
**Status:** Gevalideerd design
**Context:** Testfase — feedback verzamelen van beta-testers na het doorlopen van testscenario's

---

## Doel

Een in-app vragenlijst-systeem waarmee de superadmin meerdere vragenlijsten kan aanmaken (open vragen, schaal 1-10, meerkeuze), gebruikers deze invullen via een one-question-per-page flow, en de admin alle antwoorden kan inzien per invulling of per vraag.

## Requirements

- Admin kan meerdere vragenlijsten aanmaken, bewerken en (de)activeren
- Drie vraagtypes: open, schaal (1-10), meerkeuze
- Gebruiker ziet overzicht van alle actieve vragenlijsten
- Invullen: één vraag per pagina met voortgangsbalk
- Antwoorden worden per vraag direct opgeslagen (hervatten mogelijk)
- Gebruiker kan meerdere keren dezelfde vragenlijst invullen (nieuwe sessie)
- Bij bewerking van een vraag wordt de originele vraagtekst als snapshot bewaard bij bestaande antwoorden
- Admin kan antwoorden bekijken: toggle "per invulling" (gebruiker + datum) en "per vraag" (aggregatie)
- Waarschuwing bij >10 vragen per vragenlijst (completion rate advies)
- Geen conditionele logica, geen anonimisering, geen AI-analyse (testfase scope)

## Database schema

### Tabel `questionnaires`

| kolom | type | toelichting |
|-------|------|-------------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| title | text NOT NULL | Bijv. "Eerste indruk", "Budget feedback" |
| description | text | Optionele introductietekst |
| is_active | boolean DEFAULT true | Zichtbaar voor gebruikers |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | Auto-update trigger |

### Tabel `questionnaire_questions`

| kolom | type | toelichting |
|-------|------|-------------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| questionnaire_id | uuid FK -> questionnaires ON DELETE CASCADE | |
| sort_order | integer NOT NULL | Volgorde = paginanummer |
| type | text NOT NULL CHECK ('open', 'scale', 'multiple_choice') | |
| question_text | text NOT NULL | De vraagtekst |
| options | jsonb | Alleen voor multiple_choice: `["Optie A", "Optie B"]` |
| scale_min_label | text | Bijv. "Zeer ontevreden" (alleen bij scale) |
| scale_max_label | text | Bijv. "Zeer tevreden" (alleen bij scale) |
| is_required | boolean DEFAULT true | |
| created_at | timestamptz DEFAULT now() | |

### Tabel `questionnaire_sessions`

| kolom | type | toelichting |
|-------|------|-------------|
| id | uuid PK DEFAULT gen_random_uuid() | = session_id |
| questionnaire_id | uuid FK -> questionnaires ON DELETE CASCADE | |
| user_id | uuid FK -> auth.users ON DELETE CASCADE | |
| started_at | timestamptz DEFAULT now() | Eerste antwoord |
| completed_at | timestamptz NULL | NULL = nog bezig |

### Tabel `questionnaire_responses`

| kolom | type | toelichting |
|-------|------|-------------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| session_id | uuid FK -> questionnaire_sessions ON DELETE CASCADE | |
| question_id | uuid FK -> questionnaire_questions ON DELETE SET NULL | |
| question_text_snapshot | text NOT NULL | Bevroren vraagtekst op moment van antwoord |
| answer_text | text | Voor open vragen |
| answer_scale | integer CHECK (answer_scale >= 1 AND answer_scale <= 10) | Voor schaalvragen |
| answer_choice | text | Voor meerkeuze |
| created_at | timestamptz DEFAULT now() | |
| UNIQUE(session_id, question_id) | | Upsert-vriendelijk |

### RLS policies

- `questionnaires`: SELECT voor authenticated (WHERE is_active = true), ALL voor superadmin + service_role
- `questionnaire_questions`: SELECT voor authenticated, ALL voor superadmin + service_role
- `questionnaire_sessions`: INSERT/SELECT eigen sessies (auth.uid() = user_id), superadmin SELECT ALL
- `questionnaire_responses`: INSERT/UPDATE eigen responses (via session user_id join), superadmin SELECT ALL

### Indexes

- `idx_questionnaire_questions_questionnaire` ON questionnaire_questions(questionnaire_id, sort_order)
- `idx_questionnaire_sessions_user` ON questionnaire_sessions(user_id, questionnaire_id)
- `idx_questionnaire_responses_session` ON questionnaire_responses(session_id)

## Routes

### Gebruikerskant

| Route | Doel |
|-------|------|
| `/identity/testscenarios` | Bestaande pagina + sectie onderaan met knop "Naar vragenlijsten" |
| `/identity/testscenarios/vragenlijsten` | Overzicht actieve vragenlijsten (kaarten met voortgang) |
| `/identity/testscenarios/vragenlijsten/[id]` | Vragenlijst-flow: een vraag per pagina |

### Adminkant

| Route | Doel |
|-------|------|
| `/beheer/vragenlijsten` | Nieuwe beheer-tab. CRUD + resultaten via BottomSheets |

### API routes

| Endpoint | Methode | Auth | Doel |
|----------|---------|------|------|
| `/api/admin/questionnaires` | GET, POST | superadmin | Lijst + aanmaken |
| `/api/admin/questionnaires/[id]` | GET, PUT | superadmin | Detail + bewerken |
| `/api/admin/questionnaires/[id]/responses` | GET | superadmin | Alle responses voor admin-view |
| `/api/questionnaires` | GET | authenticated | Actieve vragenlijsten voor gebruikers |
| `/api/questionnaires/[id]/respond` | POST | authenticated | Een antwoord opslaan (upsert) |
| `/api/questionnaires/[id]/session` | GET, POST | authenticated | Open sessie ophalen of nieuwe aanmaken |

## Componenten

### Gebruikerskant

- **Testscenario's pagina (bestaand):** sectie onderaan met tekst "Hoe bevalt TriFinity? Deel je ervaring." + knop "Naar vragenlijsten" die linkt naar overzichtspagina
- **`QuestionnaireListCard`:** kaart op overzichtspagina met titel, beschrijving, voortgangsbalk ("3/8 beantwoord" of "Afgerond")
- **`QuestionPage`:** een vraag per pagina met:
  - Voortgangsbalk bovenaan ("Vraag 3 van 8")
  - Type-specifieke input: textarea (open), rij van 10 knoppen met labels (schaal), radio-buttons (meerkeuze)
  - "Vorige" / "Volgende" navigatie (laatste vraag: "Afronden")
  - Direct opslaan bij "Volgende" (POST upsert)
- **Bedankpagina:** korte tekst + link terug naar testscenario's

### Adminkant

- **`BeheerVragenlijsten`:** client component, overzichtstabel met titel, status, #vragen, #invullingen, acties
- **Vragenlijst-editor (BottomSheet full):** bewerkbare titel/beschrijving, gesorteerde vraagkaarten met type-badge, bewerkbare velden per type, omhoog/omlaag pijltjes voor volgorde, vraag toevoegen (3 type-knoppen), verwijderen, opslaan
- **Waarschuwing >10 vragen:** subtiele melding over lagere voltooiingspercentages
- **`ResponseViewer` (BottomSheet full):** toggle "Per invulling" / "Per vraag"
  - Per invulling: sessie-lijst (gebruiker + datum + voltooid/onvolledig), klik → alle antwoorden
  - Per vraag: vragenlijst, klik → alle antwoorden + gemiddelde/verdeling voor schaal/meerkeuze

## Gebruikers-flow

1. Gebruiker vinkt testscenario's af op `/identity/testscenarios`
2. Klikt op "Naar vragenlijsten" onderaan de pagina
3. Ziet overzicht van actieve vragenlijsten met eigen voortgang per lijst
4. Klikt op een vragenlijst → app checkt op open sessie
   - Open sessie gevonden → hervat bij eerste onbeantwoorde vraag
   - Geen open sessie → nieuwe sessie, begint bij vraag 1
5. Beantwoordt vragen een voor een, antwoord wordt direct opgeslagen
6. Kan terug navigeren en antwoorden wijzigen (upsert overschrijft)
7. Laatste vraag → "Afronden" → `completed_at` wordt gezet, bedankpagina getoond
8. Kan later opnieuw invullen (nieuwe sessie)

## Admin-flow

1. Navigeert naar Beheer → Vragenlijsten tab
2. Maakt nieuwe vragenlijst aan of bewerkt bestaande
3. Voegt vragen toe (open/schaal/meerkeuze), stelt volgorde in
4. Zet vragenlijst actief → zichtbaar voor gebruikers
5. Bekijkt resultaten via "Resultaten" knop → BottomSheet met twee views
6. Kan vragenlijst deactiveren om te verbergen (bestaande antwoorden blijven bewaard)

## Technische notities

- **Upsert:** Antwoord opslaan via INSERT ... ON CONFLICT (session_id, question_id) DO UPDATE
- **Snapshot:** Bij eerste INSERT wordt `question_text_snapshot` gezet vanuit huidige `question_text`. Bij UPDATE van antwoord wordt snapshot NIET bijgewerkt (blijft origineel)
- **Drag-reorder:** Omhoog/omlaag pijltjes (geen nieuwe dependency). Swap sort_order waarden
- **Beheer-nav:** Extra item in tabs-array in `beheer-nav.tsx`
- **Geen nieuwe dependencies:** Gebouwd met Next.js, Supabase, Tailwind, Lucide, BottomSheet
- **Gebruikersnaam in admin-view:** JOIN op `profiles.display_name` (of `profiles.first_name`) via `questionnaire_sessions.user_id` voor de "Per invulling" weergave
- **Nieuwe sessie na voltooiing:** GET `/api/questionnaires/[id]/session` retourneert alleen sessies zonder `completed_at`. Na voltooiing geeft GET geen sessie terug → POST maakt een nieuwe aan
- **RLS responses:** Policy op `questionnaire_responses` doet een sub-select op `questionnaire_sessions` om te checken dat `auth.uid() = user_id` van de gekoppelde sessie
- **Testfase scope:** Geen skip-logic, geen anonimisering, geen AI-analyse, geen export
