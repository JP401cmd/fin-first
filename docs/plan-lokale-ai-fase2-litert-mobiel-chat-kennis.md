# Plan — Lokale AI fase 2: LiteRT-runtime, mobiele strategie, lokale Will-chat & kennisbank

> Status: **voorstel** (eigenaarsbesluiten 19 jul 2026 verwerkt; wacht op akkoord per fase).
> Bouwt voort op ADR 0043 (lokale categorisatie, scope A) en het runtime-onderzoek van 19 jul 2026.
> Pijplijn: elke fase doorloopt bij uitvoering de reguliere skills (spike → new-feature/extend-feature → release).

## 0. Vertrekpunt & besluiten van de eigenaar (19 jul 2026)

- Lokale categorisatie draait in productie (desktop-only, assistief, review-UI-only, fail-closed).
- **Besluit:** privé-modus = uitsluitend lokale AI; géén cloud-uitwijk, ook niet op mobiel — "dan maar geen categorisatie op dat toestel". Fail-closed uit ADR 0043 is herbevestigd.
- **Besluit:** confidence-drempel verlaagd naar **0,8** (dekking woog zwaarder na eerste live-gebruik).
- **Besluit:** akkoord op de **LiteRT-LM-JS-spike** (fase L1 hieronder).
- Onderzoek 19 jul (met bronnen): onze 6,5 tok/s is een **runtime-mismatch** (PLE-model op een niet-PLE-runtime; effectief ~5B gewichten per token door de GPU), geen model- of hardwareplafond. LiteRT-LM heeft een **JS/Web-binding (Early Preview)** met door Google gepubliceerde cijfers: 47,6 tok/s (Gemma 3n E2B, M4) / ~76 tok/s geclaimd (Gemma 4 E2B). Alle cijfers zijn Google's eigen metingen; niets is op onze GPU gemeten.

**Rode draad van dit plan:** één beslispoort (L1) ontgrendelt drie sporen. Haalt de nieuwe runtime de lat niet, dan stopt het plan goedkoop — precies zoals fase 0 destijds.

---

## Fase L1 — LiteRT-LM-JS-spike (meting 1) · ~1-2 dagen · **AKKOORD**

**Doel:** meet of LiteRT-LM JS (Web/WebGPU, Early Preview) met ons bestaande Gemma 4 E2B-model de decode-bottleneck oplost — op onze eigen hardware, met ons bestaande harnas.

- **Methode:** zelfde aanpak als fase 0 — geïsoleerde spike-map (`spikes/litert-lm/`), wegwerpcode, geen productie-imports; hermeting tegen de **bestaande tijdreis-gouden-set** (250 residu-transacties) en de **bestaande uitkomstladder** uit `docs/requirements-lokale-categorisatie.md` §2.3.
- **Metrieken:** decode tok/s + TTFT + wandklok per batch-10; **per-transactie-latentie** (de échte metric); accuracy/dekking op de gouden set (moet ≥ de Transformers.js-meting blijven — zelfde model, dus verwacht gelijk); stabiliteit ≥10 runs; downloadomvang `.litertlm`-bundel.
- **Toestellen:** (1) desktop RTX PRO 4500 (Chrome), (2) **mid-range Android Chrome** — de web-route draait óók op mobiel; dit is meteen de eerste echte mobiel-meting, (3) optioneel iPhone/Safari (verwachting: nee).
- **Kill-criteria:** JS-binding niet bruikbaar / web-bundel niet beschikbaar / crash-instabiliteit → rapport + terugval op meting 2 (WebLLM + Qwen2.5-3B, zie onderzoeksrapport) vóór er iets gebouwd wordt.
- **Uitkomstladder:**
  - Desktop ≥ ~40 tok/s én stabiel → **GO fase L2** (runtime-swap).
  - Android bruikbaar (per-tx-latentie acceptabel, eigenaar bepaalt het getal vóór de meting) → **GO fase L3** (mobiel).
  - Accuracy herbevestigd op de ladder → heropent per ADR 0043 §5 de autonomie-discussie (assistief → meer dekking).

## Fase L2 — Runtime-swap in productie · ~2-3 dagen · gated op L1-desktop-GO

- Vervang de Transformers.js-laag achter het bestaande contract: `loadModelSession`/`LocalSession.generate` blijven de seam (resolver en sheet raken niets). Model-manager: download/cache/verwijderen op de `.litertlm`-bundel; CSP-hosts herzien.
- Fase-0-mitigaties herijken: geldt batch-10 nog? Sessieherstel-vangnet blijft. Drempel 0,8 blijft (zelfde model → zelfde curve).
- Architectuur: `t-lokale-ai`-element bijwerken (runtime-naam), concern "Fragiele WebGPU-runtime" heroverwegen (mogelijk verwijderen), ADR-aanvulling op 0043.

## Fase L3 — Mobiele strategie (route: LiteRT-JS in de bestaande web-app/TWA) · ~2-4 dagen · gated op L1-Android-GO

**Bewuste keuze:** géén native app / geen native LiteRT (dat blijft de uitgestelde route D — pas als NPU-snelheid een harde eis wordt). Mobiel = dezelfde web-runtime in Chrome/TWA.

1. Capability-gate van desktop-only naar **gemeten-geschiktheid**: WebGPU + limits + (nieuw) een snelle micro-benchmark bij het aanzetten — geen aannames per toestelklasse maar een echte 10-seconden-proef.
2. Download-UX op mobiel: wifi-vereiste, opslagcheck vóór download (3+ GB op telefoons is schaars), `storage.persisted()`-status zoals op desktop.
3. Fail-closed blijft (eigenaarsbesluit): geen cloud-fallback; de meldingen (net gesplitst) zijn al toestel-eerlijk.
4. iOS: alleen als de capability-proef 't aantoont; verwachting blijft nee (bufferlimiet).

## Fase C1 — Lokale Will-chat (POC) · ~3-5 dagen POC · gated op L1-GO én een latentie-oordeel van de eigenaar

**Scope A-chat, bewust smal:** uitleg/coaching over de eigen cijfers, on-device.

- **Geen tools** (freedom-calc/lookups blijven cloud-chat); context client-side opgebouwd uit al aanwezige data (DashboardData-selectie, klein token-budget).
- **Prompt-DNA hergebruik**: base + wil-personality (single source), mét de Wft-compliance-regels prompt-side; "experimenteel — lokaal"-labeling; harde disclaimers gelijk aan cloud-Will.
- **Gate**: eigen toggle naast de categorisatie-toggle (niet stilzwijgend gekoppeld), zelfde 'ai'-tier (consistent met eigenaarsbesluit 17 jul), desktop/geschikt-toestel-gate.
- **Kwaliteitspoort vóór bouw:** 10-vragen-proefset (NL, financieel) door het lokale model in de spike; de eigenaar beoordeelt of de antwoordkwaliteit een POC rechtvaardigt. Bij twijfel: parkeren tot een groter/beter lokaal model haalbaar is.
- Streaming-UX met de gemeten tok/s eerlijk gecommuniceerd ("Will denkt lokaal na — dit is trager dan de cloud").

## Fase K1 — Kennisbank in beheer · ~1-2 dagen · onafhankelijk te bouwen, waarde vooral mét C1

**Kennisinjectie (RAG-licht), géén fine-tuning.**

- **Beheer-UI**: nieuw blok in het bestaande coach-beheerscherm-patroon (`/beheer`): kennisitems (titel, tekst, tags, actief/inactief, volgorde), opgeslagen in een eigen tabel (`local_knowledge`, admin-RLS conform ADR 0006) of `app_settings`-JSON bij <20 items.
- **Injectie**: bij de lokale chat (C1) gaan actieve items binnen een hard token-budget (~2-4k tokens, kost ~3-5s extra prefill) de systeemprompt in; selectie eerst simpel (alles-actief), later evt. trefwoord-matching per vraag.
- **Harde inhoudsregel (Wft/correctheid):** de kennisbank bevat **uitleg en begrippen** (bv. "wat is Box 3", "hoe werkt jaarruimte") — **nooit cijfers/tarieven/rekentabellen**; cijfers blijven exclusief uit de deterministische engines (`lib/constants.ts`, tax-engines). De beheer-UI vermeldt deze regel expliciet.
- Voor categorisatie voegt de kennisbank niets toe (classificatietaak) — bewust niet koppelen.

---

## Fase C2 — Lokale Will neemt de chat over (toggle-overname) · vervolgvraag eigenaar 19 jul, ná C1b-ship

**Doel:** privacy-toggle aan ⇒ niet een aparte pagina, maar **dé Will-chat** (WillHome/ChatPanel) draait lokaal — alles wat Will in het gesprek doet, on-device.

- **C2a Chat-overname · ~1 sessie:** WillHome/ChatPanel schakelt bij privacymodus naar de lokale engine via een chat-adapter — zelfde enige-omschakelpunt-principe als de categorisatie-resolver (ADR 0043). Kennisbank-injectie (K1, `selectKnowledgeForQuestion` + fencing) blijft ongewijzigd meedraaien; "experimenteel — lokaal"-labeling blijft zolang de kwaliteitskloof met cloud-Will bestaat. Fail-closed: lokaal-niet-klaar ⇒ nette melding, nooit stille cloud-fallback.
- **C2b Context-parity · GESHIPT 4 aug 2026:** één gedeelde overview-extractor zodat lokaal en cloud dezelfde cijfergrondslag lezen. De kerncijfers liepen al via `buildWillFinancialFacts`; hierbij zijn de drie ontbrekende blokken toegevoegd — **budgetten deze maand**, **gemiddelde uitgaven per categorie** en **abonnementen/vaste lasten**. Aanleiding was een echte gebruikersvraag ("kun jij mijn budgetten en transacties zien?") waarop de lokale Fin nee moest zeggen terwijl de cloud-Fin ze opsomde. Elk cijfer via een gedeelde loader: budgetten via de nieuwe `lib/ai/context/budget-summary.ts` (waar `buildKernContext` sinds deze wijziging óók uit leest — de optelling stond daarvóór alleen dáár), terugkerende lasten via `loadVasteLastenSummary`, patronen via `buildCategorySpending`. Kosten gemeten en getest: < 250 tokens voor de drie blokken samen; DNA 847/2000. **Nog steeds buiten scope:** losse transacties — die passen niet in het venster, en de DNA zegt daar nu eerlijk over dat hij ze niet ziet.

  **Versheid — eigenaarsbesluit 4 aug 2026: verversen bij het ÓPENEN, niet per beurt.** Context-parity gaat niet alleen over "welke cijfers" maar ook over "hoe vers", en daar wijkt lokaal bewust af van de cloud. De cloud-Fin bouwt zijn context per bericht; lokaal zit het overzicht ingebakken in de systeem-preface, die na beurt 1 vastligt. Een per-beurt-verversing (`/api/local-chat-live` + een ACTUELE STAND-blok) is gebouwd en op verzoek van de eigenaar weer teruggedraaid: tijdens één gesprek hoeven de cijfers niet mee te bewegen. Wat blijft: het overzicht wordt bij elke chat-opening **vers** opgehaald — `/api/local-chat-overview` staat daarom op `no-store` in plaats van de eerdere `max-age=300`, want het openen is nu het enige verversmoment. **Bewust geaccepteerd gevolg:** binnen één geopend gesprek verouderen budgetten en openstaande acties; sluiten en heropenen geeft verse cijfers.
- **C2c Voorstellen & acties · 1-2 sessies:** het lokale model geeft gestructureerde intents ("maak actie X") ⇒ expliciete bevestigings-UI ⇒ client-side write onder de eigen RLS. Bevestiging door de gebruiker is verplicht (Wft/veiligheid) — lokaal geen autonome writes.
- **C2d Tool-parity: AFGEWEZEN** ten gunste van **alles-in-context** (de extractor stopt alle relevante cijfers vooraf in de prompt). Redenen: LiteRT-LM JS heeft geen tool-API (zelfbouw JSON-protocol), en tool-orkestratie is precies waar een 2B-model onbetrouwbaar wordt (C1a). Herzien zodra een sterker lokaal model beschikbaar is.
- **Harde grens — parity van bedoeling, geen letterlijke promptkopie:** het lokale venster is 8.192 tokens; de volledige cloud-DNA + context past daar niet in, en C1a mat dat een gecondenseerde prompt dit model *beter* maakt. Zelfde regels/filosofie/cijferdiscipline, andere vorm — zie Fase P.

## Fase P — Prompt-parity: skill op aanvraag + beheer-inzicht · eigenaarsverzoek 19 jul

**P1 — skill `lokale-prompt-parity` · ~0,5-1 sessie bouwen, daarna op aanvraag te draaien.** Een pijplijn-skill die op verzoek van de eigenaar de canonieke cloud-prompts omzet naar de lokale parity-variant:

1. Bron lezen: `lib/ai/dna/*` + relevante taakprompts (single source blijft de cloud-kant).
2. Condenseren binnen het token-budget met harde invarianten: **Wft-/compliance-regels letterlijk behouden**, filosofie/toon/cijferdiscipline behouden, kennisbank-fencing intact — vorm mag krimpen, bedoeling nooit.
3. Doelbestand(en) bijwerken (`lib/ai/local/local-chat-prompt.ts`, later evt. meer) + **parity-manifest** schrijven: per lokale prompt de bronbestanden, bronhashes, datum en tokenschatting.
4. Kwaliteitspoort: prompt-tests draaien + de C1a-proefset (10 vragen incl. Wft-valstrikken); **eigenaar-review verplicht vóór ship** — promptwijziging = gedragswijziging.
5. Skill indelen in `development-model.ts` (SKILL_CURATION) — verschijnt daarmee automatisch op `/beheer/development`.

**P2 — beheer-inzicht · ~0,5-1 sessie:** blok "Prompt-parity" op `/beheer/kennisbank` (het lokale-AI-beheerhuis): per lokale prompt de bronnen, de laatste parity-run, tokenschatting t.o.v. het 8.192-budget en een **in-sync/drift-badge** (bronprompt gewijzigd sinds de laatste run ⇒ oranje "parity verlopen — draai de skill"). Feiten **gescand build-time** (`npm run parity:scan` → JSON, zelfde patroon als `arch:diagram`; runtime-fs kan niet op Vercel), betekenis gecureerd in het manifest. Registreren in `lib/beheer-sections.ts`.

---

## Volgorde & beslispoorten (samengevat)

```
L1 spike (akkoord) ──desktop-GO──► L2 runtime-swap ──► L3 mobiel (Android-GO)
        │                                   │
        │ kwaliteits-/latentie-oordeel      └──► heropening autonomie-discussie (ADR 0043 §5)
        ▼
   C1 lokale chat (POC)  ◄── K1 kennisbank (onafhankelijk bouwbaar, waarde mét C1)
        │
        └──► C2 chat-overname (C2a/C2b → C2c; C2d afgewezen) ◄── P prompt-parity (P1 skill · P2 beheer-inzicht)
```

**Risico's, eerlijk benoemd:** LiteRT-LM JS is Early Preview (API-breuk mogelijk); alle performancecijfers zijn Google's eigen; er bestaat geen NL-kwaliteitsbenchmark voor deze modelklasse — onze gouden set is de enige waarheid; C1-kwaliteit van een 2B-model voor financiële coaching is onbewezen (daarom de expliciete kwaliteitspoort).

**Kosten-samenvatting:** L1 ~1-2 d · L2 ~2-3 d · L3 ~2-4 d · C1 ~3-5 d (POC) · K1 ~1-2 d · C2a+C2b ~1,5 sessie · C2c 1-2 sessies · P1+P2 ~1-2 sessies. Elke fase apart te stoppen. Status 19 jul: L1/L2/C1/K1 geshipt, L3 geparkeerd (Adreno), C2/P gepland — nog geen bouw-akkoord.
