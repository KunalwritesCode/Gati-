import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { bundledDataset } from '../data/bundled';
import type { Dataset, ScheduleMetadata } from '../lib/types';
import { compareVersions, validateDataset } from '../lib/validate';
import { idbGet, idbSet } from './idb';
import { appNow } from './clock';

/**
 * Where the schedules on screen came from:
 *  bundled  – shipped inside this version of the app
 *  device   – a newer timetable downloaded earlier and saved on this device
 *  network  – a newer timetable downloaded during this session
 */
export type DataSource = 'bundled' | 'device' | 'network';

interface Saved {
  data: Dataset;
  savedAt: number;
}

interface DataCtx {
  data: Dataset;
  source: DataSource;
  /** when this device last reached the server to check for a newer timetable */
  lastCheckedAt: number | null;
  /** when the dataset in use was downloaded (null for the bundled copy) */
  downloadedAt: number | null;
  online: boolean;
  checking: boolean;
  checkError: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);
const CHECKED_KEY = 'gati:lastCheckedAt';
const STALE_CHECK_MS = 30 * 60_000;

function dataUrl(name: string) {
  return new URL(`data/${name}`, document.baseURI).toString();
}

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(dataUrl(name), { cache: 'no-store' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset>(bundledDataset);
  const [source, setSource] = useState<DataSource>('bundled');
  const [downloadedAt, setDownloadedAt] = useState<number | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(() => {
    const v = Number(readStore(CHECKED_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  const [online, setOnline] = useState(() => navigator.onLine);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const current = useRef(data);
  current.current = data;

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    setChecking(true);
    setCheckError(null);
    try {
      const meta = await getJson<ScheduleMetadata>('scheduleMetadata.json');
      const t = appNow();
      setLastCheckedAt(t);
      try {
        localStorage.setItem(CHECKED_KEY, String(t));
      } catch {
        /* ignore */
      }
      if (typeof meta?.dataVersion === 'string' && compareVersions(meta.dataVersion, current.current.meta.dataVersion) > 0) {
        const [bus, mess] = await Promise.all([getJson('busRoutes.json'), getJson('messMenu.json')]);
        const candidate = { bus, mess, meta } as Dataset;
        const v = validateDataset(candidate);
        if (!v.ok) throw new Error(`Downloaded timetable failed validation (${v.errors[0]})`);
        setData(candidate);
        setSource('network');
        setDownloadedAt(t);
        await idbSet<Saved>('dataset', { data: candidate, savedAt: t });
      }
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Could not check for updates');
    } finally {
      setChecking(false);
    }
  }, []);

  // Load a newer saved copy, then check the network.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await idbGet<Saved>('dataset');
      if (!cancelled && saved && validateDataset(saved.data).ok && compareVersions(saved.data.meta.dataVersion, bundledDataset.meta.dataVersion) > 0) {
        setData(saved.data);
        setSource('device');
        setDownloadedAt(saved.savedAt);
      }
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void refresh();
    };
    const off = () => setOnline(false);
    const vis = () => {
      if (document.visibilityState !== 'visible') return;
      const last = Number(readStore(CHECKED_KEY)) || 0;
      if (appNow() - last > STALE_CHECK_MS) void refresh();
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ data, source, lastCheckedAt, downloadedAt, online, checking, checkError, refresh }),
    [data, source, lastCheckedAt, downloadedAt, online, checking, checkError, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useData outside provider');
  return c;
}
