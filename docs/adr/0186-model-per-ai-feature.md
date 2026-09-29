---
id: 0186-model-per-ai-feature
title: 'Model per AI-feature, effort standaard laag, prompt-caching op de duiding'
status: aanvaard
date: 2026-09-29
elements: [t-aigateway, as-nieuws]
---

# 0186 — Model per AI-feature, effort standaard laag, prompt-caching op de duiding

## Context

Tot nu toe kende de app één globaal Anthropic-model (`ai_model_anthropic` =
Sonnet 4.5) voor élke feature. De meting over 14 dagen (tot 29 sep 2026):
de nieuws-cron (`nieuws_duiding` + `nieuws_ingest`) droeg ≈ $15 van de ≈ $16.
Twee derde daarvan was input van de duiding: ≈ 10.000 tokens per aanroep,
waarvan ≈ 10.100 een identieke systeemprompt plus schema-tool.

De eigenaar wil een sterker model voor Fin (de chat en de andere door de gebruiker
gestarte features) en goedkopere modellen voor de crons.

## Besluit

1. **Model per feature.** `getModel(supabase, feature)` leest eerst
   `ai_model_anthropic:<feature>` en valt dan terug op `ai_model_anthropic`
   (`lib/ai/model-keuze.ts`). Alleen voor de Anthropic-provider.
2. **Effort standaard `low`** op modellen die effort kennen (Sonnet 5, Opus
   4.6+, Fable). Zonder effort denkt Sonnet 5 adaptief op `high`. Instelbaar via
   `ai_effort_anthropic` en `ai_effort_anthropic:<feature>`. Een effort die de
   callsite zelf meegeeft, wint.
3. **Prompt-caching op de duiding.** De systeemprompt krijgt een
   `cacheControl`-breekpunt (5 minuten). De ingest-prompts cachen niet: ze zijn
   korter dan het cacheminimum van Haiku 4.5 (4.096 tokens).
4. **`ai_token_usage` krijgt `cache_read_tokens` en `cache_write_tokens`**
   (migratie 20261007120000). `estimateCostUsd` rekent reads tegen 0,1× en
   writes tegen 1,25× het inputtarief.

Instellingen bij livegang: globaal `claude-sonnet-5`,
`ai_model_anthropic:nieuws_ingest` = `claude-haiku-4-5`,
`ai_model_anthropic:nieuws_duiding` = `claude-sonnet-4-5-20250929`. De duiding
blijft dus op het huidige model tot een proef op de goldens en G-fixtures groen
is.

## Bewijs (live proef, 29 sep)

- Cache: de eerste duiding schreef 10.120 tokens naar de cache. De twee
  volgende lazen er 10.120 uit en betaalden nog ≈ 520 tokens volle input. De
  input per warme aanroep daalt daarmee van ≈ $0,032 naar ≈ $0,005.
- Sonnet 5 met `effort: low` en een meegegeven `temperature: 0.6`: geen fout. De
  SDK laat `temperature` met een waarschuwing vallen. Er werden 0 denktokens
  gebruikt.
- Ingest, Sonnet 4.5 vs. Haiku 4.5 op 12 echte artikelen: 11 van de 12
  categorieën zijn gelijk. Haiku vat korter samen, in één zin in plaats van
  twee à drie. Beide modellen voegen soms duiding toe die niet in de bron staat.

## Gevolgen

- De cache helpt alleen wanneer duidingen binnen 5 minuten na elkaar lopen,
  zoals nu in de cron-batch. Verschijnt `cache_read_tokens = 0` over een hele
  run, dan maakt iets de prompt ongeldig (een datum, een id of een
  catalogusvolgorde).
- Sonnet 5 telt ≈ 30 % meer tokens voor dezelfde tekst (nieuwe tokenizer). Een
  gestegen tokentelling in /beheer is dus geen regressie.
- De overrides per feature zijn nog alleen via SQL te zetten en niet te zien in
  /beheer. Verwijdert iemand de rij `ai_model_anthropic:nieuws_duiding`, dan
  valt de duiding stil terug op het globale model (open punt: een overzicht in
  /beheer/ai).
- Korte generaties kregen ruimere `maxOutputTokens` (rapport, schermtoets,
  briefing). Op Sonnet 5 tellen denktokens mee in die limiet.
- Een ander model voor de duiding blijft een besluit op grond van meting (de
  weekmeting: afwijzingen, G-codes, aandeel met samenvatting), niet van de prijs.
