import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import type { Diet } from '../lib/types';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & Record<string, unknown>) {
  return (
    <As className={cx('rounded-card bg-surface shadow-card ring-1 ring-line/70', className)} {...rest}>
      {children}
    </As>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'quiet'; size?: 'sm' | 'md' };

export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: BtnProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-[15px]',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent/90 active:bg-accent/80',
        variant === 'secondary' && 'bg-sunken text-ink hover:bg-line/70 active:bg-line',
        variant === 'ghost' && 'text-accent hover:bg-accent-soft active:bg-accent-soft',
        variant === 'quiet' && 'text-muted hover:text-ink hover:bg-sunken',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkRow({ href, children, className, icon }: { href: string; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <a href={href} className={cx('group flex items-center justify-between gap-3 text-[15px] font-medium text-accent', className)}>
      <span className="flex items-center gap-2">{children}</span>
      {icon}
    </a>
  );
}

export function Chip({ active, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      aria-pressed={active}
      className={cx(
        'h-8 shrink-0 rounded-full px-3 text-[13px] font-medium transition-colors',
        active ? 'bg-ink text-bg' : 'bg-surface text-ink ring-1 ring-line hover:bg-sunken',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-sunken p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors', o.value === value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, a, input, select, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus], button')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="sheet-in relative flex max-h-[88vh] w-full flex-col rounded-t-[28px] bg-surface shadow-lift sm:max-w-md sm:rounded-[28px]">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-sunken text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Indian food-label marks: green square + dot (veg), brown square + triangle (non-veg), amber + dot (egg). */
export function DietMark({ diet, size = 12 }: { diet: Diet | string; size?: number }) {
  const label = diet === 'nonveg' ? 'Non-veg' : diet === 'egg' ? 'Contains egg' : 'Vegetarian';
  const color = diet === 'nonveg' ? 'text-nonveg' : diet === 'egg' ? 'text-notice' : 'text-meal';
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={cx('shrink-0', color)} role="img" aria-label={label}>
      <title>{label}</title>
      <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {diet === 'nonveg' ? <path d="M6 3.2 L8.8 8.4 H3.2 Z" fill="currentColor" /> : <circle cx="6" cy="6" r="2.6" fill="currentColor" />}
    </svg>
  );
}

export function StatusPill({ tone, children, live }: { tone: 'accent' | 'meal' | 'muted' | 'notice'; children: ReactNode; live?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'meal' && 'bg-meal-soft text-meal',
        tone === 'notice' && 'bg-notice-soft text-notice',
        tone === 'muted' && 'bg-sunken text-muted',
      )}
    >
      {live && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Banner({ tone = 'notice', icon, children, action }: { tone?: 'notice' | 'accent' | 'muted' | 'danger'; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role="status"
      className={cx(
        'flex items-start gap-3 rounded-tile px-4 py-3 text-[13px] leading-snug',
        tone === 'notice' && 'bg-notice-soft text-ink',
        tone === 'accent' && 'bg-accent-soft text-ink',
        tone === 'muted' && 'bg-sunken text-muted',
        tone === 'danger' && 'bg-danger/10 text-ink',
      )}
    >
      {icon && <span className={cx('mt-px shrink-0', tone === 'notice' ? 'text-notice' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-muted')}>{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      {icon && <div className="mb-1 grid h-10 w-10 place-items-center rounded-full bg-sunken text-muted">{icon}</div>}
      <p className="text-[17px] font-semibold">{title}</p>
      {body && <div className="text-[14px] leading-relaxed text-muted">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageTitle({ title, sub, back }: { title: string; sub?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-5 pt-2">
      {back && (
        <a href={back.href} className="mb-3 inline-flex items-center gap-1 text-[15px] font-medium text-accent">
          <span aria-hidden>‹</span> {back.label}
        </a>
      )}
      <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] lg:text-[34px]">{title}</h1>
      {sub && <p className="mt-1 text-[15px] text-muted">{sub}</p>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-8 flex items-baseline justify-between px-1">
      <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  );
}

/** Horizontal route diagram: filled dots where times are published. */
export function RouteLine({ stops, boardIndex, alightIndex }: { stops: { name: string; timed: boolean }[]; boardIndex: number; alightIndex: number | null }) {
  const end = alightIndex ?? stops.length - 1;
  const first = stops[boardIndex];
  const last = stops[end];
  const via = stops.slice(boardIndex + 1, end);
  return (
    <div>
      <div className="flex items-center gap-2 text-[15px] font-medium">
        <span className="truncate">{first.name}</span>
        <span className="relative flex h-3 min-w-[48px] flex-1 items-center" aria-hidden>
          <span className="absolute inset-x-1 h-[2px] rounded bg-accent/30" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-accent ring-[3px] ring-surface" />
          {via.map((_, i) => (
            <span key={i} className="relative mx-auto h-1.5 w-1.5 rounded-full bg-accent/50" />
          ))}
          <span className="relative ml-auto h-2.5 w-2.5 rounded-full border-2 border-accent bg-surface" />
        </span>
        <span className="truncate text-right">{last.name}</span>
      </div>
      {via.length > 0 && <p className="mt-1 text-[13px] text-muted">via {via.map((s) => s.name).join(', ')}</p>}
    </div>
  );
}

export function TimeDisplay({ label, size = 'xl', className }: { label: string; size?: 'xl' | 'lg' | 'md'; className?: string }) {
  const i = label.lastIndexOf(' ');
  const t = label.slice(0, i);
  const ap = label.slice(i + 1);
  return (
    <span className={cx('tnum inline-flex items-baseline', className)}>
      <span className={cx('font-semibold tracking-[-0.045em]', size === 'xl' && 'text-[64px] leading-[0.95] sm:text-[72px]', size === 'lg' && 'text-[34px] leading-none', size === 'md' && 'text-[17px]')}>{t}</span>
      <span className={cx('font-semibold text-muted', size === 'xl' ? 'ml-1.5 text-[22px]' : size === 'lg' ? 'ml-1 text-[15px]' : 'ml-1 text-[13px]')}>{ap}</span>
    </span>
  );
}
