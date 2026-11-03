import { useState, type FormEvent } from 'react';
import { ArrowLeftRight, ArrowUp, ChevronRight, Info, MapPin, MoonStar, Route as RouteIcon, Settings, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useData } from '../state/data';
import { usePrefs } from '../state/prefs';
import { navigate } from '../state/router';
import { boardableStops, boardingExplainer, departureDayLabel, destinationsFrom, getNextBus, stopById, type Departure } from '../lib/bus';
import { getMealStatus, highlights, rowText, stateOfMeal, type MealInfo } from '../lib/mess';
import { formatCountdown, formatDateLong, greeting, relativeDayLabel } from '../lib/format';
import { zoned } from '../lib/time';
import type { Dataset } from '../lib/types';
import { Card, DietMark, EmptyState, RouteLine, StatusPill, TimeDisplay, cx } from '../components/ui';
import { StopPickerSheet } from '../components/StopPicker';
import { Wordmark } from '../components/Logo';
import { VoiceRouteButton } from '../components/VoiceRoute';
import { setTrip, useTrip } from '../state/trip';
import { describePair, routeExists } from '../lib/voiceRoute';

export function Home({ now }: { now: number }) {
  const { data } = useData();
  const z = zoned(now);
  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between pb-1 pt-2">
        <div>
          <div className="mb-4 lg:hidden">
            <Wordmark />
          </div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] lg:text-[34px]">{greeting(z.hour)}</h1>
          <p className="mt-0.5 text-[15px] text-muted">{formatDateLong(z.dateKey)}</p>
        </div>
        <a href="#/settings" aria-label="Settings" className="grid h-10 w-10 place-items-center rounded-full bg-surface text-muted ring-1 ring-line hover:text-ink lg:hidden">
          <Settings size={19} />
        </a>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <NextBusCard data={data} now={now} />
        <NextMealCard data={data} now={now} />
      </div>

      <SmartSearch />
      <QuickActions />
    </div>
  );
}

// ---------------------------------------------------------------------------

function NextBusCard({ data, now }: { data: Dataset; now: number }) {
  const { prefs, update } = usePrefs();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const trip = useTrip();
  const f = trip ?? { from: prefs.stopId, to: prefs.destinationId };
  const r = getNextBus({ data, now }, f, 2);
  const stop = f.from ? stopById(data.bus, f.from) : null;
  const dest = f.to ? stopById(data.bus, f.to) : null;
  const next = r.next;
  const tomorrowsFirst = next && next.serviceDate !== r.serviceDate;
  const today = zoned(now).dateKey;

  /** A manual pick changes the trip you're looking at: the voice trip while one is active, otherwise your saved route. */
  const apply = (next: { from: string | null; to: string | null }) => {
    if (trip) setTrip(next);
    else update({ stopId: next.from, destinationId: next.to, onboarded: true });
  };
  const canSwap = !!f.to && routeExists(data.bus, f.to, f.from);

  return (
    <Card className="p-5 sm:p-6" aria-labelledby="next-bus-label">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="next-bus-label" className="flex items-center gap-2 text-[15px] font-semibold text-accent">
          <span className="h-2 w-2 rounded-full bg-accent" />
          {tomorrowsFirst ? (zoned(next!.at).dateKey === today ? 'First bus this morning' : 'First bus tomorrow') : 'Next bus'}
        </h2>
        <VoiceRouteButton bus={data.bus} current={f} onApply={(p) => setTrip(p)} onPickManually={() => setPicking('from')} />
      </div>

      <div className="mb-5 flex items-stretch gap-2" role="group" aria-label="Your trip">
        <TripChip label="From" value={stop?.name ?? 'Choose a stop'} placeholder={!stop} onClick={() => setPicking('from')} />
        <button
          onClick={() => apply({ from: f.to, to: f.from })}
          disabled={!canSwap}
          aria-label="Swap From and To"
          className="grid w-9 shrink-0 place-items-center rounded-full self-center h-9 text-accent hover:bg-accent-soft disabled:text-faint disabled:hover:bg-transparent"
        >
          <ArrowLeftRight size={17} />
        </button>
        <TripChip label="To" value={dest?.name ?? 'Anywhere'} placeholder={!dest} onClick={() => setPicking('to')} />
      </div>

      {trip && (
        <div className="-mt-2 mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-tile bg-accent-soft px-3 py-2 text-[13px]">
          <span className="min-w-0">
            <span className="font-medium">Just for this trip:</span> {describePair(data.bus, trip)}
          </span>
          <span className="flex shrink-0 gap-3 font-medium text-accent">
            <button onClick={() => { update({ stopId: trip.from, destinationId: trip.to, onboarded: true }); setTrip(null); }}>Make usual</button>
            <button onClick={() => setTrip(null)}>Reset</button>
          </span>
        </div>
      )}

      {!next ? (
        <EmptyState
          icon={<RouteIcon size={18} />}
          title={stop && dest ? `No buses from ${stop.name} to ${dest.name}` : 'No scheduled buses found'}
          body="None of the published routes make this trip. Try another stop or direction."
          action={
            <button onClick={() => setPicking('to')} className="text-[15px] font-medium text-accent">
              Change where you're going
            </button>
          }
        />
      ) : (
        <BusHero d={next} now={now} tomorrowsFirst={!!tomorrowsFirst} data={data} />
      )}

      {next && (
        <div className="mt-5 border-t border-line pt-4">
          {r.following.length > 0 && (
            <p className="text-[14px] text-muted">
              <span className="font-medium text-ink">Then </span>
              {r.following.map((d, i) => (
                <span key={d.key}>
                  {i > 0 && ', '}
                  <span className="tnum font-medium text-ink">{d.timeLabel}</span> {d.vehicle.name.replace('Institute bus ', '')}
                  {d.serviceDate !== next.serviceDate && ` (${(departureDayLabel(d, now, relativeDayLabel) ?? '').toLowerCase()})`}
                </span>
              ))}
            </p>
          )}
          <a href={`#/bus?from=${f.from ?? ''}&to=${f.to ?? ''}`} className="mt-3 flex items-center justify-between text-[15px] font-medium text-accent">
            View complete schedule
            <ChevronRight size={18} />
          </a>
        </div>
      )}

      <StopPickerSheet
        open={picking === 'from'}
        onClose={() => setPicking(null)}
        title="Where do you catch the bus?"
        stops={boardableStops(data.bus)}
        value={f.from}
        onPick={(id) => apply({ from: id, to: id && f.to && routeExists(data.bus, id, f.to) ? f.to : null })}
      />
      <StopPickerSheet
        open={picking === 'to'}
        onClose={() => setPicking(null)}
        title="Where are you going?"
        stops={f.from ? destinationsFrom(data.bus, f.from) : data.bus.stops}
        value={f.to}
        anyLabel="Anywhere"
        hints={false}
        onPick={(id) => apply({ from: f.from, to: id })}
      />
    </Card>
  );
}

function TripChip({ label, value, placeholder, onClick }: { label: string; value: string; placeholder: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-w-0 flex-1 flex-col rounded-tile bg-sunken px-3 py-2 text-left hover:bg-line/70" aria-label={`${label}: ${value}. Change`}>
      <span className="text-[12px] text-muted">{label}</span>
      <span className={cx('truncate text-[15px] font-medium', placeholder && 'text-muted')}>{value}</span>
    </button>
  );
}

function BusHero({ d, now, tomorrowsFirst, data }: { d: Departure; now: number; tomorrowsFirst: boolean; data: Dataset }) {
  const ms = d.at - now;
  const departing = ms <= 0;
  const leaves = d.boardTimed ? 'Leaves' : `Leaves ${d.origin.name}`;
  return (
    <div key={d.key} className="settle">
      {tomorrowsFirst && (
        <p className="mb-3 flex items-center gap-2 text-[14px] text-muted">
          <MoonStar size={15} /> No more buses tonight.
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <TimeDisplay label={d.timeLabel} />
        <p className={cx('pb-1.5 text-[17px] font-semibold', departing ? 'text-accent' : 'text-ink')} aria-live="polite">
          {departing ? (
            <span className="inline-flex items-center gap-2">
              <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
              Departing now
            </span>
          ) : (
            <>
              {leaves} in <span className="tnum">{formatCountdown(ms)}</span>
            </>
          )}
        </p>
      </div>

      <div className="mt-5">
        <RouteLine stops={d.route.stops.map((id) => stopById(data.bus, id))} boardIndex={d.boardIndex} alightIndex={d.alightIndex} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusPill tone="accent">{d.vehicle.name}</StatusPill>
        <StatusPill tone="muted">{d.trip.seats} seats</StatusPill>
        {d.starred && <StatusPill tone="notice">★ Morning loop</StatusPill>}
      </div>
      {!d.boardTimed && (
        <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          {boardingExplainer(d, (id) => stopById(data.bus, id).name)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MealRows({ meal, max = 5 }: { meal: MealInfo; max?: number }) {
  if (!meal.rows) {
    return <p className="text-[14px] text-muted">The menu for this day hasn't been published yet.</p>;
  }
  const rows = highlights(meal.rows).slice(0, max);
  const rest = meal.rows.length - rows.length;
  return (
    <div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.categoryId} className="flex gap-3 text-[15px] leading-snug">
            <span className="w-[86px] shrink-0 pt-px text-[13px] text-muted">{r.category}</span>
            <span className="flex min-w-0 flex-1 items-start gap-2">
              <span className="mt-[5px]">
                <DietMark diet={r.options.some((o) => o.diet === 'nonveg') ? 'nonveg' : r.options.some((o) => o.diet === 'egg') ? 'egg' : 'veg'} />
              </span>
              <span>{rowText(r)}</span>
            </span>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="mt-2 pl-[98px] text-[13px] text-muted">+ {rest} more: {meal.rows.filter((r) => !r.highlight).map((r) => r.category.toLowerCase()).slice(0, 3).join(', ')}{rest > 3 ? '…' : ''}</p>}
    </div>
  );
}

function NextMealCard({ data, now }: { data: Dataset; now: number }) {
  const s = getMealStatus({ data, now });
  const today = zoned(now).dateKey;
  const focus: MealInfo = s.state === 'completed' && s.next ? s.next : s.meal;
  const state = stateOfMeal(focus, now);
  const dayLabel = relativeDayLabel(focus.dateKey, today);

  let label: string;
  let timing: string;
  if (state === 'serving') {
    label = 'Serving now';
    timing = `Until ${focus.timeLabel.split(' – ')[1]}, ends in ${formatCountdown(focus.endMs - now)}`;
  } else {
    label = 'Next meal';
    timing = `${focus.timeLabel}, starts in ${formatCountdown(focus.startMs - now)}`;
  }

  return (
    <Card className="p-5 sm:p-6" aria-labelledby="next-meal-label">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="next-meal-label" className="flex items-center gap-2 text-[15px] font-semibold text-meal">
          <span className={cx('h-2 w-2 rounded-full bg-meal', state === 'serving' && 'pulse-dot')} />
          {label}
        </h2>
      </div>
      <div key={`${focus.dateKey}-${focus.slot.id}`} className="settle">
        {s.state === 'completed' && (
          <p className="mb-3 flex items-center gap-2 text-[14px] text-muted">
            <MoonStar size={15} /> Today's meals are done.
          </p>
        )}
        <p className="text-[28px] font-bold leading-tight tracking-[-0.02em]">
          {focus.slot.name}
          {dayLabel !== 'Today' && <span className="font-semibold text-muted"> {dayLabel.toLowerCase()}</span>}
        </p>
        <p className="tnum mb-4 mt-1 text-[14px] text-muted">{timing}</p>
        <MealRows meal={focus} />
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <a href={`#/mess?date=${focus.dateKey}`} className="flex items-center justify-between text-[15px] font-medium text-meal">
          View weekly menu
          <ChevronRight size={18} />
        </a>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export const SUGGESTED = ['When is my next bus?', 'Is there a bus to the academic block before 9 AM?', "What's for lunch today?", "What is tomorrow's dinner?", 'When is the last bus to JRHA?', 'Kudasan ki agli bus kab hai?'];

function SmartSearch() {
  const [q, setQ] = useState('');
  const submit = (text: string) => {
    const t = text.trim();
    if (!t) return;
    navigate(`/ask?q=${encodeURIComponent(t.slice(0, 500))}`);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(q);
  };
  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={onSubmit} role="search" className="flex items-center gap-2 rounded-full bg-sunken py-1.5 pl-4 pr-1.5 ring-accent focus-within:ring-2">
        <Sparkles size={18} className="shrink-0 text-accent" />
        <label htmlFor="ask-home" className="sr-only">
          Ask Gati
        </label>
        <input id="ask-home" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Ask Gati anything..." className="h-9 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" enterKeyHint="search" autoComplete="off" />
        <button type="submit" aria-label="Ask" disabled={!q.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white disabled:bg-line disabled:text-muted">
          <ArrowUp size={18} />
        </button>
      </form>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        {SUGGESTED.map((s) => (
          <button key={s} onClick={() => submit(s)} className="h-8 shrink-0 rounded-full bg-surface px-3 text-[13px] text-ink ring-1 ring-line hover:bg-sunken">
            {s}
          </button>
        ))}
      </div>
    </Card>
  );
}

function QuickActions() {
  const items = [
    { href: '#/bus', icon: RouteIcon, label: 'Explore bus routes', tone: 'text-accent' },
    { href: '#/mess', icon: UtensilsCrossed, label: 'Weekly mess menu', tone: 'text-meal' },
    { href: '#/settings?edit=stop', icon: MapPin, label: 'Change preferred stop', tone: 'text-accent' },
    { href: '#/ask', icon: Sparkles, label: 'Ask Gati AI', tone: 'text-accent' },
  ];
  return (
    <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <a key={it.href} href={it.href} className="flex items-center gap-3 rounded-tile bg-surface px-4 py-3.5 text-[14px] font-medium shadow-card ring-1 ring-line/70 hover:bg-sunken">
          <it.icon size={19} className={cx('shrink-0', it.tone)} />
          <span className="leading-tight">{it.label}</span>
        </a>
      ))}
    </nav>
  );
}
