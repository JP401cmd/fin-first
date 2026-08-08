# Fiscale wijzigingslog

Wat er fiscaal verandert en wat dat raakt in de rekenkern. Bijgehouden via de skill
`.claude/skills/fiscale-wijzigingslog` — daar staat wanneer je kijkt, wat je vastlegt en
welke vier plekken in de code meebewegen.

**Voorstellen worden vastgelegd, niet verwerkt.** Alleen `aangenomen` gaat de code in;
anders rekent de app met wetgeving die er niet is. Een verwerkte wijziging krijgt een ADR
in `docs/adr/`, en dat nummer komt terug in de statuskolom.

| Datum gezien | Bron | Wat verandert | Ingangsdatum | Raakt | Status |
|---|---|---|---|---|---|
| _(nog geen wijzigingen vastgelegd)_ | | | | | |

## De stand van de rekenkern

De jaartabel `BOX3_PARAMS` in `lib/box3-data.ts` dekt op dit moment **2025 en 2026**, met
`CURRENT_TAX_YEAR = 2026`. Alles wat daarvan afhangt — de NL-FIRE-afgeleiden in
`lib/constants.ts` en de vrijstellingsdrempel in `lib/box3-taxable-input.ts` — leidt zich
uit die tabel af en hoort dat te blijven doen.

**Eerstvolgende bekende ijkpunten:** Prinsjesdag (Belastingplan volgend jaar) en het
Box 3-traject richting 2028 (werkelijk rendement).
