import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Mail } from 'lucide-react';
import { useData } from '../state/data';
import { getDailyMenu, menuCovers, stateOfMeal, type MealInfo } from '../lib/mess';
import { addDays, isDateKey, mondayOf, weekdayOf, WEEKDAY_NAMES, zoned, compareDateKeys } from '../lib/time';
import { formatCountdown, formatDateLong, relativeDayLabel } from '../lib/format';
import { Card, DietMark, EmptyState, PageTitle, SectionTitle, StatusPill, cx } from '../components/ui';
import type { Dataset } from '../lib/types';

function MealCard({ meal, now, isToday }: { meal: MealInfo; now: number; isToday: boolean }) {
  const state = isToday ? stateOfMeal(meal, now) : 'upcoming';
  const serving = state === 'serving';
  const done = isToday && state === 'completed';
  return (
    <Card as="article" className={cx('p-5', serving && 'ring-2 ring-meal', done && 'opacity-70')} aria-label={`${meal.slot.name}, ${meal.timeLabel}`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[20px] font-semibold tracking-[-0.01em]">{meal.slot.name}</h3>
          <p className="tnum text-[14px] text-muted">
            {meal.timeLabel}
            {serving && <span className="text-meal">, ends in {formatCountdown(meal.endMs - now)}</span>}
          </p>
        </div>
        {isToday && serving && <StatusPill tone="meal" live>Serving now</StatusPill>}
        {isToday && state === 'upcoming' && meal.startMs - now < 3 * 3600_000 && <StatusPill tone="accent">in {formatCountdown(meal.startMs - now)}</StatusPill>}
        {done && <StatusPill tone="muted">Done</StatusPill>}
      </header>
      {meal.rows ? (
        <dl className="divide-y divide-line/70">
          {meal.rows.map((r) => (
            <div key={r.categoryId} className="flex gap-3 py-2 text-[15px] leading-snug">
              <dt className="w-[104px] shrink-0 pt-px text-[13px] text-muted">{r.category}</dt>
              <dd className="min-w-0 flex-1">
                {r.options.map((o, i) => (
                  <span key={o.name} className="inline">
                    {i > 0 && <span className="text-muted"> or </span>}
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="relative top-[1px]">
                        <DietMark diet={o.diet} size={11} />
                      </span>
                      <span className={cx(r.highlight && 'font-medium')}>{o.name}</span>
                    </span>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[14px] text-muted">Not published for this day.</p>
      )}
    </Card>
  );
}

function WeekStrip({ selected, onSelect, today, data }: { selected: string; onSelect: (d: string) => void; today: string; data: Dataset }) {
  const mon = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const canPrev = compareDateKeys(addDays(mon, -1), data.mess.validFrom) >= 0;
  const canNext = compareDateKeys(addDays(mon, 7), data.mess.validTo) <= 0;
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onSelect(addDays(selected, -7))} disabled={!canPrev} aria-label="Previous week" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken disabled:opacity-30">
        <ChevronLeft size={18} />
      </button>
      <div className="grid flex-1 grid-cols-7 gap-1" role="tablist" aria-label="Day of week">
        {days.map((d) => {
          const on = d === selected;
          const covered = menuCovers(data.mess, d);
          return (
            <button
              key={d}
              role="tab"
              aria-selected={on}
              aria-label={`${formatDateLong(d)}${d === today ? ', today' : ''}${covered ? '' : ', menu not published'}`}
              onClick={() => onSelect(d)}
              className={cx('flex flex-col items-center rounded-tile py-2 transition-colors', on ? 'bg-ink text-bg' : 'hover:bg-sunken', !covered && !on && 'opacity-40')}
            >
              <span className={cx('text-[11px] font-medium', on ? 'text-bg/70' : 'text-muted')}>{WEEKDAY_NAMES[weekdayOf(d)].slice(0, 3)}</span>
              <span className="tnum text-[17px] font-semibold">{+d.slice(8)}</span>
              <span className={cx('mt-0.5 h-1 w-1 rounded-full', d === today ? (on ? 'bg-bg' : 'bg-meal') : 'bg-transparent')} />
            </button>
          );
        })}
      </div>
      <button onClick={() => onSelect(addDays(selected, 7))} disabled={!canNext} aria-label="Next week" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken disabled:opacity-30">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

export function Mess({ now, params }: { now: number; params: URLSearchParams }) {
  const { data } = useData();
  const today = zoned(now).dateKey;
  const p = params.get('date');
  const [date, setDate] = useState(p && isDateKey(p) ? p : today);
  const menu = getDailyMenu(data, date);
  const isToday = date === today;

  return (
    <div>
      <PageTitle title="Mess" sub={`${data.meta.editions.mess.label.replace(' · ', ', ')}. Serving times are the same every day.`} />
      <Card className="p-3 sm:p-4">
        <WeekStrip selected={date} onSelect={setDate} today={today} data={data} />
      </Card>

      <div className="mb-3 mt-6 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-[22px] font-semibold tracking-[-0.01em]">
          {relativeDayLabel(date, today)}
          <span className="font-normal text-muted">, {formatDateLong(date).split(', ')[1]}</span>
        </h2>
        <div className="flex gap-2">
          {!isToday && (
            <button onClick={() => setDate(today)} className="text-[14px] font-medium text-meal">
              Today
            </button>
          )}
          {date !== addDays(today, 1) && (
            <button onClick={() => setDate(addDays(today, 1))} className="text-[14px] font-medium text-meal">
              Tomorrow
            </button>
          )}
        </div>
      </div>

      {menu.available ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {menu.meals.map((m) => (
            <MealCard key={m.slot.id} meal={m} now={now} isToday={isToday} />
          ))}
        </div>
      ) : (
        <Card className="p-5">
          <EmptyState title="Menu not published for this day" body={menu.reason ?? undefined} action={<button onClick={() => setDate(today)} className="font-medium text-meal">Back to today</button>} />
        </Card>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 px-1 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5"><DietMark diet="veg" size={11} /> Vegetarian</span>
        <span className="inline-flex items-center gap-1.5"><DietMark diet="egg" size={11} /> Egg</span>
        <span className="inline-flex items-center gap-1.5"><DietMark diet="nonveg" size={11} /> Non-veg</span>
        <span>“A or B” means either dish is served.</span>
      </div>

      <SectionTitle>Feedback and complaints</SectionTitle>
      <Card className="p-5">
        <p className="mb-4 text-[14px] text-muted">{data.mess.feedback.note}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.mess.feedback.forms.map((f) => (
            <li key={f.mess}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-tile bg-sunken px-4 py-3 text-[15px] font-medium hover:bg-line/70">
                {f.mess} Mess complaint form
                <ExternalLink size={15} className="text-muted" />
              </a>
            </li>
          ))}
        </ul>
        <ul className="mt-4 space-y-2">
          {data.mess.feedback.emails.map((e) => (
            <li key={e.email}>
              <a href={`mailto:${e.email}`} className="inline-flex flex-wrap items-center gap-x-2 text-[15px]">
                <Mail size={15} className="text-muted" />
                <span className="text-muted">{e.role}:</span>
                <span className="font-medium text-accent">{e.email}</span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

