import { Check } from 'lucide-react';
import type { Stop } from '../lib/types';
import { cx, Sheet } from './ui';

export function stopHint(s: Stop): string {
  const base = s.area === 'city' ? (s.timed ? 'Off campus · times published' : 'Off campus · bus passes through') : s.timed ? 'Times published here' : 'Bus passes through, no published time';
  return s.nickname ? `Also called ${s.nickname} · ${base}` : base;
}

export function StopOptions({ stops, value, onPick, anyLabel, hints = true }: { stops: Stop[]; value: string | null; onPick: (id: string | null) => void; anyLabel?: string; hints?: boolean }) {
  const campus = stops.filter((s) => s.area === 'campus');
  const city = stops.filter((s) => s.area === 'city');
  const row = (id: string | null, title: string, hint?: string) => (
    <li key={id ?? 'any'}>
      <button
        onClick={() => onPick(id)}
        aria-pressed={value === id}
        className={cx('flex w-full items-center gap-3 rounded-tile px-3 py-3 text-left hover:bg-sunken', value === id && 'bg-accent-soft hover:bg-accent-soft')}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{title}</span>
          {hint && <span className="block text-[13px] text-muted">{hint}</span>}
        </span>
        {value === id && <Check size={18} className="text-accent" />}
      </button>
    </li>
  );
  return (
    <div>
      <ul>
        {anyLabel && row(null, anyLabel, 'Show buses in every direction')}
        {campus.map((s) => row(s.id, s.name, hints ? stopHint(s) : undefined))}
      </ul>
      {city.length > 0 && (
        <>
          <p className="px-3 pb-1 pt-4 text-[13px] font-semibold text-muted">Institute bus to Kudasan</p>
          <ul>{city.map((s) => row(s.id, s.name, hints ? stopHint(s) : s.area === 'city' ? 'Off campus' : undefined))}</ul>
        </>
      )}
    </div>
  );
}

export function StopPickerSheet({ open, onClose, title, stops, value, onPick, anyLabel, hints = true }: { open: boolean; onClose: () => void; title: string; stops: Stop[]; value: string | null; onPick: (id: string | null) => void; anyLabel?: string; hints?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <StopOptions
        stops={stops}
        value={value}
        anyLabel={anyLabel}
        hints={hints}
        onPick={(id) => {
          onPick(id);
          onClose();
        }}
      />
    </Sheet>
  );
}
