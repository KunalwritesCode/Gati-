// Data types mirror the JSON files produced by scripts/build_data.py.

export interface Stop {
  id: string;
  name: string;
  /** what students also call it (e.g. JRHA is also called Jeet Royal) */
  nickname?: string;
  aliases: string[];
  area: 'campus' | 'city';
  /** true when the source timetable publishes times at this stop */
  timed: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  operator: string;
  type: string | null;
  operatingHours: { start: string; end: string } | null;
  seatsNote: string;
}

export interface Route {
  id: string;
  name: string;
  shortName: string;
  kind: 'campus' | 'city';
  stops: string[];
  note: string;
}

export interface Calendar {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  assumed: boolean;
  note: string;
}

export interface Trip {
  id: string;
  routeId: string;
  vehicleId: string;
  /** HH:MM at the route's first stop; ≥ 24:00 means after midnight of the service day */
  departure: string;
  seats: number;
  calendarId: string;
  segment: string | null;
  source: string;
}

export interface BusData {
  schemaVersion: number;
  timetableId: string;
  dataVersion: string;
  timezone: string;
  timeFormat: string;
  stops: Stop[];
  vehicles: Vehicle[];
  routes: Route[];
  calendars: Calendar[];
  trips: Trip[];
}

export type Diet = 'veg' | 'egg' | 'nonveg';

export interface MenuOption {
  name: string;
  diet: Diet;
}

export interface MenuRow {
  categoryId: string;
  category: string;
  highlight: boolean;
  options: MenuOption[];
  raw: string;
}

export type MealId = 'breakfast' | 'lunch' | 'snacks' | 'dinner';
export type WeekdayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface MealSlot {
  id: MealId;
  name: string;
  start: string;
  end: string;
  sourceLabel: string;
}

export interface MessData {
  schemaVersion: number;
  menuId: string;
  dataVersion: string;
  title: string;
  timezone: string;
  validFrom: string;
  validTo: string;
  cycle: 'weekly';
  meals: MealSlot[];
  days: Record<WeekdayKey, Partial<Record<MealId, MenuRow[]>>>;
  messes: string[];
  feedback: {
    note: string;
    emails: { role: string; email: string }[];
    forms: { mess: string; url: string }[];
  };
}

export interface ServiceException {
  date: string; // YYYY-MM-DD
  appliesTo: 'bus' | 'mess' | 'all';
  type: 'no_service' | 'modified';
  note: string;
}

export interface MetaFlag {
  severity: 'info' | 'warning' | 'error';
  area: 'bus' | 'mess';
  message: string;
}

export interface ScheduleMetadata {
  schemaVersion: number;
  dataVersion: string;
  generatedAt: string;
  timezone: string;
  editions: {
    bus: { label: string; effectiveFrom: string };
    mess: { label: string; validFrom: string; validTo: string };
  };
  sources: { id: string; title: string; kind: string; use: string }[];
  assumptions: string[];
  serviceExceptions: ServiceException[];
  flags: MetaFlag[];
  normalizations: { from: string; to: string }[];
  validation: {
    status: 'passed' | 'failed';
    checksRun: number;
    checksFailed: number;
    summary: Record<string, number>;
  };
}

export interface Dataset {
  bus: BusData;
  mess: MessData;
  meta: ScheduleMetadata;
}
