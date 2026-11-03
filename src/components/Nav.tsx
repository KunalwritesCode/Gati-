import { Bus, Home, Settings, Sparkles, UtensilsCrossed } from 'lucide-react';
import { cx } from './ui';
import { Wordmark } from './Logo';

const TABS = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/bus', label: 'Bus', icon: Bus },
  { path: '/mess', label: 'Mess', icon: UtensilsCrossed },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function active(current: string, path: string) {
  return path === '/' ? current === '/' || current === '/ask' : current.startsWith(path);
}

export function BottomNav({ current }: { current: string }) {
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-surface/90 backdrop-blur-xl lg:hidden">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((t) => {
          const on = active(current, t.path);
          return (
            <li key={t.path} className="flex-1">
              <a href={`#${t.path}`} aria-current={on ? 'page' : undefined} className={cx('flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium', on ? 'text-accent' : 'text-muted')}>
                <t.icon size={23} strokeWidth={on ? 2.2 : 1.8} />
                {t.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ current }: { current: string }) {
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line/80 px-4 py-6 lg:flex">
      <a href="#/" className="mb-1 px-3">
        <Wordmark />
      </a>
      <p className="mb-8 px-3 text-[13px] text-muted">Know what's next.</p>
      <ul className="space-y-1">
        {TABS.map((t) => {
          const on = active(current, t.path) && !(t.path === '/' && current === '/ask');
          return (
            <li key={t.path}>
              <a href={`#${t.path}`} aria-current={on ? 'page' : undefined} className={cx('flex items-center gap-3 rounded-tile px-3 py-2.5 text-[15px] font-medium', on ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-sunken')}>
                <t.icon size={19} />
                {t.label}
              </a>
            </li>
          );
        })}
      </ul>
      <a href="#/ask" className={cx('mt-6 flex items-center gap-3 rounded-tile px-3 py-2.5 text-[15px] font-medium', current === '/ask' ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-sunken')}>
        <Sparkles size={19} />
        Ask Gati AI
      </a>
      <p className="mt-auto px-3 text-[12px] leading-relaxed text-muted">An independent student-built utility. Not an official IIT Gandhinagar app.</p>
    </nav>
  );
}
