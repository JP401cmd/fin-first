---
description: Review een pull request — dunne launcher naar de canonieke review-paden
---

Pull request(s): $ARGUMENTS (geen nummer opgegeven? vraag ernaar).

Dit command is een launcher — het eigen review-rubric is vervangen door de canonieke paden:

1. **GitHub-PR reviewen** → gebruik `/review` (ingebouwd) of de `code-review:code-review`-pluginskill met het PR-nummer.
2. **Working diff / branch zonder PR** → gebruik `/code-review`.
3. **Verdieping per domein** — zet naast de generieke review gerichte projectagents in waar de diff erom vraagt: `security-specialist` (data-toegang/auth/AI-context), `calc-engine-specialist` (rekenmotoren), `supabase-db-specialist` (migraties/RLS), `ux-review-expert` (UI).

Neem in élke PR-review de TriFinity-huisregels mee: consume-don't-recompute (geen lokale herberekening van kerngetallen, geen financiële constanten buiten `lib/constants.ts`/`lib/box3-data.ts`), RLS/ownership op nieuwe tabellen, en de architectuurplaten-sync ("laat de documentatie beter achter dan je 'm vond").
