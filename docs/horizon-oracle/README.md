# Horizon-oracle — structuurkennis van het Excel-oracle

Curated analyse van het Excel-oracle voor de nieuwe horizon-kernel
(FASE 0/1 van `docs/horizon-excel-oracle-plan.md`).

| | |
|---|---|
| Bronbestand | `Core calc v5.xlsm` — `C:\Users\janpa\OneDrive\Prive\Archief\` (de eigenaar bouwt het model daar; **v5 is het definitieve oracle**) |
| Geanalyseerde staat | LastWriteTime 2026-07-02 12:24:53 · 13.024.370 bytes |
| SHA256 (analyse-snapshot) | `3E905809B5CC594C98CBC60DD898135E482B7A9D05D7BCD96E16A225D42BA80D` |
| Analyse uitgevoerd | 2026-07-02 (diepteanalyse via byte-identieke snapshot) |

De fixture-extractor (`scripts/horizon-oracle/extract_fixtures.py`) hasht de bron
bij elke run en zet een warning in de fixture-meta zodra de bron afwijkt van deze
snapshot — dan kan óók deze structuurkennis verouderd zijn.

## Inhoud

| Bestand | Wat erin staat |
|---|---|
| `structuur.md` | Alle 23 tabbladen: blokken, kolommen, formule-samenvattingen, rij-conventies |
| `rekenflow.md` | Dataflow tabel→tabel, de één-maand-lag (exacte plekken), nominaal vs. reëel, waterval, tekort-lening, solver |
| `verificatie.md` | Verificaties a–h (onttrekkingsprofiel, solver-statussen, werk-strategie, AY-guard, Box3-gate, staleness-vlag, VBA, foutcellen) |
| `inputs.json` | Alle P-/TS-/bens-/Geb-/PT-/Werk-strategie-invoercellen met labels, cached waarden en keuzelijst-opties |
| `named-ranges.txt` | Defined names (alleen interne `_xlpm.*` LET-parameters; geen echte named ranges) |
| `vba.txt` | Volledige VBA-extractie (Module1: `BepaalFIRE`, `RunScenarioBand`, `RunMonteCarlo`) |

Raw-dumps (celniveau-exports van de analyse) zijn bewust **niet** opgenomen; de
machine-leesbare waarheid per scenario staat in de fixtures
(`test/fixtures/horizon-oracle/*.json.gz`).

## Samenhang

- Plan + gap-besluiten: `docs/horizon-excel-oracle-plan.md` (ADR 0032)
- Fixture-extractor + refresh-procedure: `scripts/horizon-oracle/README.md`
- Scenario-set: `scripts/horizon-oracle/scenarios.py`
- Fixtures (golden): `test/fixtures/horizon-oracle/`
