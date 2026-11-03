import { useEffect } from 'react';
import type { Dataset } from '../lib/types';
import { getNextBus } from '../lib/bus';
import type { Preferences } from './prefs';
import { appNow } from './clock';

/**
 * Local reminder before the next scheduled bus. Runs only while Gati is open
 * (there is no push server), which the Settings screen states plainly.
 */
export function useBusReminder(data: Dataset, prefs: Preferences, now: number) {
  const lead = prefs.reminderMinutes;
  const next = lead > 0 && prefs.stopId ? getNextBus({ data, now }, { from: prefs.stopId, to: prefs.destinationId }, 0).next : null;
  const key = next?.key;
  const at = next?.at;
  useEffect(() => {
    if (!key || !at || !lead || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const fireAt = at - lead * 60_000;
    const delay = fireAt - appNow();
    if (delay < 0 || delay > 6 * 3600_000) return;
    const sent = `gati:reminded:${key}`;
    try {
      if (sessionStorage.getItem(sent)) return;
    } catch {
      /* storage unavailable */
    }
    const t = window.setTimeout(async () => {
      try {
        sessionStorage.setItem(sent, '1');
      } catch {
        /* ignore */
      }
      const title = `Bus at ${next!.timeLabel}`;
      const body = `${next!.vehicle.name} leaves ${next!.origin.name} in ${lead} min (scheduled).`;
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await reg.showNotification(title, { body, icon: './icons/icon-192.png', tag: 'gati-bus' });
        else new Notification(title, { body, icon: './icons/icon-192.png', tag: 'gati-bus' });
      } catch {
        /* notifications blocked */
      }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, at, lead]);
}
