import { useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import { type Departure, boardingNote, departureStatus, directionLabel } from '../lib/bus';
import { formatCountdown } from '../lib/format';
import { cx, StatusPill } from './ui';

const PARTS: { label: string; until: number }[] = [
  { label: 'Morning', until: 12 * 60 },
  { label: 'Afternoon', until: 17 * 60 },
  { label: 'Evening', until: 21 * 60 },
  { label: 'Night', until: Infinity },
];

export function DepartureRow({ d, now, status, showDirection = true }: { d: Departure; now: number; status: ReturnType<typeof departureStatus>; showDirection?: boolean }) {
  const past = status === 'past';
  const note = boardingNote(d);
  return (
    <li
      className={cx('flex items-start gap-4 rounded-tile px-3 py-3', status === 'next' && 'bg-accent-soft', status === 'now' && 'bg-accent-soft', past && 'opacity-45')}
      aria-current={status === 'next' ? 'true' : undefined}
    >
      <span className="tnum w-[88px] shrink-0 whitespace-nowrap pt-px text-[17px] font-semibold tracking-[-0.01em]">{d.timeLabel}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 text-[15px] font-medium">
          {d.vehicle.name}
          {d.starred && <Star size={13} className="fill-current text-notice" aria-label="Morning loop trip" />}
          <span className="text-[13px] font-normal text-muted">{d.trip.seats} seats</span>
        </span>
        {showDirection && <span className="block truncate text-[13px] text-muted">{directionLabel(d)}</span>}
        {note && <span className="block text-[12px] text-muted">{note}</span>}
      </span>
      <span className="shrink-0 pt-0.5">
        {status === 'now' && <StatusPill tone="accent" live>Departing</StatusPill>}
        {status === 'next' && <StatusPill tone="accent">in {formatCountdown(d.at - now)}</StatusPill>}
        {past && <span className="text-[12px] text-muted">Departed</span>}
      </span>
    </li>
  );
}

/** Day's departures grouped by part of day; departed ones fold away behind a toggle. */
export function DepartureList({ deps, now, nextKey, isToday, showDirection = true }: { deps: Departure[]; now: number; nextKey: string | null; isToday: boolean; showDirection?: boolean }) {
  const [showPast, setShowPast] = useState(false);
  const statuses = deps.map((d) => (isToday ? departureStatus(d, now, nextKey) : 'upcoming'));
  const pastCount = statuses.filter((s) => s === 'past').length;
  const visible = deps.map((d, i) => ({ d, s: statuses[i] })).filter((x) => showPast || x.s !== 'past');

  const groups: { label: string; items: typeof visible }[] = [];
  for (const x of visible) {
    const part = PARTS.find((p) => x.d.originMinutes < p.until)!;
    const g = groups[groups.length - 1];
    if (g && g.label === part.label) g.items.push(x);
    else groups.push({ label: part.label, items: [x] });
  }

  return (
    <div>
      {pastCount > 0 && (
        <button onClick={() => setShowPast((v) => !v)} className="mb-1 flex w-full items-center gap-1.5 rounded-tile px-3 py-2 text-[13px] font-medium text-muted hover:bg-sunken" aria-expanded={showPast}>
          <ChevronDown size={15} className={cx('transition-transform', showPast && 'rotate-180')} />
          {showPast ? 'Hide' : 'Show'} {pastCount} departed earlier
        </button>
      )}
      {groups.map((g) => (
        <div key={g.label} className="mb-2">
          <h3 className="px-3 pb-1 pt-2 text-[13px] font-semibold text-muted">{g.label}</h3>
          <ul>
            {g.items.map(({ d, s }) => (
              <DepartureRow key={d.key} d={d} now={now} status={s} showDirection={showDirection} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
