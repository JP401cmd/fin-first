---
id: 0066-repo-topologie-skills-op-schijf-deploy-op-push
title: 'Repo-topologie: twee repo''s naast elkaar, Claude-skills direct op schijf, deploy-op-push als releasemodel'
status: aanvaard
date: 2026-07-29
elements: [t-platform, app-comp]
---

# 0066 — Repo-topologie, skills op schijf en deploy-op-push

Org-besluiten 03, 06 en 07 (`trifinity-org/org_plan/60-besluiten.md`) in één ADR —
het eerste besluitdocument over repo-opzet en deployment-topologie.

## Context

Er was geen vastgelegde redenering over (a) waarom er twee repo's zijn, (b) waarom
skills op schijf staan in plaats van in een plugin-keten, en (c) waarom er geen
releasetrein is. Alle drie waren impliciete keuzes die over een jaar niemand meer kan
reconstrueren.

## Besluit

1. **Twee repo's, broers op schijf.** `fin-first` is het product (code, landing,
   ADR's, dagelijkse churn); `trifinity-org` is de organisatie (blueprint in
   `org_plan/`, org-site, maandelijks ritme). Feiten verwijzen, normen verhuizen:
   de blueprint verwijst naar feiten uit fin-first en bezit ze niet.
2. **Claude-skills direct op schijf in `fin-first/.claude/skills/`** — geen
   Cowork/marketplace/plugin-keten zolang er één repo en één persoon is.
   `scanClaudeTeam()` leest aantoonbaar alleen `join(ROOT, '.claude')`; uit de
   plugin-cache (`~/.claude/plugins`) scannen zou `architecture.json`
   niet-reproduceerbaar maken en het CI-determinisme breken. **Nooit uit de
   plugin-cache scannen.**
3. **Deploy-op-push blijft het releasemodel.** Vercel deployt elke push naar
   `master`; de `release`-pijplijn is de enige menselijke poort. Een wekelijkse
   releasetrein is ceremonie zonder publiek — heroverwegen bij F1 (allowlist open).

## Gevolgen

- Pushen naar `master` ís releasen. Wie een commit niet live wil, pusht niet.
- Elke nieuwe agent/skill op schijf moet gecureerd worden in
  `lib/architecture/development-model.ts`, anders valt de CI-gate om — dat is de
  bedoeling (curatie-gate).
- De plugin-keten komt pas terug als er een tweede repo of tweede persoon is; dat
  moment is een nieuw besluit, geen stille herintroductie.
