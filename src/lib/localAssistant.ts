// Offline / no-AI assistant. Understands common English, Hindi and Hinglish
// questions with simple rules and answers through the same tools the AI uses.

import type { BusData } from './types';
import { resolveStop } from './bus';
import { followUps, runTool, type Card, type ToolCtx, type ToolResult } from './tools';
import { formatCountdown, formatMinutes } from './format';
import { WEEKDAY_KEYS } from './time';

export type Lang = 'en' | 'hi' | 'hinglish';

export interface AssistantAnswer {
  reply: string;
  cards: Card[];
  suggestions: string[];
  source: 'ai' | 'offline';
  lang: Lang;
  /** true when the question was recognised as a bus or mess question (even if the answer is "can't verify") */
  understood?: boolean;
}

const HINGLISH = /\b(kab|kya|hai|hain|agli|agla|kal|aaj|khana|nashta|naashta|raat|subah|shaam|baje|tak|ke baad|pehle|chahiye|mein|wali|wala|batao|dikhao|milega|konsi|kaunsi|jaane|jana|jaana|aakhri|akhri|pehli|hafte|bhai)\b/i;

export function detectLang(text: string): Lang {
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  if (HINGLISH.test(text)) return 'hinglish';
  return 'en';
}

// Hindi words → English tokens the rules understand.
const HI_MAP: [RegExp, string][] = [
  [/बस/g, ' bus '], [/अगली|अगला/g, ' next '], [/आखिरी|अंतिम/g, ' last '], [/पहली|पहला/g, ' first '],
  [/कल/g, ' tomorrow '], [/आज/g, ' today '], [/नाश्ता|नाश्ते/g, ' breakfast '], [/दोपहर/g, ' lunch '],
  [/रात का खाना|रात के खाने|डिनर/g, ' dinner '], [/शाम/g, ' evening '], [/रात/g, ' night '], [/सुबह/g, ' morning '],
  [/खाना|खाने|मेनू|मेस/g, ' menu '], [/हफ्ते|सप्ताह/g, ' week '], [/के बाद|बाद/g, ' after '], [/से पहले|पहले/g, ' before '],
  [/बजे/g, ' baje '], [/पनीर/g, ' paneer '], [/चिकन/g, ' chicken '], [/कुडासन/g, ' kudasan '], [/गेट/g, ' gate '],
  [/नाश्ता/g, ' breakfast '], [/स्नैक्स/g, ' snacks '],
];

export function normalize(text: string): string {
  let t = ` ${text.toLowerCase()} `;
  for (const [re, rep] of HI_MAP) t = t.replace(re, rep);
  return t
    .replace(/naa?sh?ta/g, ' breakfast ')
    .replace(/\bdopahar\b/g, ' lunch ')
    .replace(/\bkal\b/g, ' tomorrow ')
    .replace(/\baaj\b/g, ' today ')
    .replace(/\b(aakhri|akhri|aakhiri)\b/g, ' last ')
    .replace(/\b(pehli|pehla)\b/g, ' first ')
    .replace(/\b(agli|agla)\b/g, ' next ')
    .replace(/\bke baad\b/g, ' after ')
    .replace(/\bse pehle\b/g, ' before ')
    .replace(/\bhafte\b/g, ' week ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[?!,]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ');
}

export interface StopMention {
  id: string;
  role: 'from' | 'to' | null;
  index: number;
}

/** Find stop mentions and whether each is an origin or destination. */
export function findStops(bus: BusData, t: string): StopMention[] {
  const out: StopMention[] = [];
  const candidates: { id: string; phrase: string }[] = [];
  for (const s of bus.stops) for (const p of [s.name, ...s.aliases]) candidates.push({ id: s.id, phrase: p.toLowerCase() });
  candidates.sort((a, b) => b.phrase.length - a.phrase.length);
  const taken: [number, number][] = [];
  for (const c of candidates) {
    if (c.phrase.length < 2) continue;
    const re = new RegExp(`(^|[^a-z0-9])${c.phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=$|[^a-z0-9])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const start = m.index + m[1].length;
      const end = start + c.phrase.length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      if (c.phrase === 'uc' || c.phrase === 'mess') {
        // too ambiguous on their own ("mess" usually means the dining hall)
        const around = t.slice(Math.max(0, start - 12), end + 12);
        if (!/\b(from|to|se|tak|parking|stop|bus)\b/.test(around)) continue;
      }
      taken.push([start, end]);
      const before = t.slice(0, start).trim().split(' ').slice(-2).join(' ');
      const after = t.slice(end).trim().split(' ').slice(0, 2).join(' ');
      let role: StopMention['role'] = null;
      if (/(^|\s)(from)$/.test(before) || /^(se)(\s|$)/.test(after)) role = 'from';
      else if (/(^|\s)(to|towards|for|till)$/.test(before) || /^(tak|ko|ke liye|jaane|jana|jaana|jaani|jaati|jaata)(\s|$)/.test(after)) role = 'to';
      out.push({ id: c.id, role, index: start });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** "before 9 am", "9 baje se pehle", "after 7pm", "after 19:30" → minutes */
function findTime(t: string): { after?: number; before?: number } {
  const res: { after?: number; before?: number } = {};
  const re = /(after|before)?\s*(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm|baje)?\s*(after|before)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const qual = m[1] || m[5];
    if (!qual) continue;
    let h = +m[2];
    const mm = m[3] ? +m[3] : 0;
    if (h > 23 || mm > 59) continue;
    const ap = m[4];
    if (ap === 'pm' && h < 12) h += 12;
    else if (ap === 'am' && h === 12) h = 0;
    else if ((!ap || ap === 'baje') && h <= 12) {
      const evening = /\b(evening|night|raat|shaam|pm)\b/.test(t);
      const morning = /\b(morning|subah|am)\b/.test(t);
      if (evening && h < 12) h += 12;
      else if (!morning && h >= 1 && h <= 6) h += 12;
    }
    const v = h * 60 + mm;
    if (qual === 'after') res.after = v;
    else res.before = v;
  }
  return res;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

type Intent = { tool: string; args: Record<string, unknown> } | null;

export function parseIntent(text: string, bus: BusData): Intent[] {
  const t = normalize(text);
  const intents: Intent[] = [];
  const mealWord = /\b(breakfast|lunch|snacks?|dinner|menu|mess menu|food|meal|meals|khana|eat|serving|served)\b/.test(t);
  const meal = /\bbreakfast\b/.test(t) ? 'breakfast' : /\blunch\b/.test(t) ? 'lunch' : /\bsnacks?\b/.test(t) ? 'snacks' : /\bdinner\b/.test(t) ? 'dinner' : undefined;
  const stops = findStops(bus, t);
  const busWord = /\b(bus|buses|shuttle|departure|departures|leave|leaves|route|routes|timing|timings|bus stop)\b/.test(t);
  const weekday = WEEKDAY_KEYS.find((w) => new RegExp(`\\b${w}\\b`).test(t));
  const day = /\btomorrow\b/.test(t) ? 'tomorrow' : weekday;

  // ---- food
  if (mealWord && !(busWord && stops.length)) {
    if (/\b(week|weekly|all days)\b/.test(t)) return [{ tool: 'get_weekly_menu', args: { meal } }];
    if (day) return [{ tool: 'get_weekly_menu', args: { day, meal } }];
    return [{ tool: 'get_today_menu', args: { meal } }];
  }

  // ---- dish lookup ("when is paneer", "biryani kab hai")
  if (!busWord && !stops.length) {
    const dish = t.match(/\b(paneer|biryani|chicken|fish|egg|eggs|dosa|paratha|poha|upma|maggi|pasta|samosa|chole|rajma|ice ?cream|icecream|pani puri|halwa|khichdi|pakoda|bhel|manchurian|kadhi|dal makhani|malpua|custard|uttapam|thepla|idli|vada|omelette|bhature|puri|pulao|rice)\b/);
    if (dish) return [{ tool: 'search_meals', args: { query: dish[1].replace(/s$/, '').replace('icecream', 'ice') } }];
  }

  // ---- buses
  if (busWord || stops.length || /\b(next|last|first)\b/.test(t)) {
    if (/\b(routes?|all buses|which buses|stops?)\b/.test(t) && !/\b(next|last|first|after|before)\b/.test(t) && !/\b(when|kab)\b/.test(t)) {
      const s = stops[0];
      return [{ tool: 'search_bus_routes', args: { query: s ? bus.stops.find((x) => x.id === s.id)!.name : '' } }];
    }
    let from: string | undefined;
    let to: string | undefined;
    for (const s of stops) {
      if (s.role === 'from' && !from) from = s.id;
      else if (s.role === 'to' && !to) to = s.id;
    }
    for (const s of stops) {
      if (s.role || s.id === from || s.id === to) continue;
      const stop = bus.stops.find((x) => x.id === s.id)!;
      if (stop.area === 'city' && !to) to = s.id; // "Kudasan bus" usually means going there
      else if (!from) from = s.id;
      else if (!to) to = s.id;
    }
    if (/\b(academic|class|classes|lecture)\b/.test(t) && !to) to = 'ab1';
    const name = (id?: string) => (id ? bus.stops.find((x) => x.id === id)!.name : undefined);
    const time = findTime(t);
    const args: Record<string, unknown> = { from: name(from), to: name(to) };
    // An unrecognised "from X" / "bus to X" is passed through so the tool can say the stop is unknown.
    const STOPWORDS = /\s+(to|before|after|at|today|tomorrow|tonight|now|please|kab|hai|se|tak|stop)\b.*$/;
    const fromPhrase = /\bfrom ([a-z0-9-]+(?: [a-z0-9-]+){0,2})/.exec(t)?.[1]?.replace(STOPWORDS, '').trim();
    if (!from && fromPhrase && !resolveStop(bus, fromPhrase)) args.from = fromPhrase;
    const toPhrase = /\bbus(?:es)? to ([a-z0-9-]+(?: [a-z0-9-]+){0,2})/.exec(t)?.[1]?.replace(STOPWORDS, '').trim();
    if (!to && toPhrase && !/^(go|reach|get)\b/.test(toPhrase) && !resolveStop(bus, toPhrase)) args.to = toPhrase;
    if (day) args.day = day;
    if (/\b(schedule|timetable|all|full|saari|sab)\b/.test(t) && !time.after && !time.before) {
      return [{ tool: 'get_bus_schedule', args: { ...args, bus: /\bbus ?1\b|\bb1\b/.test(t) ? 'Bus 1' : /\bbus ?2\b|\bb2\b/.test(t) ? 'Bus 2' : undefined } }];
    }
    if (/\blast\b/.test(t)) args.last = true;
    else if (/\bfirst\b/.test(t)) args.first = true;
    if (time.after != null) args.after = hhmm(time.after);
    if (time.before != null) args.before = hhmm(time.before);
    if (time.after != null || time.before != null || /\b(any|koi)\b/.test(t)) args.count = 5;
    return [{ tool: 'get_next_bus', args }];
  }
  intents.push(null);
  return intents;
}

// ---------------------------------------------------------------------------
// reply templates

function busReply(r: ToolResult, lang: Lang, now: number): string {
  const d = r.data as { departures: { scheduled_departure: string; bus: string; from_stop: string; to: string; minutes_from_now: number; note: string | null }[]; query: { mode: string; after: string | null; before: string | null } };
  const first = d.departures[0];
  if (!first) {
    return { en: 'No scheduled bus matches that. Check the full schedule for other times.', hinglish: 'Is query ke liye koi scheduled bus nahi mili. Poora schedule dekh lo.', hi: 'इसके लिए कोई निर्धारित बस नहीं मिली। पूरा शेड्यूल देखें।' }[lang];
  }
  const when = formatCountdown(first.minutes_from_now * 60_000);
  const soon = first.minutes_from_now <= 0;
  const mode = d.query.mode;
  if (mode === 'last') return { en: `The last scheduled bus from ${first.from_stop} to ${first.to} is at ${first.scheduled_departure} (${first.bus}).`, hinglish: `${first.from_stop} se ${first.to} ki last bus ${first.scheduled_departure} par hai (${first.bus}).`, hi: `${first.from_stop} से ${first.to} की आखिरी बस ${first.scheduled_departure} पर है (${first.bus})।` }[lang];
  if (mode === 'first') return { en: `The first scheduled bus from ${first.from_stop} is at ${first.scheduled_departure} (${first.bus}).`, hinglish: `${first.from_stop} se pehli bus ${first.scheduled_departure} par hai (${first.bus}).`, hi: `${first.from_stop} से पहली बस ${first.scheduled_departure} पर है (${first.bus})।` }[lang];
  const n = d.departures.length;
  if (mode === 'window') return { en: `Yes — ${n} scheduled departure${n > 1 ? 's' : ''}, the first at ${first.scheduled_departure} (${first.bus}).`, hinglish: `Haan — ${n} bus${n > 1 ? 'en' : ''} hain, pehli ${first.scheduled_departure} par (${first.bus}).`, hi: `हाँ — ${n} बस हैं, पहली ${first.scheduled_departure} पर (${first.bus})।` }[lang];
  void now;
  return {
    en: `Next bus from ${first.from_stop} is at ${first.scheduled_departure} (${first.bus}), ${soon ? 'departing now' : `in ${when}`}.${first.note ? ` ${first.note}.` : ''}`,
    hinglish: `${first.from_stop} se agli bus ${first.scheduled_departure} par hai (${first.bus}), ${soon ? 'abhi nikal rahi hai' : `${when} mein`}.`,
    hi: `${first.from_stop} से अगली बस ${first.scheduled_departure} पर है (${first.bus}), ${soon ? 'अभी निकल रही है' : `${when} में`}।`,
  }[lang];
}

function menuReply(r: ToolResult, lang: Lang): string {
  const d = r.data as { meals?: { meal: string; serving_time: string; items: string[] | null; state: string }[]; menu_available?: boolean; reason?: string | null; day_label?: string; week?: unknown };
  if (d.week) return { en: "Here's this week's menu. Open Mess to see every day in full.", hinglish: 'Ye raha is hafte ka menu. Poora dekhne ke liye Mess kholo.', hi: 'यह इस हफ्ते का मेनू है। पूरा देखने के लिए Mess खोलें।' }[lang];
  if (d.menu_available === false) return { en: "That day's menu hasn't been published, so I can't verify it.", hinglish: 'Us din ka menu publish nahi hua hai, isliye confirm nahi kar sakta.', hi: 'उस दिन का मेनू प्रकाशित नहीं हुआ है, इसलिए पुष्टि नहीं कर सकता।' }[lang];
  const meals = d.meals ?? [];
  if (meals.length === 1) {
    const m = meals[0];
    const cardMeal = r.card?.kind === 'menu' ? r.card.meals[0] : null;
    const items = (cardMeal?.rows ?? []).filter((x) => x.highlight).slice(0, 4).map((x) => x.text).join(', ');
    return { en: `${m.meal} (${m.serving_time}): ${items}.`, hinglish: `${m.meal} (${m.serving_time}) mein: ${items}.`, hi: `${m.meal} (${m.serving_time}): ${items}।` }[lang];
  }
  const serving = meals.find((m) => m.state === 'serving');
  const next = meals.find((m) => m.state === 'upcoming');
  const focus = serving ?? next;
  if (!focus) return { en: "Today's meals are done. Here's the full day for reference.", hinglish: 'Aaj ke saare meals ho gaye. Reference ke liye poora din neeche hai.', hi: 'आज के सभी भोजन हो चुके हैं। पूरा दिन नीचे है।' }[lang];
  return serving
    ? { en: `${focus.meal} is being served now (${focus.serving_time}).`, hinglish: `Abhi ${focus.meal} chal raha hai (${focus.serving_time}).`, hi: `अभी ${focus.meal} चल रहा है (${focus.serving_time})।` }[lang]
    : { en: `Next up is ${focus.meal} at ${focus.serving_time}.`, hinglish: `Agla meal ${focus.meal} hai, ${focus.serving_time}.`, hi: `अगला भोजन ${focus.meal} है, ${focus.serving_time}।` }[lang];
}

function hitsReply(r: ToolResult, lang: Lang): string {
  const d = r.data as { query: string; matches: { dish: string; weekday: string; meal: string; next_date: string | null }[] };
  if (!d.matches.length) return { en: `I couldn't find “${d.query}” on this month's menu.`, hinglish: `“${d.query}” is mahine ke menu mein nahi mila.`, hi: `“${d.query}” इस महीने के मेनू में नहीं मिला।` }[lang];
  const m = d.matches[0];
  const wd = m.weekday[0].toUpperCase() + m.weekday.slice(1);
  return { en: `${m.dish} is on ${wd} ${m.meal.toLowerCase()}${d.matches.length > 1 ? `, plus ${d.matches.length - 1} more` : ''}.`, hinglish: `${m.dish} ${wd} ke ${m.meal.toLowerCase()} mein hai${d.matches.length > 1 ? `, aur ${d.matches.length - 1} jagah bhi` : ''}.`, hi: `${m.dish} ${wd} के ${m.meal} में है।` }[lang];
}

function routesReply(lang: Lang): string {
  return { en: 'Here are the matching routes. Times are published at JRHA, U Corridor, Mess Parking and Kudasan.', hinglish: 'Ye rahe routes. Timings sirf JRHA, U Corridor, Mess Parking aur Kudasan par published hain.', hi: 'ये रहे रूट। समय केवल JRHA, U Corridor, Mess Parking और Kudasan पर प्रकाशित हैं।' }[lang];
}

export function helpReply(lang: Lang): string {
  return {
    en: 'I can answer questions about scheduled bus timings and the mess menu. Try “When is my next bus?” or “What’s for dinner tomorrow?”',
    hinglish: 'Main bus timings aur mess menu ke baare mein bata sakta hoon. Try karo: “Meri agli bus kab hai?” ya “Kal dinner mein kya hai?”',
    hi: 'मैं बस के समय और मेस मेनू के बारे में बता सकता हूँ। पूछें: “मेरी अगली बस कब है?” या “कल रात के खाने में क्या है?”',
  }[lang];
}

export function answerLocally(text: string, ctx: ToolCtx): AssistantAnswer {
  const lang = detectLang(text);
  const intents = parseIntent(text.slice(0, 500), ctx.data.bus).filter(Boolean) as { tool: string; args: Record<string, unknown> }[];
  if (!intents.length) return { reply: helpReply(lang), cards: [], suggestions: followUps([], lang), source: 'offline', lang, understood: false };
  const { tool, args } = intents[0];
  const r = runTool(tool, args, ctx);
  if (!r.ok) {
    return { reply: r.error ?? helpReply(lang), cards: [], suggestions: followUps([tool], lang), source: 'offline', lang, understood: true };
  }
  const reply = tool === 'get_next_bus' ? busReply(r, lang, ctx.now) : tool === 'get_bus_schedule' ? { en: 'Here is the scheduled timetable.', hinglish: 'Ye raha schedule.', hi: 'यह रहा शेड्यूल।' }[lang] : tool === 'search_bus_routes' ? routesReply(lang) : tool === 'search_meals' ? hitsReply(r, lang) : menuReply(r, lang);
  return { reply, cards: r.card ? [r.card] : [], suggestions: followUps([tool], lang), source: 'offline', lang, understood: true };
}

export { formatMinutes, resolveStop };
