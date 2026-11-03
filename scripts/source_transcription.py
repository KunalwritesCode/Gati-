"""
Verbatim transcription of the bus timetable screenshots supplied for Gati
(November 2026). Nothing here is derived or estimated; every value is read
directly from an image. Times use 24-hour HH:MM. Departures after midnight
that belong to the previous evening's service are written as 24:xx / 25:xx
(GTFS convention), so 12:30 AM -> "24:30".

Sources
  combined  - "Combined Bus Schedule" (JRHA / U Corridor pickup columns)
  bus1      - "BUS 1 SCHEDULE" (IITGN Welfare Council)
  bus2      - "BUS 2 SCHEDULE" (IITGN Welfare Council)
  institute - "Indian Institute of Technology Gandhinagar - Institute Bus Schedule"
"""

# ---------------------------------------------------------------------------
# Combined Bus Schedule. (time, bus, starred)
# Header: Regular Route: U Corridor -> Research Park Circle -> Gate-1 -> JRHA
# Star route: JRHA -> Gate-1 -> Research Park Circle -> AB1 Parking ->
#             Mess Parking -> U Corridor -> Research Park Circle -> Gate 1 -> JRHA
# "7:15 AM to 2:00 AM"  "NO OTHER STOPS ALLOWED!!"
# "All buses 29 seater except (B1 from 7:15 AM to 10:45 AM -> 56 Seater)"
# ---------------------------------------------------------------------------
COMBINED_JRHA = [
    ("07:15", "B1", True), ("07:45", "B1", True), ("08:15", "B1", True),
    ("08:45", "B1", True), ("09:15", "B1", True), ("09:30", "B2", True),
    ("09:45", "B1", True), ("10:00", "B2", True),
    ("10:15", "B1", False), ("10:30", "B2", False), ("10:45", "B1", False),
    ("11:00", "B2", False), ("11:30", "B2", False), ("12:00", "B2", False),
    ("12:30", "B2", False), ("13:00", "B2", False), ("13:45", "B1", False),
    ("14:15", "B1", False), ("14:45", "B1", False), ("15:15", "B1", False),
    ("15:45", "B1", False), ("16:00", "B2", False), ("16:30", "B2", False),
    ("17:00", "B2", False), ("17:15", "B1", False), ("17:45", "B1", False),
    ("18:15", "B1", False), ("18:30", "B2", False), ("18:45", "B1", False),
    ("19:00", "B2", False), ("19:30", "B2", False), ("20:00", "B2", False),
    ("20:30", "B2", False), ("20:45", "B1", False), ("21:15", "B1", False),
    ("21:45", "B1", False), ("22:15", "B1", False), ("22:45", "B1", False),
    ("23:00", "B2", False), ("23:30", "B2", False), ("24:00", "B2", False),
    ("24:30", "B2", False), ("25:00", "B2", False), ("25:30", "B2", False),
]

COMBINED_UCORRIDOR = [
    ("10:30", "B1"), ("10:45", "B2"), ("11:15", "B2"), ("11:45", "B2"),
    ("12:15", "B2"), ("12:45", "B2"), ("13:30", "B1"), ("14:00", "B1"),
    ("14:30", "B1"), ("15:00", "B1"), ("15:30", "B1"), ("15:45", "B2"),
    ("16:15", "B2"), ("16:45", "B2"), ("17:00", "B1"), ("17:30", "B1"),
    ("18:00", "B1"), ("18:15", "B2"), ("18:30", "B1"), ("18:45", "B2"),
    ("19:15", "B2"), ("19:45", "B2"), ("20:15", "B2"), ("20:30", "B1"),
    ("21:00", "B1"), ("21:30", "B1"), ("22:00", "B1"), ("22:30", "B1"),
    ("22:45", "B2"), ("23:00", "B1"), ("23:15", "B2"), ("23:45", "B2"),
    ("24:15", "B2"), ("24:45", "B2"), ("25:15", "B2"), ("25:45", "B2"),
]

# ---------------------------------------------------------------------------
# Per-bus sheets, in sheet order. ("JRHA" | "UC" | "BREAK", time, starred)
# ---------------------------------------------------------------------------
BUS1 = {
    "title": "BUS 1 SCHEDULE",
    "subtitle": "29-Seater Non-AC Bus · IITGN Welfare Council",
    "operating": ("07:15", "23:15"),
    "segments": {
        "Morning (56 Seater Bus)": [
            ("JRHA", "07:15", True), ("JRHA", "07:45", True), ("JRHA", "08:15", True),
            ("JRHA", "08:45", True), ("JRHA", "09:15", True), ("JRHA", "09:45", True),
            ("JRHA", "10:15", False), ("UC", "10:30", False), ("JRHA", "10:45", False),
        ],
        "Afternoon & Evening (29 Seater Bus)": [
            ("BREAK", None, False),
            ("UC", "13:30", False), ("JRHA", "13:45", False), ("UC", "14:00", False),
            ("JRHA", "14:15", False), ("UC", "14:30", False), ("JRHA", "14:45", False),
            ("UC", "15:00", False), ("JRHA", "15:15", False), ("UC", "15:30", False),
            ("JRHA", "15:45", False),
            ("BREAK", None, False),
            ("UC", "17:00", False), ("JRHA", "17:15", False), ("UC", "17:30", False),
            ("JRHA", "17:45", False), ("UC", "18:00", False), ("JRHA", "18:15", False),
            ("UC", "18:30", False), ("JRHA", "18:45", False),
        ],
        "Late Evening (29 Seater Bus)": [
            ("BREAK", None, False),
            ("UC", "20:30", False), ("JRHA", "20:45", False), ("UC", "21:00", False),
            ("JRHA", "21:15", False), ("UC", "21:30", False), ("JRHA", "21:45", False),
            ("UC", "22:00", False), ("JRHA", "22:15", False), ("UC", "22:30", False),
            ("JRHA", "22:45", False), ("UC", "23:00", False),
        ],
    },
}

BUS2 = {
    "title": "BUS 2 SCHEDULE",
    "subtitle": "29-Seater Non-AC Bus · IITGN Welfare Council",
    "operating": ("09:30", "26:00"),
    "segments": {
        "Morning (29 Seater Bus)": [
            ("JRHA", "09:30", True), ("JRHA", "10:00", True),
            ("JRHA", "10:30", False), ("UC", "10:45", False), ("JRHA", "11:00", False),
            ("UC", "11:15", False), ("JRHA", "11:30", False), ("UC", "11:45", False),
            ("JRHA", "12:00", False),
        ],
        "Afternoon & Evening (29 Seater Bus)": [
            ("UC", "12:15", False), ("JRHA", "12:30", False), ("UC", "12:45", False),
            ("JRHA", "13:00", False),
            ("BREAK", None, False),
            ("UC", "15:45", False), ("JRHA", "16:00", False), ("UC", "16:15", False),
            ("JRHA", "16:30", False), ("UC", "16:45", False), ("JRHA", "17:00", False),
            ("BREAK", None, False),
            ("UC", "18:15", False), ("JRHA", "18:30", False), ("UC", "18:45", False),
            ("JRHA", "19:00", False), ("UC", "19:15", False), ("JRHA", "19:30", False),
            ("UC", "19:45", False), ("JRHA", "20:00", False),
        ],
        "Late Evening (29 Seater Bus)": [
            ("UC", "20:15", False), ("JRHA", "20:30", False),
            ("BREAK", None, False),
            ("UC", "22:45", False), ("JRHA", "23:00", False), ("UC", "23:15", False),
            ("JRHA", "23:30", False), ("UC", "23:45", False), ("JRHA", "24:00", False),
            ("UC", "24:15", False), ("JRHA", "24:30", False), ("UC", "24:45", False),
            ("JRHA", "25:00", False), ("UC", "25:15", False), ("JRHA", "25:30", False),
            ("UC", "25:45", False),
        ],
    },
}

# ---------------------------------------------------------------------------
# Institute Bus Schedule (Kudasan). (direction, time)
#   "from" = From IITGn: IITGN Mess Parking -> Rakshashakti Circle -> Kudasan
#   "to"   = To IITGn:   Kudasan -> Rakshashakti Circle -> IITGN Mess Parking
# ---------------------------------------------------------------------------
INSTITUTE = {
    "56-seater": [
        ("from", "16:30"), ("to", "17:00"), ("from", "17:45"), ("to", "18:15"),
        ("from", "18:45"), ("to", "19:15"), ("from", "19:45"), ("to", "20:15"),
        ("from", "21:30"), ("to", "22:30"),
    ],
    "29-seater": [
        ("from", "07:00"), ("to", "07:30"), ("from", "08:30"), ("to", "09:00"),
        ("from", "09:30"), ("to", "10:00"),
        ("from", "18:30"), ("to", "19:00"), ("from", "19:30"), ("to", "20:00"),
        ("from", "20:30"), ("to", "22:30"),
    ],
}
