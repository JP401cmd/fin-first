# -*- coding: utf-8 -*-
"""Fixture-extractor voor het Horizon Excel-oracle (Core calc v5.xlsm).

Gebruik (vanuit de repo-root):

    py scripts/horizon-oracle/extract_fixtures.py --all
    py scripts/horizon-oracle/extract_fixtures.py --scenario basis
    py scripts/horizon-oracle/extract_fixtures.py --list

Opties:
    --source "<pad>"   bron-Excel (default: het OneDrive-origineel van de eigenaar)
    --out <map>        outputmap (default: test/fixtures/horizon-oracle)

Werking per scenario (zie ook scripts/horizon-oracle/README.md):
  1. kopieer de bron naar een tijdelijk werkbestand (de bron wordt NOOIT geopend
     of gewijzigd) en hash de kopie (SHA256 in meta; warning bij afwijking van de
     analyse-snapshot);
  2. open de kopie in een EIGEN onzichtbare Excel-instantie (DispatchEx) — nooit
     een eventueel openstaande sessie van de gebruiker;
  3. pas de TS!A23-prioriteitenfix + scenario-overrides toe (alles gelogd);
  4. draai BepaalFIRE -> RunScenarioBand -> BepaalFIRE -> RunMonteCarlo. De
     tweede BepaalFIRE is nodig omdat RunScenarioBand aan het einde P!B16 uit
     Sim!B7 herstelt; dat wijkt af voor eindstrategie 'Pensioenleeftijd' (B16
     hoort AOW te zijn, geen bisectie-uitkomst) en laat bij een onhaalbaar
     "Verwacht"-scenario een inconsistente stand achter. Een watchdog-thread
     sluit de MsgBox die BepaalFIRE toont (alleen dialogen van de eigen
     Excel-instantie, op PID gematcht);
  5. forceer CalculateFullRebuild + Calculate tot de uitkomsten stabiel zijn;
  6. verifieer Controle!K1 ("OK ..."), TS!A23 (geen FOUT) en stale-detector
     P!B95 (bij een "draai opnieuw"-hint: BepaalFIRE nogmaals draaien; laat
     herdraaien P!B16/P!B38 exact ongewijzigd dan is de solver aantoonbaar
     vers/idempotent en is de hint een vals alarm van de 5%-van-doel-drempel
     (doel=0-degeneratie bij deplete/pensioen, of een maand-granulariteits-
     restant op een lange horizon) -> warning; blijft de stand veranderen
     terwijl de hint aanhoudt -> hard error);
  7. lees per sheet de volledige used range in EEN bulk-call (alle sheets
     behalve 'Toelichting model') en schrijf <scenario>.json.gz.
"""
from __future__ import annotations

import argparse
import ctypes
import datetime as dt
import decimal
import gc
import gzip
import hashlib
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import traceback
from ctypes import wintypes

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenarios import SCENARIOS, SKIPPED_SCENARIOS, get_scenario, get_skipped  # noqa: E402

try:
    import pythoncom  # noqa: E402
    import pywintypes  # noqa: E402
    import win32com.client  # noqa: E402
except ImportError:
    print(
        "pywin32 ontbreekt — installeer met: py -m pip install --user pywin32",
        file=sys.stderr,
    )
    raise

FIXTURE_VERSION = 1
DEFAULT_SOURCE = r"C:\Users\janpa\OneDrive\Prive\Archief\Core calc v5.xlsm"
DEFAULT_OUT = os.path.join("test", "fixtures", "horizon-oracle")
# SHA256 van de analyse-snapshot (12:24, 2026-07-02) waarop de structuurkennis
# in docs/horizon-oracle/ is gebaseerd. Afwijking = informatieve warning.
ANALYSIS_SNAPSHOT_SHA256 = "3E905809B5CC594C98CBC60DD898135E482B7A9D05D7BCD96E16A225D42BA80D"

SKIP_SHEETS = {"Toelichting model"}
XL_CALCULATION_MANUAL = -4135
MSO_AUTOMATION_SECURITY_LOW = 1
MAX_STABILIZE_ITERS = 8

# Excel cached-error-codes zoals pywin32 ze teruggeeft (VT_ERROR -> int).
ERROR_CODES = {
    -2146826288: "#NULL!",
    -2146826281: "#DIV/0!",
    -2146826273: "#VALUE!",
    -2146826265: "#REF!",
    -2146826259: "#NAME?",
    -2146826252: "#NUM!",
    -2146826246: "#N/A",
    -2146826245: "#GETTING_DATA",
}


class ExtractError(RuntimeError):
    pass


def log(msg: str) -> None:
    print(f"[{dt.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Win32: MsgBox-watchdog (BepaalFIRE eindigt met een modale MsgBox)
# ---------------------------------------------------------------------------
_user32 = ctypes.windll.user32
_user32.FindWindowExW.restype = ctypes.c_void_p
_user32.FindWindowExW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_wchar_p]
_user32.GetWindowThreadProcessId.restype = wintypes.DWORD
_user32.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD)]
_user32.GetWindowTextW.restype = ctypes.c_int
_user32.GetWindowTextW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int]
_user32.PostMessageW.restype = ctypes.c_int
_user32.PostMessageW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
WM_CLOSE = 0x0010


def _window_pid(hwnd) -> int:
    pid = wintypes.DWORD(0)
    _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return pid.value


class MsgBoxCloser(threading.Thread):
    """Sluit modale dialoogvensters (#32770) van de EIGEN Excel-instantie (PID-match).

    BepaalFIRE toont per run een MsgBox ("FIRE-solver"); zonder watchdog blokkeert
    Application.Run daarop voor onbepaalde tijd. Dialogen van andere processen
    (bv. een open Excel-sessie van de gebruiker) worden met rust gelaten.
    """

    def __init__(self, excel_pid: int):
        super().__init__(daemon=True)
        self._excel_pid = excel_pid
        self._stop = threading.Event()
        self._seen: set = set()
        self.closed_titles: list = []

    def run(self) -> None:
        while not self._stop.is_set():
            hwnd = None
            while True:
                hwnd = _user32.FindWindowExW(None, hwnd, "#32770", None)
                if not hwnd:
                    break
                if _window_pid(hwnd) != self._excel_pid:
                    continue
                buf = ctypes.create_unicode_buffer(512)
                _user32.GetWindowTextW(hwnd, buf, 512)
                if hwnd not in self._seen:
                    self._seen.add(hwnd)
                    self.closed_titles.append(buf.value)
                _user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
            self._stop.wait(0.2)

    def stop(self) -> None:
        self._stop.set()


_kernel32 = ctypes.windll.kernel32
_kernel32.OpenProcess.restype = ctypes.c_void_p
_kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
_kernel32.GetExitCodeProcess.restype = wintypes.BOOL
_kernel32.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD)]
_kernel32.TerminateProcess.restype = wintypes.BOOL
_kernel32.TerminateProcess.argtypes = [ctypes.c_void_p, ctypes.c_uint]
_kernel32.CloseHandle.argtypes = [ctypes.c_void_p]

_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
_PROCESS_TERMINATE = 0x0001
_STILL_ACTIVE = 259


def _excel_alive(pid: int) -> bool:
    h = _kernel32.OpenProcess(_PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h:
        return False
    code = wintypes.DWORD(0)
    alive = bool(_kernel32.GetExitCodeProcess(h, ctypes.byref(code))) and code.value == _STILL_ACTIVE
    _kernel32.CloseHandle(h)
    return alive


def _ensure_excel_dead(pid: int) -> None:
    """Wacht kort op nette afsluiting na Quit; beeindig het proces anders geforceerd.

    In de praktijk blijft de onzichtbare instantie na wb.Close(False) + app.Quit()
    soms als leeg proces hangen (het werkbestand is dan al losgelaten). Het is
    onze eigen DispatchEx-instantie zonder onopgeslagen werk, dus geforceerd
    beeindigen is veilig — zo lekken refresh-runs geen Excel-processen (~375 MB
    per stuk). PID-hergebruik binnen de gratieperiode is verwaarloosbaar.
    """
    for _ in range(6):  # ~3 s gratie voor een nette exit
        if not _excel_alive(pid):
            return
        time.sleep(0.5)
    h = _kernel32.OpenProcess(_PROCESS_TERMINATE, False, pid)
    if h:
        _kernel32.TerminateProcess(h, 1)
        _kernel32.CloseHandle(h)
        log(f"  Excel-proces {pid} negeerde Quit -> geforceerd beeindigd")


# ---------------------------------------------------------------------------
# Waarde-conversie -> JSON-schema (null / bool / getal(1e-6) / string / ISO-datum)
# ---------------------------------------------------------------------------
def convert_value(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, float):
        if v != v:  # NaN
            return None
        r = round(v, 6)
        if r == 0:
            return 0
        if float(r).is_integer() and abs(r) < 9007199254740992.0:
            return int(r)
        return r
    if isinstance(v, int):
        if v in ERROR_CODES:
            return ERROR_CODES[v]
        if -2147000000 < v <= -2146820000:
            return f"#ERROR({v})"
        return v
    if isinstance(v, str):
        return v
    if isinstance(v, decimal.Decimal):
        return convert_value(float(v))
    if hasattr(v, "isoformat"):  # pywintypes datetime
        return v.isoformat()
    return str(v)


def col_letter(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().upper()


# ---------------------------------------------------------------------------
# Excel-hulpjes
# ---------------------------------------------------------------------------
def run_macro(app, wb, name: str) -> None:
    """Draai een macro; probeer bij een 'macro niet gevonden'-fout gekwalificeerde namen."""
    try:
        app.Run(name)
        return
    except pywintypes.com_error as exc:
        text = str(exc).lower()
        if "macro" not in text:
            raise
        last = exc
    for target in (f"{wb.Name}!{name}", f"Module1.{name}"):
        try:
            app.Run(target)
            return
        except pywintypes.com_error as exc:
            last = exc
    raise ExtractError(f"Macro '{name}' kon niet worden gedraaid: {last}")


def read_probes(wb):
    ws_p = wb.Worksheets("P")
    return (
        ws_p.Range("B16").Value,
        ws_p.Range("B37").Value,
        ws_p.Range("B38").Value,
        wb.Worksheets("Controle").Range("K2").Value,
        wb.Worksheets("Prognose").Range("J1201").Value,
    )


def stabilize(app, wb, warnings: list) -> None:
    """CalculateFullRebuild + Calculate tot de peilcellen twee runs gelijk zijn."""
    app.CalculateFullRebuild()
    prev = read_probes(wb)
    for _ in range(MAX_STABILIZE_ITERS):
        app.Calculate()
        cur = read_probes(wb)
        if cur == prev:
            return
        prev = cur
    warnings.append(
        f"Berekening niet aantoonbaar stabiel na {MAX_STABILIZE_ITERS} Calculate-iteraties (peilcellen bleven wijzigen)"
    )


def apply_overrides(wb, overrides: list, overrides_log: list) -> None:
    for ov in overrides:
        sheet, addr = ov["cell"].split("!", 1)
        ws = wb.Worksheets(sheet)
        rng = ws.Range(addr)
        before = rng.Value
        rng.Value = ov["value"]
        after = rng.Value
        if isinstance(ov["value"], (int, float)) and isinstance(after, (int, float)):
            ok = abs(float(after) - float(ov["value"])) <= 1e-9 * max(1.0, abs(float(ov["value"])))
        else:
            ok = after == ov["value"]
        if not ok:
            raise ExtractError(f"Override {ov['cell']} niet aangekomen: geschreven {ov['value']!r}, teruggelezen {after!r}")
        log(f"  override {ov['cell']}: {before!r} -> {ov['value']!r} ({ov['reason']})")
        overrides_log.append({"cell": ov["cell"], "value": ov["value"], "reason": ov["reason"]})


def apply_ts_fix(app, wb, overrides_log: list, warnings: list) -> None:
    """TS!A23-fix: zet ontbrekende toename-prioriteiten (Consumptief + Studie) als input.

    De mapping-matrix 'toename schulden' staat op TS!C40:G44 met kolom D = strategie
    'gelijk verdelen over bezittingen' (de actieve toename-strategie P!B28). De rijen
    worden op label gezocht (geen posities gokken). Prio >= 6 betekent in het model
    'nooit meedoen' (gewicht 0) — gelijk aan het cached gedrag zonder prio en
    consistent met de strategienaam 'over bezittingen'; als de prioriteiten-controle
    dat niet accepteert wordt prio 5 (reserve) geprobeerd.
    """
    ws = wb.Worksheets("TS")
    a23 = ws.Range("A23").Value
    if not (isinstance(a23, str) and a23.strip().upper().startswith("FOUT")):
        warnings.append(f"TS!A23-fix niet nodig: A23 meldde geen FOUT (waarde: {a23!r})")
        return

    targets = {}
    for row in range(38, 47):
        for col in (1, 2):  # kolom A en B: waar de categorie-labels van de matrix staan
            v = ws.Cells(row, col).Value
            if isinstance(v, str):
                lv = v.strip().lower()
                if lv.startswith("consumptief"):
                    targets["Consumptief"] = row
                elif lv.startswith("studie"):
                    targets["Studie"] = row
    if set(targets.keys()) != {"Consumptief", "Studie"} or targets["Consumptief"] == targets["Studie"]:
        raise ExtractError(
            f"TS!A23-fix: kon de rijen voor Consumptief/Studie niet eenduidig vinden in TS rij 38-46 (gevonden: {targets})"
        )

    for prio in (6, 5):
        for row in targets.values():
            ws.Cells(row, 4).Value = prio  # kolom D = 'gelijk verdelen over bezittingen'
        app.Calculate()
        a23_after = ws.Range("A23").Value
        if not (isinstance(a23_after, str) and a23_after.strip().upper().startswith("FOUT")):
            for cat, row in sorted(targets.items(), key=lambda kv: kv[1]):
                entry = {
                    "cell": f"TS!D{row}",
                    "value": prio,
                    "reason": (
                        f"TS!A23-fix — {cat} had geen toename-prioriteit onder 'gelijk verdelen over "
                        f"bezittingen'; prio {prio} houdt de schuld-categorie buiten de toename-waterval "
                        f"(gewicht 0), gelijk aan het cached gedrag"
                    ),
                }
                log(f"  override {entry['cell']}: -> {prio} (TS!A23-fix, {cat})")
                overrides_log.append(entry)
            return
    raise ExtractError(f"TS!A23-fix faalt: A23 blijft een FOUT melden na prio 6 en 5 ({a23_after!r})")


def read_solver_block(wb):
    ws_p = wb.Worksheets("P")
    raw = ws_p.Range("B93:B100").Value
    flat = [row[0] for row in raw]
    keys = ["B93", "B94", "B95", "B96", "B97", "B98", "B99", "B100"]
    return dict(zip(keys, flat))


def is_stale_text(v) -> bool:
    return isinstance(v, str) and "draai" in v.lower()


def solver_state(wb):
    """(P!B16, P!B38) — de cellen die BepaalFIRE bepaalt; meetlat voor idempotentie."""
    ws_p = wb.Worksheets("P")
    return (ws_p.Range("B16").Value, ws_p.Range("B38").Value)


def states_equal(a, b) -> bool:
    for x, y in zip(a, b):
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            if abs(float(x) - float(y)) > 1e-6:
                return False
        elif x != y:
            return False
    return True


def resolve_staleness(app, wb, macros_run: list, warnings: list):
    """Stale-detector P!B95 afhandelen.

    "Draai opnieuw"-hint -> BepaalFIRE nogmaals draaien. Laat herdraaien de
    solver-stand (P!B16/P!B38) exact ongewijzigd, dan is de solver aantoonbaar
    vers (de bisectie is deterministisch en idempotent) en is de aanhoudende
    hint een vals alarm van de 5%-van-doel-drempel: bij doelbedrag 0
    (deplete/pensioen) degenereert de drempel tot 0, en op lange horizonnen
    kan het maand-granulariteits-restant in de gap boven 5% van het doel
    uitkomen (een maand extra sparen rendeert tientallen jaren door). Blijft
    de stand veranderen terwijl de hint aanhoudt -> echte staleness -> error.
    Retourneert het verse solver-blok (B93..B100).
    """
    solver = read_solver_block(wb)
    if not is_stale_text(solver["B95"]):
        return solver
    for attempt in range(1, 4):
        before = solver_state(wb)
        log(f"  stale-detector actief ({solver['B95']!r}) -> BepaalFIRE opnieuw (poging {attempt})")
        run_macro(app, wb, "BepaalFIRE")
        macros_run.append("BepaalFIRE")
        stabilize(app, wb, warnings)
        solver = read_solver_block(wb)
        if not is_stale_text(solver["B95"]):
            return solver
        after = solver_state(wb)
        if states_equal(before, after):
            ws_p = wb.Worksheets("P")
            doel = ws_p.Range("B36").Value
            gap_v = ws_p.Range("B38").Value
            doel_f = float(doel) if isinstance(doel, (int, float)) else 0.0
            if abs(doel_f) < 0.005:
                detail = (
                    "het doelbedrag P!B36 is 0 (eindstrategie zonder doelvermogen), waardoor de "
                    "5%-van-doel-drempel degenereert tot 0 en elk granulariteits-restant als 'stale' wordt gemeld"
                )
            else:
                gap_f = float(gap_v) if isinstance(gap_v, (int, float)) else 0.0
                detail = (
                    f"de gap (EUR {gap_f:,.2f} = {100.0 * gap_f / doel_f:.1f}% van doel EUR {doel_f:,.2f}) is het "
                    "maand-granulariteits-restant van de bisectie en overschrijdt de 5%-van-doel-drempel"
                )
            warnings.append(
                f"Stale-detector P!B95 blijft aan ({solver['B95']}), maar de solver is aantoonbaar vers: "
                f"BepaalFIRE opnieuw draaien laat P!B16/P!B38 exact ongewijzigd (idempotent); {detail}. "
                "Vals alarm van de detector, geen echte staleness."
            )
            return solver
    raise ExtractError(
        f"Stale-detector P!B95 blijft aan en de solver-stand blijft veranderen na 3 herdraaiingen ({solver['B95']!r})"
    )


def dump_sheets(wb, warnings: list) -> dict:
    sheets = {}
    for ws in wb.Worksheets:
        name = ws.Name
        if name in SKIP_SHEETS:
            continue
        ur = ws.UsedRange
        last_row = ur.Row + ur.Rows.Count - 1
        last_col = ur.Column + ur.Columns.Count - 1
        if last_row * last_col > 3_000_000:
            warnings.append(f"Sheet '{name}' heeft een onverwacht grote used range ({last_row}x{last_col})")
        raw = ws.Range(ws.Cells(1, 1), ws.Cells(last_row, last_col)).Value
        if not isinstance(raw, tuple):
            rows = [[convert_value(raw)]]
        else:
            rows = [[convert_value(v) for v in row] for row in raw]
        sheets[name] = {"range": f"A1:{col_letter(last_col)}{last_row}", "values": rows}
    return sheets


# ---------------------------------------------------------------------------
# Scenario-extractie
# ---------------------------------------------------------------------------
def extract_scenario(scenario: dict, source: str, out_dir: str) -> dict:
    name = scenario["name"]
    t0 = time.monotonic()
    log(f"=== scenario '{name}' ===")

    warnings: list = list(scenario.get("warnings", []))
    overrides_log: list = []
    macros_run: list = []

    tempdir = tempfile.mkdtemp(prefix="horizon_oracle_")
    work_path = os.path.join(tempdir, "oracle_work.xlsm")
    shutil.copy2(source, work_path)

    source_sha = sha256_of(work_path)
    source_mtime = dt.datetime.fromtimestamp(os.path.getmtime(source)).astimezone().isoformat(timespec="seconds")
    if source_sha != ANALYSIS_SNAPSHOT_SHA256:
        warnings.insert(
            0,
            (
                f"Bron-Excel (SHA256 {source_sha}) wijkt af van de analyse-snapshot van 2026-07-02 12:24 "
                f"(SHA256 {ANALYSIS_SNAPSHOT_SHA256}); de structuurkennis in docs/horizon-oracle/ kan verouderd zijn."
            ),
        )
        log("  WAARSCHUWING: bron-hash wijkt af van de analyse-snapshot")

    app = None
    wb = None
    closer = None
    excel_pid = None
    try:
        app = win32com.client.DispatchEx("Excel.Application")
        app.Visible = False
        app.DisplayAlerts = False
        app.AskToUpdateLinks = False
        app.AutomationSecurity = MSO_AUTOMATION_SECURITY_LOW
        excel_pid = _window_pid(app.Hwnd)
        log(f"  Excel-instantie gestart (pid {excel_pid})")

        closer = MsgBoxCloser(excel_pid)
        closer.start()

        wb = app.Workbooks.Open(work_path, UpdateLinks=0)
        app.Calculation = XL_CALCULATION_MANUAL

        # Overrides: eerst de TS!A23-fix (geldt voor elk scenario), dan het scenario zelf.
        apply_ts_fix(app, wb, overrides_log, warnings)
        apply_overrides(wb, scenario.get("overrides", []), overrides_log)

        # Macro-protocol (zie module-docstring voor de dubbele BepaalFIRE).
        for macro in ("BepaalFIRE", "RunScenarioBand", "BepaalFIRE", "RunMonteCarlo"):
            t_m = time.monotonic()
            run_macro(app, wb, macro)
            macros_run.append(macro)
            log(f"  macro {macro} klaar ({time.monotonic() - t_m:.1f}s)")

        stabilize(app, wb, warnings)

        # Stale-detector P!B95: "draai opnieuw"-hint -> herdraaien; idempotentie-bewijs
        # onderscheidt echte staleness van een vals alarm (zie resolve_staleness).
        solver = resolve_staleness(app, wb, macros_run, warnings)

        # Verificaties.
        k1 = wb.Worksheets("Controle").Range("K1").Value
        if not (isinstance(k1, str) and k1.strip().upper().startswith("OK")):
            raise ExtractError(f"Controle!K1 is niet OK: {k1!r}")
        a23 = wb.Worksheets("TS").Range("A23").Value
        if isinstance(a23, str) and a23.strip().upper().startswith("FOUT"):
            raise ExtractError(f"TS!A23 meldt na de fix alsnog een FOUT: {a23!r}")

        b16, b38 = solver_state(wb)
        status = solver["B93"] if isinstance(solver["B93"], str) else str(solver["B93"])
        fire_age = None if status == "unreachable_within_horizon" else (
            round(float(b16), 6) if isinstance(b16, (int, float)) else None
        )
        gap = round(float(b38), 6) if isinstance(b38, (int, float)) else None

        status_parts = []
        for key in ("B93", "B94", "B96", "B97", "B98", "B99", "B100"):
            v = solver[key]
            if v is None or (isinstance(v, str) and not v.strip()):
                continue
            if isinstance(v, float):
                v = round(v, 2)
            status_parts.append(f"{key}={v}")
        status_text = " · ".join(status_parts)
        stale_text = solver["B95"] if isinstance(solver["B95"], str) else ("" if solver["B95"] is None else str(solver["B95"]))

        unexpected = [t for t in (closer.closed_titles or []) if t and t != "FIRE-solver"]
        if unexpected:
            warnings.append(f"Onverwachte dialoogvensters gesloten tijdens de run: {unexpected}")
        log(f"  gesloten dialogen: {closer.closed_titles}")

        t_d = time.monotonic()
        sheets = dump_sheets(wb, warnings)
        log(f"  {len(sheets)} sheets gedumpt ({time.monotonic() - t_d:.1f}s)")

        doc = {
            "meta": {
                "fixtureVersion": FIXTURE_VERSION,
                "scenario": name,
                "description": scenario["description"],
                "sourceFile": os.path.basename(source),
                "sourceLastWriteTime": source_mtime,
                "sourceSha256": source_sha,
                "extractedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                "overrides": overrides_log,
                "macros": macros_run,
                "solver": {
                    "fireAge": fire_age,
                    "gap": gap,
                    "statusText": status_text,
                    "staleText": stale_text,
                },
                "controleK1": k1,
                "warnings": warnings,
            },
            "sheets": sheets,
        }

        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{name}.json.gz")
        payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        with open(out_path, "wb") as f:
            with gzip.GzipFile(fileobj=f, mode="wb", compresslevel=9, mtime=0) as gz:
                gz.write(payload.encode("utf-8"))
        size = os.path.getsize(out_path)
        duration = time.monotonic() - t0
        log(
            f"  KLAAR: fireAge={fire_age} status={status} gap={gap} "
            f"-> {out_path} ({size / 1024:.0f} KB, {duration:.0f}s)"
        )
        return {
            "name": name,
            "ok": True,
            "fireAge": fire_age,
            "status": status,
            "gap": gap,
            "size": size,
            "duration": duration,
            "warnings": warnings,
            "path": out_path,
        }
    finally:
        try:
            if wb is not None:
                wb.Close(False)
        except Exception:
            pass
        try:
            if app is not None:
                app.Quit()
        except Exception:
            pass
        if closer is not None:
            closer.stop()
            closer.join(timeout=3)
        wb = None
        app = None
        gc.collect()
        if excel_pid is not None:
            _ensure_excel_dead(excel_pid)
        for _ in range(10):
            try:
                shutil.rmtree(tempdir)
                break
            except OSError:
                time.sleep(0.5)
        else:
            log(f"  let op: tijdelijke map kon niet worden opgeruimd: {tempdir}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Horizon-oracle fixture-extractor (Core calc v5.xlsm)")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="extraheer alle scenario's")
    group.add_argument("--scenario", help="extraheer een scenario (zie --list)")
    group.add_argument("--list", action="store_true", help="toon de scenario-set en stop")
    ap.add_argument("--source", default=DEFAULT_SOURCE, help=f"bron-Excel (default: {DEFAULT_SOURCE})")
    ap.add_argument("--out", default=DEFAULT_OUT, help=f"outputmap (default: {DEFAULT_OUT})")
    args = ap.parse_args(argv)

    if args.list:
        print("Scenario's:")
        for s in SCENARIOS:
            print(f"  {s['name']:24s} {s['description']}")
        print("Overgeslagen (identiek aan basis):")
        for s in SKIPPED_SCENARIOS:
            print(f"  {s['name']:24s} {s['reason']}")
        return 0

    source = os.path.abspath(args.source)
    out_dir = os.path.abspath(args.out)
    if not os.path.isfile(source):
        print(f"Bronbestand niet gevonden: {source}", file=sys.stderr)
        return 2

    if args.scenario:
        skipped = get_skipped(args.scenario)
        if skipped is not None:
            print(f"Scenario '{args.scenario}' wordt bewust overgeslagen: {skipped['reason']}")
            return 0
        scenario = get_scenario(args.scenario)
        if scenario is None:
            print(f"Onbekend scenario '{args.scenario}' — zie --list", file=sys.stderr)
            return 2
        todo = [scenario]
    else:
        todo = SCENARIOS

    pythoncom.CoInitialize()
    results = []
    t_all = time.monotonic()
    for scenario in todo:
        try:
            results.append(extract_scenario(scenario, source, out_dir))
        except Exception as exc:  # noqa: BLE001 — per scenario doorgaan, falen rapporteren
            log(f"  FOUT in scenario '{scenario['name']}': {exc}")
            traceback.print_exc()
            results.append({"name": scenario["name"], "ok": False, "error": str(exc)})

    print()
    print("== SAMENVATTING ==")
    print(f"{'scenario':24s} {'fireAge':>10s} {'status':28s} {'gap':>14s} {'grootte':>9s} {'duur':>6s}")
    for r in results:
        if r["ok"]:
            print(
                f"{r['name']:24s} {str(r['fireAge']):>10s} {r['status']:28s} "
                f"{str(r['gap']):>14s} {r['size'] / 1024:>7.0f}KB {r['duration']:>5.0f}s"
            )
            for w in r["warnings"]:
                print(f"    warning: {w}")
        else:
            print(f"{r['name']:24s} FOUT: {r['error']}")
    if args.all:
        print("Overgeslagen (identiek aan basis):")
        for s in SKIPPED_SCENARIOS:
            print(f"  {s['name']}: {s['reason']}")
    print(f"Totale duur: {time.monotonic() - t_all:.0f}s")

    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
