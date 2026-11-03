import { useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronRight, Info, Search, Star, X } from 'lucide-react';
import { useData } from '../state/data';
import { usePrefs } from '../state/prefs';
import { boardableStops, currentServiceDate, destinationsFrom, getBusSchedule, resolveVehicle, routeById, searchBusRoutes, stopById, stopLabel, summarizeRoute } from '../lib/bus';
import { addDays, weekdayOf, WEEKDAY_NAMES } from '../lib/time';
import { formatDateLong, formatDateShort } from '../lib/format';
import { Banner, Card, Chip, EmptyState, PageTitle, SectionTitle, cx } from '../components/ui';
import { DepartureList } from '../components/DepartureList';
import { VoiceRouteButton } from '../components/VoiceRoute';
import type { Route as RouteT, Stop } from '../lib/types';

function DayChips({ value, onChange, serviceToday }: { value: string; onChange: (d: string) => void; serviceToday: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(serviceToday, i));
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Operating day">
      {days.map((d, i) => (
        <Chip key={d} active={d === value} onClick={() => onChange(d)}>
          {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${WEEKDAY_NAMES[weekdayOf(d)].slice(0, 3)} ${formatDateShort(d).split(' ')[0]}`}
        </Chip>
      ))}
    </div>
  );
}

function StopSelect({ id, label, value, onChange, stops, anyLabel }: { id: string; label: string; value: string; onChange: (v: string) => void; stops: Stop[]; anyLabel: string }) {
  return (
    <label htmlFor={id} className="block min-w-0 flex-1">
      <span className="mb-1 block px-1 text-[12px] font-medium text-muted">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full appearance-none truncate rounded-tile bg-sunken px-3 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <option value="">{anyLabel}</option>
        {stops.map((s) => (
          <option key={s.id} value={s.id}>
            {stopLabel(s)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Bus({ now, params }: { now: number; params: URLSearchParams }) {
  const { data } = useData();
  const { prefs } = usePrefs();
  const serviceToday = currentServiceDate(now);
  const initialFrom = params.has('from') ? params.get('from') || '' : prefs.stopId ?? '';
  const initialTo = params.has('to') ? params.get('to') || '' : prefs.destinationId ?? '';
  const valid = (id: string) => (id && data.bus.stops.some((s) => s.id === id) ? id : '');
  const [from, setFrom] = useState(valid(initialFrom));
  const [to, setTo] = useState(valid(initialTo));
  const [day, setDay] = useState(serviceToday);
  const [query, setQuery] = useState('');

  const fromStops = boardableStops(data.bus);
  const toStops = from ? destinationsFrom(data.bus, from) : data.bus.stops;
  const vehicle = query ? resolveVehicle(data.bus, query) : null;
  const routes = useMemo(() => searchBusRoutes(data.bus, query), [data.bus, query]);
  const sched = getBusSchedule({ data, now }, day, { from: from || null, to: to || null, vehicleId: vehicle?.id });
  const isToday = day === serviceToday;
  const exc = data.meta.serviceExceptions.find((e) => e.date === day && e.appliesTo !== 'mess');

  const swap = () => {
    if (!to) return;
    const reachable = destinationsFrom(data.bus, to).some((s) => s.id === from);
    setFrom(to);
    setTo(reachable ? from : '');
  };

  return (
    <div>
      <PageTitle title="Bus" sub="Scheduled departures from the published timetable. Not live tracking." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
        <div>
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Plan a trip</h2>
              <span className="flex items-center gap-2 text-[13px] text-muted">
                Speak your stops
                <VoiceRouteButton bus={data.bus} current={{ from: from || null, to: to || null }} onApply={(p) => { setFrom(p.from ?? ''); setTo(p.to ?? ''); }} label="Set From and To by voice" />
              </span>
            </div>
            <div className="flex items-end gap-2">
              <StopSelect id="from" label="From" value={from} onChange={(v) => { setFrom(v); if (v && to && !destinationsFrom(data.bus, v).some((s) => s.id === to)) setTo(''); }} stops={fromStops} anyLabel="Any stop" />
              <button onClick={swap} disabled={!to} aria-label="Swap from and to" className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-accent hover:bg-accent-soft disabled:text-faint">
                <ArrowLeftRight size={18} />
              </button>
              <StopSelect id="to" label="To" value={to} onChange={setTo} stops={toStops.filter((s) => s.id !== from)} anyLabel="Anywhere" />
            </div>
            <div className="mt-4">
              <DayChips value={day} onChange={setDay} serviceToday={serviceToday} />
            </div>
          </Card>

          <SectionTitle action={<span className="text-[13px] text-muted">{formatDateLong(day)}</span>}>Departures</SectionTitle>
          {vehicle && (
            <div className="mb-2 flex items-center gap-2 px-1 text-[13px] text-muted">
              Showing {vehicle.name} only
              <button onClick={() => setQuery('')} className="inline-flex items-center gap-1 font-medium text-accent">
                <X size={13} /> Clear
              </button>
            </div>
          )}
          <Card className="p-2 sm:p-3">
            {exc && (
              <div className="p-2">
                <Banner icon={<Info size={16} />}>{exc.note}</Banner>
              </div>
            )}
            {sched.departures.length === 0 ? (
              <div className="p-3">
                <EmptyState title="No scheduled departures" body={from && to ? `None of the published routes go from ${stopById(data.bus, from).name} to ${stopById(data.bus, to).name}.` : 'Nothing matches these filters on this day.'} />
              </div>
            ) : (
              <>
                <DepartureList deps={sched.departures} now={now} nextKey={isToday ? sched.nextKey : null} isToday={isToday} showDirection={!(from && to)} />
                {isToday && !sched.nextKey && <p className="px-3 pb-2 text-[14px] text-muted">All of today's scheduled departures have left. Pick Tomorrow to plan ahead.</p>}
              </>
            )}
          </Card>
          <p className="mt-3 px-1 text-[12px] leading-relaxed text-muted">
            {data.bus.calendars[0]?.note} Times are published only where a route starts; buses pass other stops shortly after.
          </p>
        </div>

        <div>
          <SectionTitle>Routes</SectionTitle>
          <div className="mb-3 flex items-center gap-2 rounded-full bg-surface px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent">
            <Search size={17} className="text-muted" />
            <label htmlFor="route-search" className="sr-only">Search routes</label>
            <input id="route-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bus number, stop or destination" className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" className="text-muted">
                <X size={16} />
              </button>
            )}
          </div>
          <div className="space-y-3">
            {routes.length === 0 && <p className="px-1 text-[14px] text-muted">No route matches “{query}”. Try JRHA, Gate 1, Kudasan or Bus 2.</p>}
            {routes.map((r) => (
              <RouteCard key={r.route.id} route={r.route} stops={r.stops} buses={r.vehicles.map((v) => v.name)} first={r.first} last={r.last} trips={r.tripCount} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RouteCard({ route, stops, buses, first, last, trips }: { route: RouteT; stops: Stop[]; buses: string[]; first: string; last: string; trips: number }) {
  return (
    <a href={`#/bus/route/${route.id}`} className="block rounded-card bg-surface p-4 shadow-card ring-1 ring-line/70 hover:bg-sunken/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
            {route.id === 'campus-loop' && <Star size={12} className="fill-current text-notice" />}
            {route.name}
          </p>
          <p className="text-[17px] font-semibold tracking-[-0.01em]">{route.shortName}</p>
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-faint" />
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{stops.map((s) => s.name).join(' → ')}</p>
      <p className="tnum mt-2 text-[13px]">
        <span className="font-medium">{trips} departures</span>
        <span className="text-muted">, {first} to {last}</span>
      </p>
      <p className="text-[13px] text-muted">{buses.join(', ')}</p>
    </a>
  );
}

export function RouteDetail({ id, now }: { id: string; now: number }) {
  const { data } = useData();
  const route = routeById(data.bus, id);
  const serviceToday = currentServiceDate(now);
  const [day, setDay] = useState(serviceToday);
  if (!route) {
    return (
      <div>
        <PageTitle title="Route not found" back={{ href: '#/bus', label: 'Bus' }} />
        <EmptyState title="This route isn't in the current timetable" body="It may have been removed in a timetable update." action={<a href="#/bus" className="font-medium text-accent">See all routes</a>} />
      </div>
    );
  }
  const sum = summarizeRoute(data.bus, route);
  const sched = getBusSchedule({ data, now }, day, { routeId: route.id });
  const isToday = day === serviceToday;
  const seen = new Map<string, number>();

  return (
    <div>
      <PageTitle title={route.shortName} sub={route.name} back={{ href: '#/bus', label: 'Bus' }} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
        <div>
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Stops in order</h2>
            <ol className="relative">
              {sum.stops.map((s, i) => {
                const n = (seen.get(s.id) ?? 0) + 1;
                seen.set(s.id, n);
                const isEnd = i === 0 || i === sum.stops.length - 1;
                return (
                  <li key={`${s.id}-${i}`} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < sum.stops.length - 1 && <span className="absolute left-[7px] top-4 h-full w-[2px] bg-accent/25" aria-hidden />}
                    <span className={cx('relative mt-1 h-4 w-4 shrink-0 rounded-full', isEnd ? 'bg-accent' : 'border-2 border-accent bg-surface')} aria-hidden />
                    <span>
                      <span className="block text-[15px] font-medium">
                        {s.name}
                        {n > 1 && <span className="font-normal text-muted"> (again)</span>}
                      </span>
                      <span className="block text-[13px] text-muted">{i === 0 ? 'Departure times below are from here' : i === sum.stops.length - 1 ? 'Last stop, no published arrival time' : 'Bus passes through, no published time on this route'}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
          <div className="mt-4 space-y-2 px-1 text-[13px] leading-relaxed text-muted">
            <p>{route.note}</p>
            <p>Buses: {sum.vehicles.map((v) => `${v.name} (${v.seatsNote})`).join('; ')}.</p>
            <p>Arrival times are not published for any route.</p>
          </div>
        </div>
        <div>
          <Card className="p-4 sm:p-5">
            <DayChips value={day} onChange={setDay} serviceToday={serviceToday} />
          </Card>
          <SectionTitle action={<span className="text-[13px] text-muted">{formatDateLong(day)}</span>}>Departures from {sum.stops[0].name}</SectionTitle>
          <Card className="p-2 sm:p-3">
            {sched.departures.length ? <DepartureList deps={sched.departures} now={now} nextKey={isToday ? sched.nextKey : null} isToday={isToday} showDirection={false} /> : <div className="p-3"><EmptyState title="No departures on this day" body={sched.reason ?? undefined} /></div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
