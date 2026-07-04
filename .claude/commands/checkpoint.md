---
description: Tussentijds checkpoint-commit van samenhangend werk (géén release — daarvoor de release-skill)
---

Maak een checkpoint-commit van het huidige werk. Dit is een tussentijdse vastlegging, géén ship-gate: gaat dit werk richting master/productie, gebruik dan de `release`-skill.

1. **Inventariseer**: `git status` + `git diff --stat`. Bepaal welke bestanden bij dít samenhangende werk horen. Er kunnen parallelle sessies actief zijn — bestanden die je niet zelf hebt gewijzigd blijven buiten de commit.

2. **Stage gericht**: expliciete `git add <paden>` van alleen de bedoelde bestanden. **Nooit `git add -A` of `git add .`** — deze repo heeft eerder een git-tracked secret gehad. Twijfel je over een untracked bestand (scripts, dumps, env-achtige bestanden): niet stagen, benoemen in je rapport.

3. **Secrets-check**: geen keys/JWT's/tokens in de gestagede diff (`git diff --cached`); env-waarden horen in `.env` (untracked), placeholders in `env.example`.

4. **Commit-message in de stijl van deze repo** (check `git log -5 --oneline`): Nederlands, conventional-prefix (`feat(scope):`, `fix:`, `perf(ui):`, `checkpoint:` voor verzamelwerk), imperatief, eerste regel ≤72 tekens; body met wat + waarom. Hooks laten draaien (geen `--no-verify`). Sluit af met de standaard Claude-co-author-regels.

5. **Verifieer**: na de commit `git status` — een schone tree (voor de gestagede scope) is het bewijs dat de commit de bedoelde staat ving. Niet pushen tenzij daar expliciet om gevraagd is: push naar master is een productie-deploy.
