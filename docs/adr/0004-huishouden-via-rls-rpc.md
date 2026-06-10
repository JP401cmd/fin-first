---
id: 0004-huishouden-via-rls-rpc
title: Huishouden-perspectieven via RLS-veilige RPC's
status: aanvaard
date: 2026-06-08
elements: [as-huishouden, t-supabase, do-huishouden]
---

Een partner ziet huishoud- en partnergegevens uitsluitend via RPC-functies met een eigendoms- en privacycheck — nooit via directe tabel-selects over de huishoudgrens.

## Context
Drie perspectieven (eigen / huishouden / partner) vereisen cross-user lezen, maar RLS verbiedt directe toegang tot andermans rijen.

## Besluit
Een write-trigger zet eigenaarschap op elke rij; perspectief-loaders lezen cross-user alleen via `SECURITY DEFINER`-RPC's die de huishoudrelatie en privacy-instelling verifiëren.

## Gevolgen
De RLS-leaktest moet groen blijven bij elke wijziging aan de huishouden- of perspectiefdienst.
