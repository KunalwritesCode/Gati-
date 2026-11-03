# Gati — Know what's next.

Gati is a campus utility for IIT Gandhinagar students. Open it and the first screen answers two questions: **when is my next bus?** and **what is my next meal?** It also has full bus and mess schedules, voice input for choosing a trip, a chat assistant (Gati AI) that understands English, Hindi and Hinglish, and an installable offline app.

> Gati is an independent student-built project. It is not an official IIT Gandhinagar app and is not endorsed by the institute. Bus times are **scheduled departures** from the published timetable, not live tracking.

---

## Features

| Area | What it does |
|---|---|
| **Home** | Greeting and date in IST. Next-bus card for your boarding stop and direction, with a live countdown and the two following departures. Next-meal card with *Upcoming*, *Serving now* and *Completed* states (after dinner it previews tomorrow's breakfast). Smart search and quick actions. |
| **Bus** | From/To planner, 7-day selector, departures grouped by part of day, the next one highlighted, departed ones folded away. Route search by bus number, stop or destination. Route pages show stops in order. |
| **Mess** | Week strip with day navigation, all four meals with serving times, current meal highlighted, veg/egg/non-veg marks, complaint forms and official emails. |
| **Voice trip** | A mic on the Next Bus card (and in the Bus planner) lets you say a trip, such as “from Gate 1 to U Corridor”, “Jeet se U Corridor” or “मेस पार्किंग से कुडासन”. The card switches to that trip right away, without opening the schedule. **Make usual** saves it; **Reset** goes back. |
| **Gati AI** | Chat at `#/ask`. Common bus and mess questions are answered instantly on the device. Anything else goes to a free, fast language model through a server-side endpoint, which looks every fact up with the same schedule engine. |
| **Settings** | Boarding stop, usual destination, theme, bus reminders, install, timetable version and "last checked" time, notes about the data. |
| **PWA** | Manifest, icons, service worker, offline shell, IndexedDB cache for newer timetables, offline banner. |

There is no login. Preferences are stored only in `localStorage`.

**JRHA is also called Jeet Royal.** Stop pickers show “Also called Jeet Royal”, and search and Gati AI accept it. For voice, just say “Jeet” (or “Jeet Royal”).

---

## Project structure

```
gati/
├── api/chat.ts                 Vercel serverless function: POST /api/chat
├── server/
│   ├── chatCore.ts             AI request handling: provider settings, validation, rate limit, tool loop, guard
│   └── rateLimit.ts            Sliding-window limiter
├── src/
│   ├── data/                   Written by scripts/build_data.py
│   │   ├── busRoutes.json
│   │   ├── messMenu.json
│   │   ├── scheduleMetadata.json
│   │   └── bundled.ts          Typed copy of the three files above (imported by app + server)
│   ├── lib/                    Pure logic, no React, shared by browser and server
│   │   ├── time.ts             Asia/Kolkata clock maths
│   │   ├── bus.ts              getNextBus, getUpcomingBuses, getBusSchedule, search
│   │   ├── mess.ts             getCurrentMeal, getNextMeal, getDailyMenu, getWeeklyMenu, searchMeals
│   │   ├── tools.ts            The 6 AI tools: schemas + executors + result cards
│   │   ├── localAssistant.ts   On-device EN/HI/Hinglish question parser
│   │   ├── voiceRoute.ts       Spoken phrase → From/To (handles “j r h a”, “jeet royal”, “you corridor”, Devanagari)
│   │   ├── aiClient.ts         On-device first, then /api/chat, with fallback
│   │   ├── validate.ts         Runtime validation for downloaded timetables
│   │   └── format.ts, types.ts
│   ├── state/                  Preferences, clock, hash router, data store, IndexedDB, reminders, install,
│   │                           speech (Web Speech API wrapper), trip (temporary voice From/To)
│   ├── components/             UI building blocks
│   ├── screens/                Home, Bus (+ RouteDetail), Mess, Settings, Ask, Onboarding
│   └── assets/fonts/           Inter (latin, variable); OFL licence included
├── public/
│   ├── data/                   Same JSON as src/data, served for update checks
│   └── icons/, manifest.webmanifest, sw.js
├── scripts/
│   ├── source_transcription.py Transcription of the four bus timetable images
│   ├── build_data.py           Builds and validates all data files (444 checks)
│   ├── validate-data.mjs       Build guard: data files in sync and validated
│   └── postbuild.mjs           Writes the service worker's precache list
├── sources/                    The 4 bus timetable images + the mess menu CSV (personal contacts removed)
├── tests/                      Vitest unit tests + browser end-to-end script
└── vercel.json, vite.config.mts, tailwind.config.cjs, tsconfig.json
```

Runtime dependencies are only `react`, `react-dom` and `lucide-react`. UI components are hand-written with Tailwind.

---

## Setup

Requirements: Node 18+ (20 or 22 recommended). Python 3.10+ only if you rebuild the data.

```bash
npm install
cp .env.example .env        # optional: add a free Groq key to enable Gati AI locally
npm run dev                 # http://localhost:5173  (serves /api/chat too)
```

```bash
npm test                    # unit tests (Vitest)
npm run build               # validate data → typecheck → build → service worker manifest
npm run preview             # serve the production build at http://localhost:4173
npm run data:build          # regenerate src/data and public/data from sources/
```

### Simulated time (testing and demos)

Add `?now=YYYY-MM-DDTHH:MM` (IST) before the `#`, for example `http://localhost:5173/?now=2026-11-03T23:50#/`. A blue banner shows whenever the time is simulated.

---

## Gati AI: free, fast, and built to stay within the quota

### The provider

Gati AI works with any OpenAI-compatible chat API. The default is **[Groq](https://console.groq.com)'s free plan** running **`openai/gpt-oss-20b`**:

- No credit card. Create a key at console.groq.com and set it as `GROQ_API_KEY`.
- Fast: gpt-oss-20b generates roughly 900+ tokens per second on Groq, about twice the 120b model.
- Tool calling is supported, and gpt-oss uses native tool calls. (Llama models on Groq have a history of intermittent `tool_use_failed` errors, so they aren't the default.)

At the time of writing the free plan is limited, per organisation and shared by every user of your key, to about **30 requests/min, 1,000 requests/day, 8,000 tokens/min and 200,000 tokens/day**. Limits change; the console's limits page is authoritative.

### How Gati stays inside that quota

1. **Common questions never leave the device.** “Next bus?”, “what's for lunch?”, “bus after 7 PM”, “Jeet se U Corridor”, “आज आखिरी बस कब है?” are recognised by `localAssistant.ts` and answered instantly, offline, using none of the quota.
2. **Only unrecognised questions reach the AI** (open-ended or follow-up questions such as “anything I should know before heading out?”).
3. **A small request.** The prompt and tool definitions are about 1,100 tokens, and one AI question costs roughly 2,600–3,300 tokens in total (two round trips). That is about 2–3 AI questions per minute and 60–75 per day on the free plan.
4. **Graceful limits.** When the provider returns 429, the app shows a “busy” note and answers on the device. The same happens on any other provider error, a timeout, or when offline.

To send every question to the AI instead, build with `VITE_AI_ALWAYS=1`.

### Request flow

```
Question ──► on-device parser ── recognised ──► instant answer (no network)
                  │
              not recognised
                  ▼
          /api/chat (server, key stays here)
             system prompt: current IST time, preferred stop, rules
             model picks: search_bus_routes · get_next_bus · get_bus_schedule
                          get_today_menu · get_weekly_menu · search_meals
                  ▼
          runTool() → deterministic engine (same code as the app)
                  ▼
          short reply + engine-built cards + suggestions
```

- **The model never supplies facts.** Cards under each reply are built by the engine. If the model states a time without calling a tool, the server discards the reply and answers with the engine.
- Up to 4 tool rounds, a 20-second upstream timeout, one automatic retry if the model emits a malformed tool call, at most 12 messages and 500 characters per question, and preferences validated against known stop IDs.
- Per-IP limit: 12 requests per minute and 80 per hour. It is held in memory, so on serverless it applies per warm instance; use Upstash or Vercel KV for a global limit.
- Replies are rendered as plain text, never as HTML.

### Environment variables

Set these on the server only (Vercel → Project → Settings → Environment Variables). **Never** prefix them with `VITE_`: that would put them in the browser bundle.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GROQ_API_KEY` (or `AI_API_KEY`) | For Gati AI | none | Without a key `/api/chat` returns 503 and the app answers on the device. |
| `AI_PROVIDER` | No | `groq` | `groq`, `openai` or `custom`. |
| `AI_MODEL` | No | `openai/gpt-oss-20b` | `openai/gpt-oss-120b` has the same free quota and handles Hindi and Hinglish better, at about half the speed. |
| `AI_BASE_URL` | No | per provider | Required for `custom`. |
| `AI_REASONING_EFFORT` | No | `low` for gpt-oss models | `low`, `medium` or `high`. Leave unset for non-reasoning models. |
| `ALLOWED_ORIGINS` | No | none | Comma-separated extra origins allowed to call `/api/chat`. Same-origin is always allowed. |

For OpenAI instead, set `AI_PROVIDER=openai` and `OPENAI_API_KEY` (default model `gpt-5-mini`). Other free options were considered: Cerebras's free access is a time-limited trial that needs a card, OpenRouter's free models allow only 50 requests a day, and Gemini's free tier may use prompts to improve Google's products.

---

## Deploying to Vercel

1. Push the repository to GitHub.
2. In Vercel choose **Add New → Project** and import the repo. `vercel.json` sets `buildCommand: npm run build` and `outputDirectory: dist`.
3. Add `GROQ_API_KEY` (and optionally `AI_MODEL`) under Environment Variables.
4. Deploy. `api/chat.ts` becomes the serverless function `/api/chat` (30-second limit set in `vercel.json`).
5. Open the site on a phone and use **Add to Home Screen** or **Install**.

`package.json` deliberately has no `"type": "module"`, so Vercel compiles the function to CommonJS and its extensionless relative imports work.

---

## Voice input

- Uses the browser's built-in **Web Speech API**: no dependencies and no server. It works in Chrome and Edge (desktop and Android) and Safari (iOS 14.5+, macOS). Firefox doesn't support it, so the mic sheet says so and offers **Pick stops instead**.
- Choose **English (en-IN)** or **हिन्दी (hi-IN)**; the choice is remembered. Hinglish works in English mode.
- `voiceRoute.ts` tries every alternative the recogniser offers and fixes common mis-hearings: “j r h a”, “jeet” and “jeet royal” → JRHA, “you corridor” → U Corridor, “gate one” → Gate 1, “a b one” → AB1, “kuda san” → Kudasan. It also understands Devanagari names and the words से/तक/जाना.
- It never guesses. An unknown place, a trip no route makes (U Corridor → AB1 Parking) or silence gets a clear message, and Home stays as it was.
- A spoken trip is **temporary**: it lasts for the browser session and doesn't change the saved stop unless **Make usual** is tapped.
- Privacy: in Chrome the browser sends audio to its speech service for recognition. Gati receives only the text and doesn't store it. The sheet says this.
- `vercel.json` sends `Permissions-Policy: microphone=(self)`, which voice input needs.

---

## Data: sources and checks

| Source (in `sources/`) | Used for |
|---|---|
| `combined-bus-schedule.png` | Cross-check of every campus shuttle departure |
| `bus1-schedule.png`, `bus2-schedule.png` | Primary source for Bus 1 / Bus 2 trips |
| `institute-bus-schedule.png` | Kudasan institute bus (56- and 29-seater) |
| `Mess_Menu_November2026.csv` | Weekly menu and serving times. Student coordinators' names, phone numbers and emails were removed before publishing. |

The bus sheets are images and were transcribed into `scripts/source_transcription.py`, the only hand-entered data. `build_data.py` then:

- builds 102 trips on 5 routes (80 campus shuttle, 22 Kudasan) and 8 stops;
- **cross-checks every JRHA and U Corridor departure** in the combined sheet against the Bus 1 and Bus 2 sheets (exact match);
- checks that each bus alternates between ends, that times only increase, the 56-seater window and the operating hours;
- parses the menu CSV and fixes obvious typos (40 normalisations, listed in `scheduleMetadata.json`);
- writes everything with a `dataVersion`, and fails if any of the **444 checks** fails.

Times are 24-hour `HH:MM`. Values of `24:00` or later belong to the previous evening's service (`25:30` is 1:30 AM), following the GTFS convention.

### Data decisions

- Buses run the same timetable **every day**; the app notes “confirm on holidays”.
- Stops without published times (Gate 1, Research Park Circle, AB1 Parking, Rakshashakti Circle) show the starting-stop time and say the bus passes shortly after, or “after N other stops” on the ★ loop. **No times are estimated.**
- “A / B” menu entries mean **either dish** is served.
- Only the complaint forms and the role emails (`mess.secy@`, `welfare.secretary@`) are published.

### Notes from reading the sources

- The Bus 1 sheet subtitle says “29-Seater” but its morning column is the 56-seater; the combined sheet's 56-seater window (7:15–10:45 AM) is used.
- The Bus 2 sheet spells the stop “JHRA” in one column; it is treated as JRHA, and “JHRA” is accepted in search.
- **Kudasan “To IITGn” times are read as departures from Kudasan.** A 30-minute gap after each “From IITGn” trip is too short for a full round trip, so they can't be arrival times on campus.
- Morning ★ trips are a loop: JRHA → Gate 1 → Research Park Circle → AB1 Parking → Mess Parking → U Corridor → Research Park Circle → Gate 1 → JRHA. Before 10:30 AM, students at U Corridor board the loop on its way back.
- No arrival times are published for any route.

### Updating for a new month or a timetable change

1. Replace the CSV in `sources/` (remove personal contact details first) and/or edit `scripts/source_transcription.py`.
2. In `build_data.py`, bump `DATA_VERSION` (for example `2026.12.1`) and the menu `validFrom`/`validTo` and edition labels.
3. Run `npm run data:build`, then `npm test`.
4. Deploy. Installed apps check `data/scheduleMetadata.json`; when it carries a newer `dataVersion` they download and **validate** the new files, save them in IndexedDB and show the download time in Settings. Invalid data is rejected and the app keeps what it has.

Holidays and special days: add entries to `serviceExceptions` in the metadata, such as `{ "date": "2026-11-09", "appliesTo": "bus", "type": "no_service", "note": "No buses: institute holiday" }`. The engine and UI already handle them; the current data has none.

---

## Tests

**Unit tests (Vitest): 95 passing**, also run with the host timezone set to UTC, America/Los_Angeles, Asia/Kolkata and Pacific/Kiritimati to prove the IST maths does not depend on the device.

| Suite | Covers |
|---|---|
| `engine.test.ts` (41) | IST conversion, after-midnight trips, morning ★ loop and 56-seater window, the 1-minute “departing now” grace, untimed stops, impossible rides, last bus, day rollover at 2 AM, holiday exceptions, every meal transition, no menu invented for December, dish search, Jeet Royal as JRHA, data validation |
| `assistant.test.ts` (40) | On-device understanding (what stays local and what goes to the AI); EN/Hinglish/Hindi questions; provider presets and key handling; the request sent to the provider; prompt size; upstream 429 treated as “busy”; one retry on a malformed tool call; guard against invented times; rate limit; key never echoed |
| `voice.test.ts` (9) | Spoken-name normalisation; English, Hinglish, Devanagari; Jeet and Jeet Royal however they are heard or spelled; destination-only keeps your stop; impossible trips refused; unknown places not guessed |
| `api.test.ts` (5) | The Vercel function wrapper: 405, 415, foreign origin 403, bad JSON 400, 503 with `no-store` without a key |

**Browser end-to-end (Playwright, Chromium): 19 passing**, in `tests/e2e/run-e2e.cjs`: home states, live countdown, onboarding, after-last-bus and meal-completed states, Bus and Mess navigation, on-device answers in three languages, offline reload through the service worker, timetable update accepted and malformed update rejected, no horizontal overflow at 320 px, five voice scenarios (scripted recogniser), desktop navigation, common questions never reaching the provider, and the full AI path through `/api/chat` against a local stand-in provider (`tests/e2e/mock-llm.cjs`).

```bash
npm run build && npm run preview &                         # :4173
node tests/e2e/mock-llm.cjs 4599 &
AI_API_KEY=test AI_BASE_URL=http://localhost:4599/v1 AI_MODEL=mock npm run dev &   # :5173
PREVIEW=http://localhost:4173 DEV=http://localhost:5173 node tests/e2e/run-e2e.cjs
```

---

## Known limitations

- **Gati AI has been exercised against a stand-in provider, not the live Groq API.** Before launch, deploy with a real key and ask a few unusual questions in English, Hindi and Hinglish.
- The free plan's quota is shared by all users of one key. Heavy use will show the “busy” note and fall back to on-device answers.
- No published times for intermediate stops, and no arrival times. Gati says so instead of estimating.
- Operating days and holidays aren't in the sources; the app assumes daily service until `serviceExceptions` is filled in.
- The Kudasan direction reading is an interpretation (see above).
- The mess menu covers **1–30 November 2026** only. From 1 December the app shows “not published” until the data is updated.
- The menu doesn't say whether the four messes serve different dishes; Gati shows one menu.
- Bus reminders work only while Gati is open; there is no push server.
- Voice was tested with scripted transcripts, not real speech. Recognition of “JRHA” and “Jeet” varies by accent and device; the spelling fixes are in `voiceRoute.ts` and easy to extend. Voice needs a connection in Chrome and doesn't work in Firefox.
- The on-device parser covers common phrasings; unusual or multi-part questions need the AI.
- Devanagari text uses the device's system font (Inter has no Devanagari).
- The licence is not set (all rights reserved by default). Add a `LICENSE` file to let others reuse the code.
