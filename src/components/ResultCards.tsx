import { ChevronRight, Star } from 'lucide-react';
import type { Card as CardT, DepItem } from '../lib/tools';
import { formatCountdown } from '../lib/format';
import { DEPARTING_GRACE_MS } from '../lib/bus';
import { Card, DietMark, StatusPill, cx } from './ui';

function liveStatus(it: DepItem, now: number, firstUpcoming: string | null): DepItem['status'] {
  if (it.at <= now && now < it.at + DEPARTING_GRACE_MS) return 'now';
  if (it.at + DEPARTING_GRACE_MS <= now) return 'past';
  return it.key === firstUpcoming ? 'next' : 'upcoming';
}

function Departures({ card, now }: { card: Extract<CardT, { kind: 'departures' }>; now: number }) {
  const firstUpcoming = card.items.find((i) => i.at + DEPARTING_GRACE_MS > now)?.key ?? null;
  const items = card.items.length > 8 ? card.items.filter((i) => i.at + DEPARTING_GRACE_MS > now).slice(0, 8) : card.items;
  return (
    <>
      {items.length === 0 && <p className="text-[14px] text-muted">{card.empty ?? 'No departures left today.'}</p>}
      <ul className="-mx-2">
        {items.map((it) => {
          const s = liveStatus(it, now, firstUpcoming);
          return (
            <li key={it.key} className={cx('flex items-start gap-3 rounded-tile px-2 py-2', s === 'next' && 'bg-accent-soft', s === 'past' && 'opacity-45')}>
              <span className="tnum w-[84px] shrink-0 whitespace-nowrap text-[16px] font-semibold">{it.time}</span>
              <span className="min-w-0 flex-1 text-[14px]">
                <span className="flex items-center gap-1.5 font-medium">
                  {it.bus}
                  {it.starred && <Star size={12} className="fill-current text-notice" />}
                  {it.dayLabel && <span className="font-normal text-muted">{it.dayLabel}</span>}
                </span>
                <span className="block truncate text-[13px] text-muted">{it.direction}</span>
                {it.note && <span className="block text-[12px] text-muted">{it.note}</span>}
              </span>
              {s === 'next' && <StatusPill tone="accent">in {formatCountdown(it.at - now)}</StatusPill>}
              {s === 'now' && <StatusPill tone="accent" live>Departing</StatusPill>}
            </li>
          );
        })}
      </ul>
      {card.items.length > items.length && <p className="mt-1 text-[13px] text-muted">{card.items.length - items.length} more in the full schedule.</p>}
    </>
  );
}

function Menu({ card }: { card: Extract<CardT, { kind: 'menu' }> }) {
  if (card.empty) return <p className="text-[14px] text-muted">{card.empty}</p>;
  const single = card.meals.length === 1;
  return (
    <div className="space-y-4">
      {card.meals.map((m) => (
        <div key={m.id}>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[15px] font-semibold">{m.name}</span>
            <span className="tnum text-[13px] text-muted">{m.time}</span>
            {m.state === 'serving' && <span className="text-[12px] font-semibold text-meal">Serving now</span>}
          </p>
          {m.rows ? (
            <ul className="mt-1 space-y-1">
              {m.rows
                .filter((r) => single || r.highlight)
                .map((r) => (
                  <li key={r.category} className="flex gap-2 text-[14px] leading-snug">
                    <span className="w-[86px] shrink-0 text-[12px] leading-5 text-muted">{r.category}</span>
                    <span className="mt-[4px]">
                      <DietMark diet={r.diets.includes('nonveg') ? 'nonveg' : r.diets.includes('egg') ? 'egg' : 'veg'} size={11} />
                    </span>
                    <span>{r.text}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">Not published for this day.</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function ResultCard({ card, now }: { card: CardT; now: number }) {
  const tone = card.kind === 'menu' || card.kind === 'meal-hits' ? 'text-meal' : 'text-accent';
  return (
    <Card className="p-4">
      <div className="mb-3">
        <p className="text-[15px] font-semibold">{card.title}</p>
        {'subtitle' in card && card.subtitle && <p className="text-[13px] text-muted">{card.subtitle}</p>}
      </div>
      {card.kind === 'departures' && <Departures card={card} now={now} />}
      {card.kind === 'menu' && <Menu card={card} />}
      {card.kind === 'routes' && (
        <ul className="space-y-3">
          {card.items.map((r) => (
            <li key={r.id}>
              <a href={`#/bus/route/${r.id}`} className="block">
                <span className="block text-[14px] font-medium">{r.title}</span>
                <span className="block text-[13px] text-muted">{r.stops.join(' → ')}</span>
                <span className="tnum block text-[12px] text-muted">
                  {r.trips} departures, {r.first} to {r.last}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {card.kind === 'meal-hits' &&
        (card.items.length === 0 ? (
          <p className="text-[14px] text-muted">{card.empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {card.items.map((h, i) => (
              <li key={i} className="flex gap-3 text-[14px]">
                <span className="w-[92px] shrink-0 text-muted">
                  {h.day}
                  {h.when && h.when !== h.day && <span className="block text-[12px]">{h.when}</span>}
                </span>
                <span>
                  <span className="font-medium">{h.name}</span>
                  <span className="block text-[12px] text-muted">
                    {h.meal}, {h.category.toLowerCase()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ))}
      <a href={card.link} className={cx('mt-3 flex items-center justify-between border-t border-line pt-3 text-[14px] font-medium', tone)}>
        {card.kind === 'menu' || card.kind === 'meal-hits' ? 'Open Mess' : 'Open Bus'}
        <ChevronRight size={16} />
      </a>
    </Card>
  );
}
