import { Clock, CloudOff } from 'lucide-react';
import { DataProvider, useData } from './state/data';
import { PrefsProvider, usePrefs } from './state/prefs';
import { useRoute } from './state/router';
import { isSimulatedTime, useNow } from './state/clock';
import { useBusReminder } from './state/reminders';
import { formatDateShort, formatMinutes, formatStamp } from './lib/format';
import { zoned } from './lib/time';
import { BottomNav, SideNav } from './components/Nav';
import { Banner } from './components/ui';
import { Home } from './screens/Home';
import { Bus, RouteDetail } from './screens/Bus';
import { Mess } from './screens/Mess';
import { Settings } from './screens/Settings';
import { Ask } from './screens/Ask';
import { Onboarding } from './screens/Onboarding';

function StatusBanners({ now }: { now: number }) {
  const { online, lastCheckedAt } = useData();
  const z = zoned(now);
  return (
    <div className="space-y-2 empty:hidden">
      {isSimulatedTime() && (
        <Banner tone="accent" icon={<Clock size={16} />}>
          Simulated time: {formatDateShort(z.dateKey)}, {formatMinutes(Math.floor(z.minutes))} IST. Remove <code>?now=</code> from the address to use the real clock.
        </Banner>
      )}
      {!online && (
        <Banner tone="notice" icon={<CloudOff size={16} />}>
          <span className="font-medium">You're offline.</span> Showing schedules saved on this device
          {lastCheckedAt ? `, last checked for updates ${formatStamp(lastCheckedAt, z.dateKey, zoned)}.` : '.'}
        </Banner>
      )}
    </div>
  );
}

function Shell() {
  const route = useRoute();
  const now = useNow(1000);
  const { data } = useData();
  const { prefs } = usePrefs();
  useBusReminder(data, prefs, now);

  const p = route.path;
  let screen;
  if (p === '/' || p === '') screen = <Home now={now} />;
  else if (p === '/bus') screen = <Bus key={route.params.toString()} now={now} params={route.params} />;
  else if (p.startsWith('/bus/route/')) screen = <RouteDetail key={p} id={decodeURIComponent(p.slice('/bus/route/'.length))} now={now} />;
  else if (p === '/mess') screen = <Mess key={route.params.toString()} now={now} params={route.params} />;
  else if (p === '/settings') screen = <Settings now={now} params={route.params} />;
  else if (p === '/ask') screen = <Ask now={now} params={route.params} />;
  else screen = <Home now={now} />;

  return (
    <div className="mx-auto flex max-w-app">
      <SideNav current={p} />
      <main id="main" className="safe-top min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto max-w-[920px]">
          <div className="mb-4 empty:hidden">
            <StatusBanners now={now} />
          </div>
          {screen}
          {p === '/' && <p className="mt-10 text-center text-[12px] leading-relaxed text-muted lg:hidden">Gati is an independent student-built utility, not an official IIT Gandhinagar app.<br />Bus times are scheduled departures, not live tracking.</p>}
        </div>
      </main>
      <BottomNav current={p} />
      <Onboarding />
    </div>
  );
}

export function App() {
  return (
    <PrefsProvider>
      <DataProvider>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
          Skip to content
        </a>
        <Shell />
      </DataProvider>
    </PrefsProvider>
  );
}
