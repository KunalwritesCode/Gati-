import { useEffect, useState, type ReactNode } from 'react';
import { BellRing, ChevronDown, ChevronRight, Download, RefreshCw, Share } from 'lucide-react';
import { useData } from '../state/data';
import { usePrefs, type Theme } from '../state/prefs';
import { useInstall } from '../state/install';
import { boardableStops, destinationsFrom, stopById } from '../lib/bus';
import { formatStamp } from '../lib/format';
import { zoned } from '../lib/time';
import { Banner, Button, Card, PageTitle, Segmented, SectionTitle, cx } from '../components/ui';
import { StopPickerSheet } from '../components/StopPicker';

function Row({ label, value, onClick, hint }: { label: string; value?: ReactNode; onClick?: () => void; hint?: string }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      {value !== undefined && <span className="text-[15px] text-muted">{value}</span>}
      {onClick && <ChevronRight size={18} className="text-faint" />}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-sunken/70">
      {inner}
    </button>
  ) : (
    <div className="flex items-center gap-3 px-5 py-3.5">{inner}</div>
  );
}

export function Settings({ now, params }: { now: number; params: URLSearchParams }) {
  const { data, source, lastCheckedAt, downloadedAt, online, checking, checkError, refresh } = useData();
  const { prefs, update, reset } = usePrefs();
  const install = useInstall();
  const [picker, setPicker] = useState<'stop' | 'dest' | null>(params.get('edit') === 'stop' ? 'stop' : null);
  const [showNotes, setShowNotes] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  useEffect(() => {
    if (params.get('edit') === 'stop') setPicker('stop');
  }, [params]);

  const today = zoned(now).dateKey;
  const stamp = (ms: number) => formatStamp(ms, today, zoned);
  const stop = prefs.stopId ? stopById(data.bus, prefs.stopId) : null;
  const dest = prefs.destinationId ? stopById(data.bus, prefs.destinationId) : null;
  const meta = data.meta;
  const warnings = meta.flags.filter((f) => f.severity !== 'error');

  const setReminder = async (m: number) => {
    if (m > 0 && perm !== 'granted' && perm !== 'unsupported') {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') return;
    }
    update({ reminderMinutes: m });
  };

  return (
    <div className="max-w-2xl">
      <PageTitle title="Settings" sub="Saved on this device only. No account needed." />

      <SectionTitle>Your bus</SectionTitle>
      <Card className="divide-y divide-line/70 overflow-hidden">
        <Row label="Boarding stop" value={stop?.name ?? 'Not set'} onClick={() => setPicker('stop')} />
        <Row label="Usually going to" value={dest?.name ?? 'Any direction'} onClick={() => (prefs.stopId ? setPicker('dest') : setPicker('stop'))} hint={prefs.stopId ? undefined : 'Choose a boarding stop first'} />
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card className="flex items-center justify-between gap-3 px-5 py-3.5">
        <span className="text-[15px]">Theme</span>
        <Segmented<Theme>
          label="Theme"
          value={prefs.theme}
          onChange={(t) => update({ theme: t })}
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Card>

      <SectionTitle>Reminders</SectionTitle>
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[15px]">
            <BellRing size={17} className="text-accent" /> Before my next bus
          </span>
          <Segmented<number>
            label="Reminder lead time"
            value={prefs.reminderMinutes}
            onChange={(m) => void setReminder(m)}
            options={[
              { value: 0, label: 'Off' },
              { value: 5, label: '5 min' },
              { value: 10, label: '10 min' },
              { value: 15, label: '15 min' },
            ]}
          />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          {perm === 'unsupported'
            ? "This browser doesn't support notifications."
            : perm === 'denied'
              ? 'Notifications are blocked for Gati. Allow them in your browser settings to use reminders.'
              : 'Uses your boarding stop and direction. Reminders only arrive while Gati is open on this device.'}
          {!prefs.stopId && ' Set a boarding stop first.'}
        </p>
      </Card>

      <SectionTitle>Install</SectionTitle>
      <Card className="px-5 py-4">
        {install.installed ? (
          <p className="text-[15px]">Gati is installed on this device.</p>
        ) : install.canPrompt ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px]">Add Gati to your home screen. It works offline.</p>
            <Button variant="primary" onClick={() => void install.prompt()}>
              <Download size={16} /> Install
            </Button>
          </div>
        ) : install.ios ? (
          <p className="text-[15px] leading-relaxed">
            In Safari, tap <Share size={15} className="inline align-[-2px]" /> Share, then <span className="font-medium">Add to Home Screen</span>.
          </p>
        ) : (
          <p className="text-[15px] leading-relaxed">Open your browser menu and choose <span className="font-medium">Install app</span> or <span className="font-medium">Add to Home screen</span>.</p>
        )}
      </Card>

      <SectionTitle>Timetable data</SectionTitle>
      <Card className="divide-y divide-line/70 overflow-hidden">
        <Row label={meta.editions.bus.label.replace(' · ', ', ')} hint={`${data.bus.trips.length} departures on ${data.bus.routes.length} routes`} />
        <Row label={meta.editions.mess.label.replace(' · ', ', ')} hint={`Valid ${meta.editions.mess.validFrom} to ${meta.editions.mess.validTo}`} />
        <Row
          label={source === 'bundled' ? 'Included with this version of Gati' : source === 'device' ? 'Newer timetable saved on this device' : 'Newer timetable downloaded'}
          hint={`Data version ${meta.dataVersion}${downloadedAt ? `, downloaded ${stamp(downloadedAt)}` : ''}. ${meta.validation.checksRun} validation checks passed.`}
        />
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px]">Last checked for updates</span>
            <span className="block text-[13px] text-muted">{lastCheckedAt ? stamp(lastCheckedAt) : 'Not checked from this device yet'}</span>
          </span>
          <Button size="sm" onClick={() => void refresh()} disabled={!online || checking}>
            <RefreshCw size={14} className={cx(checking && 'animate-spin')} />
            {online ? (checking ? 'Checking' : 'Check now') : 'Offline'}
          </Button>
        </div>
      </Card>
      {checkError && (
        <div className="mt-3">
          <Banner tone="muted">Couldn't check for updates: {checkError}. Gati keeps using the timetable it already has.</Banner>
        </div>
      )}

      <button onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes} className="mt-4 flex items-center gap-1.5 px-1 text-[14px] font-medium text-accent">
        <ChevronDown size={16} className={cx('transition-transform', showNotes && 'rotate-180')} />
        About this data
      </button>
      {showNotes && (
        <Card className="mt-3 space-y-4 p-5 text-[14px] leading-relaxed">
          <div>
            <h3 className="mb-1 font-semibold">How Gati reads the timetable</h3>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {meta.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 font-semibold">Notes from checking the sources</h3>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {warnings.map((f) => (
                <li key={f.message}>{f.message}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 font-semibold">Sources</h3>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {meta.sources.map((s) => (
                <li key={s.id}>
                  {s.title}: {s.use.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <SectionTitle>About</SectionTitle>
      <Card className="space-y-3 p-5 text-[14px] leading-relaxed">
        <p>
          <span className="font-semibold">Gati</span> <span className="text-muted">Know what's next.</span>
        </p>
        <p className="text-muted">An independent, student-built utility for IIT Gandhinagar. It is not an official app and is not endorsed by the institute. Bus times are scheduled departures, not live tracking.</p>
        <Button variant="quiet" size="sm" className="-ml-3" onClick={() => reset()}>
          Reset preferences
        </Button>
      </Card>

      <StopPickerSheet open={picker === 'stop'} onClose={() => setPicker(null)} title="Boarding stop" stops={boardableStops(data.bus)} value={prefs.stopId} onPick={(id) => update({ stopId: id, destinationId: null, onboarded: true })} />
      <StopPickerSheet
        open={picker === 'dest'}
        onClose={() => setPicker(null)}
        title="Usually going to"
        stops={prefs.stopId ? destinationsFrom(data.bus, prefs.stopId) : []}
        value={prefs.destinationId}
        anyLabel="Any direction"
        hints={false}
        onPick={(id) => update({ destinationId: id })}
      />
    </div>
  );
}
