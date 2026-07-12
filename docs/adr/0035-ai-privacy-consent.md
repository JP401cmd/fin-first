---
id: 0035-ai-privacy-consent
title: AI-dataminimalisatie sanitize-in/mask-out + expliciete consent voor de pensioen-PDF
status: aanvaard
date: 2026-07-10
elements: [t-aigateway, as-coach, as-planning]
---

Elke AI-callsite minimaliseert data vóór verzending naar de provider
(`sanitizeForAI`/`sanitizeTransactions`), maskeert PII in vrije AI-tekst die
naar de gebruiker teruggaat (`maskPIIInOutput`/`maskPIIInObject`), en faalt
veilig: kan er niet gesanitized/gescreend worden, dan blokkeert de call in
plaats van rauwe data door te sturen. Voor de pensioen-PDF — een binair
document dat niet betrouwbaar te strippen is — kiezen we voor **expliciete,
gelogde AVG-consent bij upload** in plaats van een client-side extractie-ombouw.

## Context

Chat, nieuws en categorisatie volgden al het contract *"laad profiel →
`sanitizeForAI(context, {names, dateOfBirth})` fail-safe → `maskPIIInOutput`
op de output"*. Een securityreview (2 jul 2026) vond dat het contract
inconsistent werd toegepast: meerdere routes bouwden hun prompt uit rauwe
DB-velden (transactie-omschrijving, tegenpartij-naam, asset-/schuldnamen,
abonnement-namen) en stuurden die ongefilterd naar de AI-provider. Tool-results
van de chat-lookup ontstonden ná de eenmalige context-sanitize en gingen
ongefilterd terug het model in. De publish-screener faalde *open*
(`{ok:true}`), waardoor een AI-storing een rekenhulp mét persoonlijke bedragen
alsnog publiek kon maken. Bij de fiscale partner werd alleen het BSN gestript;
naam/inkomen/vermogen bleven in de tekst. De pensioen-PDF ging integraal als
base64 naar de provider.

IBAN's en persoonsnamen die de provider bereiken zijn een AVG-
dataminimalisatiebreuk. Een binaire PDF laat zich niet regex-strippen, dus daar
is dataminimalisatie technisch niet mogelijk zonder de PDF eerst client-side te
extraheren tot tekst.

## Besluit

1. **Sanitize-in op álle callsites** (routes én tool-results): de assembled
   context/lijsten door `sanitizeForAI({names, dateOfBirth})` vlak vóór de
   generatie-call, met de fail-safe uit chat (sanitize-fout → 503, nooit rauw
   door). `sanitizeForAI` strip't IBAN/BSN/e-mail/telefoon/adres + eigen/partner-
   naam; **merchant-/asset-/schuldnamen blijven** — die zijn nodig voor de
   functie en zijn zakelijke identifiers, geen persoons-PII (aanvaard residueel).
2. **Mask-out** (`maskPIIInOutput`/`maskPIIInObject`) op elke plek waar vrije
   AI-tekst naar de gebruiker teruggaat.
3. **Publish-screener fail-CLOSED**: bij AI-storing `{ok:false}` — een
   ongescreende rekenhulp wordt niet publiek.
4. **Aangifte**: naast BSN-strip ook de huishoud-namen (aanvrager + fiscale
   partner) strippen vóór verzending, met een chirurgische name-strip (níet de
   volledige `sanitizeForAI`, die aangifte-headers zou beschadigen).
5. **Pensioen-PDF (deze ADR)**: we kiezen **optie (1)** — expliciete, gelogde
   AVG-consent bij upload — boven optie (2), een client-side tekst-extractie +
   naam-strip. De consent is een verplicht veld op de upload; de route weigert
   zonder consent en logt het consent-event (user + token + tijdstip, nooit
   bestandsinhoud). De PDF wordt eenmalig verwerkt en niet gepersisteerd. De
   deterministische JSON-export van mijnpensioen.nl blijft het volledig
   client-side alternatief zonder AI.
6. **Geautomatiseerde guardrail**: een statische scan (`lib/ai/ai-callsite-scan.ts`,
   bewaakt in de `security.ai-beveiliging`-suite én een vitest-test) dwingt af
   dat elke nieuwe generatie-callsite `sanitizeForAI`/`sanitizeTransactions`
   importeert, met een expliciete, gemotiveerde allowlist.

## Gevolgen

- Consistente dataminimalisatie over alle AI-oppervlakken; nieuwe callsites
  worden door de guardrail gedwongen het contract te volgen.
- Fail-closed/fail-safe betekent dat een AI-storing functionaliteit tijdelijk
  blokkeert i.p.v. stil door te gaan — bewust, met een duidelijke melding.
- De pensioen-PDF gaat nog steeds naar de provider, maar alleen ná expliciete,
  gelogde consent. Wie dat niet wil, gebruikt de JSON-route. Een volledige
  vermijding (optie 2) blijft mogelijke toekomstige hardening.
- Allowlist-gevallen (screener = moet PII juist zien; news-enrich = server-side
  bronnen; pensioen-PDF = binair onder deze consent-ADR; aangifte = BSN+naam-
  strip upstream; rapport = alleen geaggregeerde cijfers in de prompt) zijn
  gedocumenteerd in de scan-allowlist.
