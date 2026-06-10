---
id: 0005-android-via-twa
title: Android-distributie via TWA (Bubblewrap)
status: aanvaard
date: 2026-05-20
elements: [t-platform]
---

De Android-app is een Trusted Web Activity (TWA) rond de PWA, gegenereerd met Bubblewrap — niet Capacitor of een full-native build.

## Context
Er was een keuze tussen TWA, Capacitor en full-native. De app is al een volwaardige PWA via Serwist.

## Besluit
TWA hergebruikt de bestaande PWA 1-op-1; `git push` blijft de releasecyclus zonder aparte native codebase.

## Gevolgen
De offline- en installeerbaarheidskwaliteit van de PWA is meteen de kwaliteit van de Android-app; platform-werk concentreert zich op de service worker.
