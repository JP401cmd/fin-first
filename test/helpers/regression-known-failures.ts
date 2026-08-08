/**
 * Bekende, nog niet opgeloste faalgevallen in de in-app regressiesuites
 * (lib/regression-tests/suites/*.ts).
 *
 * Dit is het COLUMN_RULE_RESIDUE-patroon (zie scripts/check-client-data-reads.mjs)
 * toegepast op regressietest-drift: sinds de suites nooit in CI draaiden, liep
 * een deel van de tests uit de pas met de code (bv. tests die verwijzen naar
 * routes die niet meer bestaan). Die drift oplossen is een aparte, bewuste
 * beslissing van de eigenaar — deze lijst maakt 'm ondertussen ZICHTBAAR in
 * plaats van onzichtbaar, zodat CI groen kan zijn zonder de drift te maskeren.
 *
 * ## Stand: LEEG (8 aug 2026)
 *
 * De 23 geregistreerde faalgevallen zijn opgeruimd op eigenaarsbesluit ("suite
 * groen moet weer signaal zijn"). Twintig bleken testdrift — assertie's die
 * verouderd gedrag pinden (oude IA-routes, een omgedraaide sign-conventie op
 * `one_time_cost`, een gewijzigde noodfonds-norm, hardgecodeerde allowlists) —
 * en zijn bijgewerkt naar het canonieke gedrag, waar mogelijk lezend uit de
 * bron in plaats van een tweede kopie. Drie waren GEEN drift: twee
 * componenten schonden de "geen relatieve tijdsaanduidingen"-conventie (code
 * gefixt), en `phase-mc-withdrawal-drains` dekte een echte motorbug af —
 * de succes-toets in `lib/phase-monte-carlo.ts` stond ná de clamp op nul,
 * waardoor `successRate` bij de default `targetMinPortfolio = 0` structureel
 * 1 was.
 *
 * Dat laatste is precies waarvoor deze lijst een LIJST is en geen `skip`: het
 * geval bleef zichtbaar tot iemand ernaar keek, en toen bleek het een bug in
 * een rekenmotor. Houd 'm daarom leeg — een entry hier is een schuld met een
 * naam, geen oplossing.
 *
 * Regels (zie test/helpers/regression-suite-runner.ts voor de handhaving):
 *   - Een test-id hier MOET nog steeds falen. Slaagt hij weer, dan faalt de
 *     bijbehorende *-suite-check.test.ts hard — met de melding dat de entry
 *     stale is en verwijderd moet worden. De lijst kan dus nooit stilzwijgend
 *     blijven hangen nadat iemand de onderliggende bug al gefixt heeft.
 *   - Een test-id die hier NIET in staat en toch faalt, maakt de suite-check
 *     gewoon rood — dat is een NIEUWE regressie, geen bekende drift.
 *   - Deze lijst mag alleen KRIMPEN. Voeg alleen een entry toe voor een
 *     bestaande, tot nu toe groene test die drift oploopt (bv. een verwijderde
 *     route) — nooit om een net geschreven of net gefaalde test stil te leggen.
 */
export const KNOWN_FAILING_TESTS: Map<string, string> = new Map([])
