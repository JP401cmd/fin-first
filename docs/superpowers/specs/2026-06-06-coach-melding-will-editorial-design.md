# Ontwerp — Editorial coach-melding met levende Will (één morphende home)

**Datum:** 2026-06-06
**Status:** Goedgekeurd ontwerp (akkoord gebruiker, mits Will correct in het oppervlak meebeweegt + melding zelfstandig sluitbaar). Klaar voor implementatieplan.
**Scope:** `CoachBubble` + Will-FAB + chatvenster → unificeren tot één "WillHome"-oppervlak.

---

## 1. Doel & aanleiding

Vandaag verschijnt Will **twee keer** rechtsonder in beeld:

- de **chat-FAB** (`components/app/chat/chat-panel.tsx`, regel 838–857): ronde 56px-knop, `md:bottom-6 md:right-6`, met `<WillDots size={36} state="idle">`;
- de **CoachBubble** (`components/app/coach-bubble.tsx`): kaart in *dezelfde hoek* (`md:bottom-6 md:right-6`) met een **eigen** `<WillDots size={32} state="talking">`.

Dat voelt als "data + losse AI", niet als één personage. We willen:

1. **Eén Will.** Nooit twee avatars tegelijk in beeld.
2. **Editorial melding** in typemachine-stijl (richting A) — past bij het Editorial-Finance-designtaal en bij de typemachine-historie (geld = opgeslagen tijd, letter voor letter).
3. **Zelf-typende tekst** i.p.v. alles-ineens, met Will die **praat tijdens het typen** en **luistert erna** — dat geeft hem een ziel.
4. **Eén morphende home**: de ronde bubbel **groeit** naar de melding en kan **doorgroeien** naar het volledige chatvenster, en krimpt weer terug. Will woont in dat oppervlak en verandert enkel van grootte en plek.
5. **Niet-dwingend**: een melding is altijd zelfstandig te sluiten; de gebruiker wordt nooit gedwongen de chat te openen.

Kernfilosofie blijft: *"Geld is opgeslagen tijd."* De melding praat in vrijheids-/tijdstaal (bestaande coach-copy blijft).

---

## 2. Bestaande bouwstenen (hergebruiken)

| Bouwsteen | Locatie | Rol |
|---|---|---|
| `WillDots` | `components/app/will-dots.tsx` + `.css` | Avatar met staten `idle / talking / listening / thinking / streaming / success / error / loading`. **Talking** = gestaffelde rij-stuiter; **listening** = deinen + pulserende ring. Respecteert `prefers-reduced-motion`. |
| Coach-selectie | `lib/coach-suggestions.ts` | Pure catalogus + `getFirstUndismissedSuggestion(...)` (4 lagen: deferred > data_gap > path > default) + `parseCoachConfig`. **Blijft ongewijzigd.** |
| Coach-config | `app_settings` key `coach_config` (`/beheer/coach`) | timing (`delayMs`, `autoDismissMs`), `headerLabel`, per-regel overrides. **Blijft werken.** |
| Chat | `components/app/chat/chat-panel.tsx` + `chat-provider.tsx` | FAB + chatpaneel (AI SDK `useChat`, tools, pin-modus). `useChatContext()` levert `isOpen/open/close/toggle`. |
| Layout-mount | `app/(app)/layout.tsx` (regel 457–471) | `<ChatPanel/>` + `<CoachBubble .../>` worden hier los gemonteerd. |

**Square corners:** `--r-lg`/`--r-sm` zijn `0px`. Paper `#fbf7ec`, ink `#1a1916`, hairline `--border-ed #e3dac8`, mono = DM Mono. Modulekleuren bewust gedempt.

---

## 3. Visueel ontwerp — de melding (richting A: typemachine-strook)

```
┌─────────────────────────────────────────┐
│ BERICHT VAN WILL              (Will ►)   │  ← "platen"-regel: mono, tracking .2em,
├───────────────────────────────────────── │     uppercase, ink-3; hairline eronder;
│                                           │     Will rechtsboven (zie §5)
│  Koppel je bank, ik houd je uitgaven ▮   │  ← getypte mono-tekst, knipperende
│                                           │     blok-cursor ▮
│  · · · · · · · · · · · · · · · · · · · ·  │  ← gestippelde scheiding (border dotted)
│  → Bank koppelen                          │  ← CTA: mono, wil-kleur; verschijnt ná typen
└───────────────────────────────────────────┘   square corners, paper bg, hairline border,
                                                  schaduw --s2
```

- **Geen** regenboog-gradientbalk meer (huidige `from-wil-400 via-kern-400 to-horizon-400`).
- **Platen-regel**: het label is `headerLabel` uit de coach-config (default vandaag `"Tip van Will"`; we tonen het tracked-out uppercase). Geen aparte tweede "Tip van Will"-regel meer — het label *is* de kop.
- **Sluitknop ×** rechtsboven (mono ×, `ink-4`), los van Will.
- **Body**: één coach-suggestie (`message`), getypt. **CTA** = `cta` (+ `ctaHref` indien aanwezig), als mono-link met `→`.
- Breedte ~320px (zoals nu `max-w-sm`), responsive `w-[calc(100%-2rem)]` op mobiel.

---

## 4. Zelf-typende tekst (typewriter)

Nieuwe, herbruikbare hook `useTypewriter(text, opts)` → `{ shown, done }`.

- **Snelheid** ~28 tekens/sec, met lichte humane variatie; leestekens (`. , —`) iets trager. (Configgetal als constante, makkelijk te tunen.)
- **Cursor**: knipperend blok `▮` aan het eind tijdens typen; **verdwijnt** als `done`.
- **CTA**: pas zichtbaar (fade-in) ná `done` — niet vooraf.
- **Eén keer** per melding (geen lus). Bij re-render mag de tekst niet opnieuw typen (key op suggestion-`key`).
- **`prefers-reduced-motion`**: volledige tekst **direct** zichtbaar, geen cursor-knippering, CTA direct zichtbaar. (Hook checkt `matchMedia`, conform bestaande patronen in `lib/hooks`.)

---

## 5. Will: staten & choreografie

Will gebruikt de **echte** `WillDots`-staten (1-op-1 met de app):

| Fase | WillDots-state |
|---|---|
| in de bubbel (rust) | `idle` |
| net uit de bubbel / vóór typen | `thinking` (~400ms "componeren") |
| tijdens het typen | `talking` |
| tekst klaar | `listening` |
| in de chat (AI streamt) | `streaming` (bestaand) |

- Will **behoudt zijn FAB-grootte** (`size=36`) wanneer hij in de melding staat — **niet** verkleinen.
- Will landt **rechtsboven** in de melding (komt visueel vanuit de FAB rechtsonder omhoog).

---

## 6. De ene morphende home (state machine)

Eén oppervlak, verankerd rechtsonder, met drie visuele standen. **Will is een kind van dit oppervlak** en herpositioneert per stand (dit was de bug in de mockup: avatar hoort in het oppervlak, niet los bovenin het scherm).

```
            tip vuurt (delayMs)                 klik melding / Will
   ┌──────────────────────────────►┐   ┌───────────────────────────►┐
BUBBEL                            MELDING                          CHAT
(rond 54px,                  (vierkant ~320px,                (volledig paneel,
 Will idle,                   Will rechtsboven 36px,           Will in header,
 gecentreerd)                 typt → talking → listening)      streaming)
   ◄──────────────────────────────┘   ◄───────────────────────────┘
        × / CTA / autoDismiss              chat sluiten
   ◄───────────────────────────────────────────────────────────────┘
        (FAB-klik: bubbel ──────────────────────────────► chat)
```

**Standen & Will-plek:**

| Stand | Oppervlak | Will |
|---|---|---|
| `bubble` | rond, 54px, rechtsonder (= huidige FAB) | `idle`, gecentreerd, 36px |
| `melding` | vierkant, ~320px, gegroeid uit de hoek (origin: bottom-right) | rechtsboven, 36px, `thinking→talking→listening` |
| `chat` | volledig chatpaneel (floating: `md:h-[700px] w-[480px]`; mobiel full-screen) | in de chat-header, `idle/streaming` |

**Transities:**

| Van → Naar | Trigger |
|---|---|
| `bubble → melding` | coach-hook levert suggestie ná `delayMs`, én chat niet open, én suggestie niet eerder weggeklikt |
| `melding → bubble` | **×**, **CTA** (navigeert ook), of **autoDismiss** (`autoDismissMs`) — *zonder* chat te openen |
| `melding → chat` | klik op de melding-body of op Will (niet op × of CTA) |
| `bubble → chat` | klik op de FAB (bestaand `toggle()`), of postponed-ready auto-kickoff |
| `chat → bubble` | chat sluiten (`close()`) |

De morph: het oppervlak animeert **grootte + border-radius + positie**; de contentlagen (bubble-leeg / melding / chat) **cross-faden**; Will animeert zijn plek/grootte. Transform-origin bottom-right zodat alles "uit de hoek" groeit.

**Niet-dwingend (expliciete eis):** `melding → chat` is *één optionele* route. ×, CTA en de auto-timeout brengen Will altijd terug naar de bubbel zonder chat.

---

## 7. Architectuur

**Gekozen aanpak — `WillHome`: één morphend shell-component.** Dit matcht het mentale model ("één home die groeit") het best en garandeert structureel "één Will".

Nieuw/aangepast:

- **`components/app/will/will-home.tsx`** (nieuw, client). Eén mount in de layout (vervangt de losse `<CoachBubble/>`-mount én de FAB-rol van `ChatPanel`). Bevat:
  - state machine `mode: 'bubble' | 'melding' | 'chat'` (+ transitiestatus);
  - het animerende shell-element (grootte/radius/positie per `mode`);
  - de **enkele** `<WillDots>` met state afhankelijk van `mode`/typewriter;
  - cross-fadende contentlagen.
  - Leest/schrijft chat-open via `useChatContext()` (`chat` ⇔ `isOpen`).
- **`useCoachSuggestion()`** (nieuwe hook, geëxtraheerd uit `CoachBubble`): selectie (via `getFirstUndismissedSuggestion`), timing (`delayMs`/`autoDismiss`), dismissed-tracking (bestaande `localStorage`-keys + legacy-migratie). Levert `{ suggestion, dismiss }`. **`lib/coach-suggestions.ts` blijft ongewijzigd.**
- **`components/app/will/coach-melding.tsx`** (nieuw): presentatie van de typemachine-strook (richting A) + `useTypewriter`. Puur presentatie, props in.
- **`ChatPanel` refactor**: split in **shell** (positionering/FAB — gaat op in `WillHome`) en **content** (`<ChatContent/>`: header, messages, input, WFT-disclaimer, AI SDK-logica). `WillHome` rendert `<ChatContent/>` in `mode='chat'`. `ChatProvider`/`useChatContext` blijven.
- **`lib/hooks/use-typewriter.ts`** (nieuw), reduced-motion-aware.
- **`app/(app)/layout.tsx`**: vervang de losse `<ChatPanel/>` + `<CoachBubble/>` door één `<WillHome .../>` (zelfde props: `dataGaps`, `deferredFields`, `overrides`, `activeModules`, timing, `headerLabel`).

**Overwogen, niet gekozen — gedeelde context + FLIP-avatar** (FAB/melding/chat blijven losse DOM-nodes; een provider verplaatst één avatar tussen gemeten ankers). Lichter qua refactor, maar levert geen écht groeiend oppervlak (bubbel→melding→chat) en is fragieler (DOM-meting, FLIP). Mag als *staging-fallback* dienen als de volledige morph in implementatie te risicovol blijkt; eindbeeld blijft het morphende shell.

---

## 8. Edge cases & details

- **Chat al open wanneer tip zou vuren**: geen melding; suggestie blijft pending tot chat sluit (her-evalueren op `close`).
- **Pin-modus** (chat vastgezet in zijdebalk, 420px): geen morph; chat snapt naar pinned-layout. Melding-morph geldt alleen voor de floating chat.
- **Mobiel**: bubbel boven de bottom-nav (`bottom-[calc(var(--bottom-nav-height)+1.5rem)]`); chat = full-screen. Morph bubbel→melding klein boven de nav; melding→chat = expand naar full-screen (animatie mag vereenvoudigd worden op mobiel).
- **Postponed-ready badge** + `AiPrivacyIndicator` op de FAB blijven in de bubbel-stand bestaan.
- **Eén melding per mount** (bestaand `dismissedThisMount`-gedrag) blijft.
- **SSR/hydration**: `WillHome` is client; melding mag pas ná hydration + `delayMs`.
- **z-index/stacking**: één oppervlak (z-50) i.p.v. twee concurrerende.
- **Pad-wissel** (client-navigatie): coach her-evalueert op `pathname` (bestaand).

---

## 9. Toegankelijkheid

- `prefers-reduced-motion`: geen typewriter (tekst ineens), geen cursor-knippering, statische avatar (WillDots doet dit al), morph → simpele fade/instant.
- Melding: `role="complementary"`, `aria-label`. Tekst volledig in DOM aanwezig voor screenreaders (typewriter is puur visueel; overweeg `aria-live` uit of de volledige tekst direct in de a11y-tree).
- × heeft `aria-label="Sluiten"`; CTA is een echte link/knop (bestaand).
- Toetsenbord: melding sluitbaar met Esc; Will/melding klikbaar = ook focusbaar/Enter.

---

## 10. Testen

- **Unit**: `useTypewriter` (voortgang, done, reduced-motion → instant); `useCoachSuggestion` (selectie/dismiss/timing) — hergebruik bestaande `coach-suggestions.test.ts`-dekking.
- **Component**: `WillHome` state-machine-transities (bubble↔melding↔chat, × sluit zonder chat, CTA navigeert+sluit, autoDismiss).
- **Regressie**: bestaande coach-suite (`lib/regression-tests/suites/coach-suggestions.ts`) groen houden; chat-suite (`berichten-chat.ts`) groen houden.
- **Visueel/handmatig**: morph soepel op desktop + mobiel; één Will tegelijk; reduced-motion.
- `npx tsc --noEmit` + relevante vitest-paden.

---

## 11. Buiten scope (nu niet)

- Geluid bij typen.
- Nieuwe coach-regels/copy (catalogus blijft).
- Wijzigingen aan AI-chatlogica/tools.
- Module-aware kantlijnkleur (was een alternatief; richting A heeft geen kantlijn).

---

## 12. Open puntjes voor het plan

- Exacte morph-timings (ms) en easing per transitie.
- Will-grootte in de chat-header: 36 (continuïteit) vs bestaande 32.
- Hoe `ChatContent` netjes los te trekken zonder de AI-SDK-state te breken (volgorde van refactor-stappen).
```
