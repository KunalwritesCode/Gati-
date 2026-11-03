#!/usr/bin/env python3
"""
Build Gati's structured data files from the supplied sources.

  python3 scripts/build_data.py path/to/Mess_Menu.csv

Outputs (written to src/data and public/data):
  busRoutes.json         stops, vehicles, routes and trips
  messMenu.json          weekly mess menu, serving times, feedback channels
  scheduleMetadata.json  sources, assumptions, flags, validation report

The script fails (exit 1) if any validation check fails, so bad data never
reaches the app.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import source_transcription as src  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIRS = [ROOT / "src" / "data", ROOT / "public" / "data"]
DATA_VERSION = "2026.11.1"
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

checks: list[dict] = []
flags: list[dict] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    checks.append({"check": name, "passed": bool(ok), "detail": detail})


def flag(severity: str, area: str, message: str) -> None:
    flags.append({"severity": severity, "area": area, "message": message})


def to_min(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


# ===========================================================================
# BUS
# ===========================================================================
STOPS = [
    {"id": "jrha", "name": "JRHA", "nickname": "Jeet Royal", "aliases": ["jhra", "j r h a", "jeet royal", "jeet"], "area": "campus", "timed": True},
    {"id": "gate1", "name": "Gate 1", "aliases": ["gate-1", "gate one", "main gate 1"], "area": "campus", "timed": False},
    {"id": "rpc", "name": "Research Park Circle", "aliases": ["research park", "rp circle", "rpc"], "area": "campus", "timed": False},
    {"id": "ucorridor", "name": "U Corridor", "aliases": ["u corridor circle", "u-corridor", "ucorridor", "uc"], "area": "campus", "timed": True},
    {"id": "ab1", "name": "AB1 Parking", "aliases": ["ab1", "ab 1", "academic block 1", "academic block"], "area": "campus", "timed": False},
    {"id": "mess", "name": "Mess Parking", "aliases": ["mess", "iitgn mess parking", "mess parking"], "area": "campus", "timed": True},
    {"id": "rakshashakti", "name": "Rakshashakti Circle", "aliases": ["raksha shakti", "rakshashakti"], "area": "city", "timed": False},
    {"id": "kudasan", "name": "Kudasan", "aliases": ["kudasan"], "area": "city", "timed": True},
]

ROUTES = [
    {
        "id": "campus-jrha-uc", "name": "Campus shuttle", "shortName": "JRHA → U Corridor",
        "kind": "campus", "stops": ["jrha", "gate1", "rpc", "ucorridor"],
        "note": "Regular route. No other stops allowed.",
    },
    {
        "id": "campus-uc-jrha", "name": "Campus shuttle", "shortName": "U Corridor → JRHA",
        "kind": "campus", "stops": ["ucorridor", "rpc", "gate1", "jrha"],
        "note": "Regular route. No other stops allowed.",
    },
    {
        "id": "campus-loop", "name": "Morning loop ★", "shortName": "JRHA loop via AB1 & Mess",
        "kind": "campus", "stops": ["jrha", "gate1", "rpc", "ab1", "mess", "ucorridor", "rpc", "gate1", "jrha"],
        "note": "★ trips only. Round trip that starts and ends at JRHA.",
    },
    {
        "id": "kudasan-out", "name": "Institute bus", "shortName": "Campus → Kudasan",
        "kind": "city", "stops": ["mess", "rakshashakti", "kudasan"],
        "note": "Listed as 'From IITGn' in the institute schedule.",
    },
    {
        "id": "kudasan-in", "name": "Institute bus", "shortName": "Kudasan → Campus",
        "kind": "city", "stops": ["kudasan", "rakshashakti", "mess"],
        "note": "Listed as 'To IITGn' in the institute schedule; time read as departure from Kudasan.",
    },
]

VEHICLES = [
    {"id": "B1", "name": "Bus 1", "operator": "IITGN Welfare Council", "type": "Non-AC",
     "operatingHours": {"start": "07:15", "end": "23:15"},
     "seatsNote": "56-seater from 7:15 to 10:45 AM, 29-seater after that"},
    {"id": "B2", "name": "Bus 2", "operator": "IITGN Welfare Council", "type": "Non-AC",
     "operatingHours": {"start": "09:30", "end": "26:00"}, "seatsNote": "29-seater"},
    {"id": "INST56", "name": "Institute bus (56-seater)", "operator": "IIT Gandhinagar", "type": None,
     "operatingHours": None, "seatsNote": "56-seater"},
    {"id": "INST29", "name": "Institute bus (29-seater)", "operator": "IIT Gandhinagar", "type": None,
     "operatingHours": None, "seatsNote": "29-seater"},
]


def build_bus() -> dict:
    trips: list[dict] = []

    # --- trips from per-bus sheets (primary source) ---------------------------
    for vid, sheet in (("B1", src.BUS1), ("B2", src.BUS2)):
        prev = None  # previous non-break entry
        after_break = False
        for seg, rows in sheet["segments"].items():
            for loc, t, star in rows:
                if loc == "BREAK":
                    after_break = True
                    continue
                seats = 56 if (vid == "B1" and "56" in seg) else 29
                if star:
                    route = "campus-loop"
                elif loc == "JRHA":
                    route = "campus-jrha-uc"
                else:
                    route = "campus-uc-jrha"
                trips.append({
                    "id": f"{vid}-{t.replace(':', '')}",
                    "routeId": route, "vehicleId": vid, "departure": t,
                    "seats": seats, "calendarId": "daily", "segment": seg.split(" (")[0],
                    "source": "bus1" if vid == "B1" else "bus2",
                })
                # operational consistency: a bus alternates ends.
                if prev is not None:
                    p_loc, p_t, p_star = prev
                    expect = "JRHA" if (p_star or p_loc == "UC") else "UC"
                    ok = loc == expect
                    check(f"{vid} sequence {p_t}->{t}", ok,
                          f"after {p_loc}{'★' if p_star else ''} {p_t} expected {expect}, got {loc}"
                          + (" (after break)" if after_break else ""))
                    check(f"{vid} time order {p_t}->{t}", to_min(t) > to_min(p_t))
                prev = (loc, t, star)
                after_break = False

    # --- cross-check against the combined sheet -------------------------------
    sheet_jrha = sorted((t["departure"], t["vehicleId"], t["routeId"] == "campus-loop")
                        for t in trips if t["routeId"] in ("campus-jrha-uc", "campus-loop"))
    combined_jrha = sorted(src.COMBINED_JRHA)
    check("Combined JRHA column == Bus 1 + Bus 2 JRHA departures",
          sheet_jrha == combined_jrha,
          f"{len(combined_jrha)} combined vs {len(sheet_jrha)} per-bus")
    sheet_uc = sorted((t["departure"], t["vehicleId"]) for t in trips if t["routeId"] == "campus-uc-jrha")
    combined_uc = sorted(src.COMBINED_UCORRIDOR)
    check("Combined U Corridor column == Bus 1 + Bus 2 U Corridor departures",
          sheet_uc == combined_uc, f"{len(combined_uc)} combined vs {len(sheet_uc)} per-bus")
    for a, b in zip(sheet_jrha, combined_jrha):
        if a != b:
            flag("error", "bus", f"JRHA mismatch: per-bus {a} vs combined {b}")
    for a, b in zip(sheet_uc, combined_uc):
        if a != b:
            flag("error", "bus", f"U Corridor mismatch: per-bus {a} vs combined {b}")

    # 56-seater window from combined header
    for t in trips:
        if t["vehicleId"] == "B1":
            in_window = to_min("07:15") <= to_min(t["departure"]) <= to_min("10:45")
            check(f"B1 {t['departure']} seat count", (t["seats"] == 56) == in_window)

    # operating window from combined header (7:15 AM to 2:00 AM)
    for t in trips:
        check(f"{t['id']} inside 07:15–26:00", to_min("07:15") <= to_min(t["departure"]) <= to_min("26:00"))
    for vid, sheet in (("B1", src.BUS1), ("B2", src.BUS2)):
        s, e = sheet["operating"]
        for t in trips:
            if t["vehicleId"] == vid:
                check(f"{t['id']} inside {vid} operating time", to_min(s) <= to_min(t["departure"]) <= to_min(e))

    # --- institute bus ----------------------------------------------------------
    for size, rows in src.INSTITUTE.items():
        vid = "INST56" if size.startswith("56") else "INST29"
        seats = 56 if vid == "INST56" else 29
        prev = None
        for direction, t in rows:
            trips.append({
                "id": f"{vid}-{direction}-{t.replace(':', '')}",
                "routeId": "kudasan-out" if direction == "from" else "kudasan-in",
                "vehicleId": vid, "departure": t, "seats": seats, "calendarId": "daily",
                "segment": None, "source": "institute",
            })
            if prev:
                check(f"{vid} alternates {prev[1]}->{t}", prev[0] != direction)
                check(f"{vid} time order {prev[1]}->{t}", to_min(t) > to_min(prev[1]))
            prev = (direction, t)

    ids = [t["id"] for t in trips]
    check("Trip ids unique", len(ids) == len(set(ids)))
    stop_ids = {s["id"] for s in STOPS}
    for r in ROUTES:
        check(f"Route {r['id']} stops exist", all(s in stop_ids for s in r["stops"]))
    route_ids = {r["id"] for r in ROUTES}
    check("Every trip has a known route", all(t["routeId"] in route_ids for t in trips))

    trips.sort(key=lambda t: (to_min(t["departure"]), t["vehicleId"]))

    # --- flags (informational, from reading the sources) ------------------------
    flag("info", "bus", "Bus 1 sheet subtitle says '29-Seater Non-AC Bus' but its Morning column (7:15–10:45 AM) "
         "is a 56-seater. The combined sheet confirms the 56-seater window; Gati uses that.")
    flag("info", "bus", "Bus 2 sheet spells the stop 'JHRA' in its Late Evening column. Treated as JRHA.")
    flag("info", "bus", "The combined sheet header lists the regular route as U Corridor → Research Park Circle → "
         "Gate-1 → JRHA, the per-bus sheets as JRHA → Gate-1 → Research Park Circle → U Corridor. "
         "Gati reads these as the two directions of the same route.")
    flag("warning", "bus", "Times are published only at JRHA and U Corridor (and Mess Parking / Kudasan for the "
         "institute bus). Gate 1, Research Park Circle, AB1 Parking and Rakshashakti Circle have no times; "
         "Gati shows the terminal departure and says the bus passes shortly after. No times are estimated.")
    flag("warning", "bus", "Morning ★ trips are a loop from JRHA via AB1 Parking and Mess Parking to U Corridor and "
         "back to JRHA. There are no separate U Corridor departures before 10:30 AM; students at U Corridor in "
         "the morning board the ★ loop on its way back to JRHA.")
    flag("warning", "bus", "Institute (Kudasan) schedule 'To IITGn' times are read as departures from Kudasan. "
         "A 30-minute gap between 'From' and 'To' rows is too short for a full round trip, so they cannot be "
         "arrival times at campus.")
    flag("info", "bus", "Arrival times are not published for any route.")
    flag("warning", "bus", "Operating days are not stated on any bus sheet. Gati assumes the same timetable "
         "every day of the week and tells students to confirm on holidays.")

    return {
        "schemaVersion": 1,
        "timetableId": "iitgn-bus-2026-11",
        "dataVersion": DATA_VERSION,
        "timezone": "Asia/Kolkata",
        "timeFormat": "HH:MM, 24-hour. Values ≥ 24:00 belong to the previous service day (e.g. 24:30 = 12:30 AM).",
        "stops": STOPS,
        "vehicles": VEHICLES,
        "routes": ROUTES,
        "calendars": [{
            "id": "daily", "name": "Every day", "days": [0, 1, 2, 3, 4, 5, 6],
            "assumed": True,
            "note": "Operating days are not stated in the source sheets. Confirm with the Welfare Council on holidays.",
        }],
        "trips": trips,
    }


# ===========================================================================
# MESS
# ===========================================================================
TYPO_FIXES = [
    (r"\bChuteny\b", "Chutney"), (r"\bMutigrain\b", "Multigrain"), (r"\bRaddish\b", "Radish"),
    (r"\bOmlette\b", "Omelette"), (r"\bBhurjee\b", "Bhurji"), (r"\bMaggie\b", "Maggi"),
    (r"\bVeg\.Korma\b", "Veg Korma"),
]
SMALL_WORDS = {"and", "or", "with", "of", "ka", "ki", "wala"}

LABELS = {
    "breakfast": {
        "Breakfast meal": ("main", "Main", True), "Side item": ("side", "Side", True),
        "Pickle/Lemon": ("pickle", "Pickle & lemon", False), "Sprouts": ("sprouts", "Sprouts", False),
        "Egg-item": ("egg", "Egg", True), "Bread butter jam": ("bread", "Bread, butter & jam", False),
        "Hot Beverage": ("hot-bev", "Hot beverage", False), "Chocos/Cornflake": ("cereal", "Cereal", False),
        "Flavoured powder": ("milk-mix", "Milk mix", False), "Fruit": ("fruit", "Fruit", True),
    },
    "lunch": {
        "Salad": ("salad", "Salad", False), "Dal": ("dal", "Dal", True),
        "Legume Curry": ("legume", "Legume curry", True), "Vegetable": ("veg", "Vegetable", True),
        "Rice": ("rice", "Rice", True), "Side Dairy product and Equivalent": ("dairy", "Dairy", False),
        "Chapati": ("bread", "Bread", True), "Pickle/Lemon": ("pickle", "Pickle & lemon", False),
        "Papad/Fryums": ("papad", "Papad & fryums", False),
    },
    "snacks": {
        "Snacks": ("snack", "Snack", True), "Dips/Chutney": ("dip", "Dip & chutney", False),
        "Cold Beverage": ("cold-bev", "Cold beverage", True), "Hot Beverage": ("hot-bev", "Hot beverage", False),
    },
    "dinner": {
        "Salad": ("salad", "Salad", False), "Dal": ("dal", "Dal", True), "Vegetable": ("veg", "Vegetable", True),
        "Rice": ("rice", "Rice", True), "Chapati": ("bread", "Bread", True),
        "Pickle/Lemon": ("pickle", "Pickle & lemon", False), "Special item": ("special", "Special", True),
        "Non-veg": ("nonveg", "Non-veg", True),
    },
}
MEAL_NAMES = {"breakfast": "Breakfast", "lunch": "Lunch", "snacks": "Snacks", "dinner": "Dinner"}


def parse_time(s: str) -> str:
    m = re.match(r"\s*(\d{1,2})[:.](\d{2})\s*(am|pm)\s*", s, re.I)
    if not m:
        raise ValueError(f"bad time {s!r}")
    h, mi, ap = int(m.group(1)), int(m.group(2)), m.group(3).lower()
    if ap == "pm" and h != 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    return f"{h:02d}:{mi:02d}"


def tidy(text: str) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    t = re.sub(r"\s*\+\s*", " + ", t)
    t = re.sub(r"\s*,\s*", ", ", t)
    for pat, rep in TYPO_FIXES:
        t = re.sub(pat, rep, t)
    words = []
    for i, w in enumerate(t.split(" ")):
        if w.islower() and w.isalpha() and (i == 0 or w not in SMALL_WORDS):
            w = w[0].upper() + w[1:]
        words.append(w)
    return " ".join(words).strip(" ,+")


def diet_of(name: str, cat: str) -> str:
    n = name.lower()
    if cat == "nonveg" or re.search(r"chicken|fish|mutton|prawn", n):
        return "nonveg"
    if cat == "egg" or re.search(r"\begg|omelette", n):
        return "egg"
    return "veg"


def build_mess(csv_path: Path) -> dict:
    rows = list(csv.reader(csv_path.open(encoding="utf-8-sig")))
    meals: list[dict] = []
    days: dict[str, dict[str, list]] = {d: {} for d in DAYS}
    normalizations: dict[str, str] = {}
    current = None
    header_re = re.compile(r"^(Breakfast|Lunch|Snacks|Dinner)\s*-\s*(.+?)\s*(?:to|-)\s*(.+)$", re.I)

    for r in rows:
        if not r or not any(c.strip() for c in r):
            continue
        first = r[0].strip()
        m = header_re.match(first)
        if m:
            current = m.group(1).lower()
            meals.append({"id": current, "name": MEAL_NAMES[current],
                          "start": parse_time(m.group(2)), "end": parse_time(m.group(3)),
                          "sourceLabel": first})
            continue
        if current is None or first == "Day":
            if first == "Day":
                check(f"{current} day header", [c.strip() for c in r[1:8]] ==
                      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])
            continue
        if first not in LABELS[current]:
            flag("error", "mess", f"Unknown row label {first!r} in {current}")
            continue
        cat_id, cat_name, highlight = LABELS[current][first]
        for i, day in enumerate(DAYS):
            raw = r[i + 1] if i + 1 < len(r) else ""
            if not raw.strip() or raw.strip() == "-":
                continue
            parts = [p for p in re.split(r"\s*[/\\]\s*", raw) if p.strip()]
            options = []
            for p in parts:
                name = tidy(p)
                if name != re.sub(r"\s+", " ", p).strip():
                    normalizations[re.sub(r"\s+", " ", p).strip()] = name
                options.append({"name": name, "diet": diet_of(name, cat_id)})
            days[day].setdefault(current, []).append({
                "categoryId": cat_id, "category": cat_name, "highlight": highlight,
                "options": options, "raw": re.sub(r"\s+", " ", raw).strip(),
            })

    # --- validation ---------------------------------------------------------
    check("Four meals found", [m["id"] for m in meals] == ["breakfast", "lunch", "snacks", "dinner"])
    for a, b in zip(meals, meals[1:]):
        check(f"{a['id']} ends before {b['id']} starts", a["end"] <= b["start"])
    for m in meals:
        check(f"{m['id']} start < end", m["start"] < m["end"])
    for d in DAYS:
        for m in meals:
            items = days[d].get(m["id"], [])
            check(f"{d} {m['id']} has items", len(items) >= 3, f"{len(items)} rows")
    if not any(x["categoryId"] == "nonveg" for x in days["saturday"].get("dinner", [])):
        flag("info", "mess", "Saturday dinner has no separate non-veg item (Egg Curry is offered as an "
             "alternative to Kadhai Paneer).")
    flag("info", "mess", "Dishes written as 'A / B' in the menu are shown as 'A or B' (either one is served).")
    flag("info", "mess", "The menu is a single weekly cycle titled November 2026. Gati applies it to every week "
         "from 1 to 30 November 2026 and shows no menu for dates outside that range.")
    flag("info", "mess", "The menu names four messes (Mohani, Jaiswal, Rgouras, Bhopal) but does not say "
         "whether menus differ between them. Gati shows one common menu.")
    flag("info", "mess", "Coordinator names and personal phone numbers in the sheet are intentionally not "
         "included in the app; only complaint forms and official role emails are.")

    # feedback channels (forms + role emails only)
    forms = []
    for r in rows:
        for c in r:
            fm = re.match(r"\s*(\w+) Mess Complaint Form:\s*(https://\S+)", c)
            if fm:
                forms.append({"mess": fm.group(1), "url": fm.group(2)})
    check("Four complaint forms found", len(forms) == 4, ", ".join(f["mess"] for f in forms))

    return {
        "schemaVersion": 1,
        "menuId": "iitgn-mess-2026-11",
        "dataVersion": DATA_VERSION,
        "title": "Mess Menu · November 2026",
        "timezone": "Asia/Kolkata",
        "validFrom": "2026-11-01",
        "validTo": "2026-11-30",
        "cycle": "weekly",
        "meals": meals,
        "days": days,
        "messes": ["Mohani", "Jaiswal", "Rgouras", "Bhopal"],
        "feedback": {
            "note": "For suggestions and complaints, fill the complaint form or email the Mess Secretary.",
            "emails": [
                {"role": "Mess Secretary", "email": "mess.secy@iitgn.ac.in"},
                {"role": "Welfare Secretary", "email": "welfare.secretary@iitgn.ac.in"},
            ],
            "forms": forms,
        },
        "_normalizations": normalizations,
    }


# ===========================================================================
def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: build_data.py MESS_MENU.csv")
    csv_path = Path(sys.argv[1])
    bus = build_bus()
    mess = build_mess(csv_path)
    normalizations = mess.pop("_normalizations")

    failed = [c for c in checks if not c["passed"]]
    errors = [f for f in flags if f["severity"] == "error"]
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    meta = {
        "schemaVersion": 1,
        "dataVersion": DATA_VERSION,
        "generatedAt": now,
        "timezone": "Asia/Kolkata",
        "editions": {
            "bus": {"label": "Bus timetable · November 2026", "effectiveFrom": "2026-11-01"},
            "mess": {"label": "Mess menu · November 2026", "validFrom": "2026-11-01", "validTo": "2026-11-30"},
        },
        "sources": [
            {"id": "combined", "title": "Combined Bus Schedule", "kind": "image",
             "use": "Cross-check of every campus shuttle departure"},
            {"id": "bus1", "title": "Bus 1 Schedule · IITGN Welfare Council", "kind": "image",
             "use": "Primary source for Bus 1 trips"},
            {"id": "bus2", "title": "Bus 2 Schedule · IITGN Welfare Council", "kind": "image",
             "use": "Primary source for Bus 2 trips"},
            {"id": "institute", "title": "IIT Gandhinagar Institute Bus Schedule (Kudasan)", "kind": "image",
             "use": "Primary source for the Kudasan bus"},
            {"id": "mess", "title": "Mess_Menu_November2026 - Menu.csv", "kind": "csv",
             "use": "Weekly mess menu and serving times"},
        ],
        "assumptions": [
            "Buses run the same timetable every day; confirm on holidays.",
            "Untimed stops show the terminal departure plus 'passes shortly after'.",
            "'A / B' menu entries mean either dish is served.",
            "Only complaint forms and official role emails are published; no personal phone numbers.",
        ],
        "serviceExceptions": [],
        "flags": flags,
        "normalizations": [{"from": k, "to": v} for k, v in sorted(normalizations.items())],
        "validation": {
            "status": "passed" if not failed and not errors else "failed",
            "checksRun": len(checks),
            "checksFailed": len(failed),
            "failures": failed,
            "summary": {
                "campusTrips": sum(1 for t in bus["trips"] if t["routeId"].startswith("campus")),
                "kudasanTrips": sum(1 for t in bus["trips"] if t["routeId"].startswith("kudasan")),
                "stops": len(bus["stops"]),
                "menuDays": len(mess["days"]),
            },
        },
    }

    for d in OUT_DIRS:
        d.mkdir(parents=True, exist_ok=True)
        (d / "busRoutes.json").write_text(json.dumps(bus, indent=2, ensure_ascii=False) + "\n")
        (d / "messMenu.json").write_text(json.dumps(mess, indent=2, ensure_ascii=False) + "\n")
        (d / "scheduleMetadata.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")

    # Typed module so the browser bundle and the serverless function share one
    # import path without relying on JSON-module support in either runtime.
    ts = (
        "// Produced by scripts/build_data.py — do not edit by hand.\n"
        "// Edit the sources and re-run: python3 scripts/build_data.py sources/Mess_Menu_November2026.csv\n"
        "import type { BusData, MessData, ScheduleMetadata, Dataset } from '../lib/types';\n\n"
        f"export const busRoutes = {json.dumps(bus, ensure_ascii=False)} as unknown as BusData;\n\n"
        f"export const messMenu = {json.dumps(mess, ensure_ascii=False)} as unknown as MessData;\n\n"
        f"export const scheduleMetadata = {json.dumps(meta, ensure_ascii=False)} as unknown as ScheduleMetadata;\n\n"
        "export const bundledDataset: Dataset = { bus: busRoutes, mess: messMenu, meta: scheduleMetadata };\n"
    )
    (ROOT / "src" / "data" / "bundled.ts").write_text(ts)

    print(f"checks run: {len(checks)}  failed: {len(failed)}  error flags: {len(errors)}")
    for f in failed[:20]:
        print("  FAIL", f)
    for e in errors:
        print("  ERROR", e)
    print("summary:", meta["validation"]["summary"])
    print("normalizations:", len(normalizations))
    if failed or errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
