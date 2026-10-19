import type { Random } from './random.js';
import { weekday, zonedTime } from './historyTime.js';

/**
 * Camera points of the Nova Tower history: where a detection happens (device, area, access point are resolved by
 * the replay, see historyReplay). Turnstiles and the lounge are seen by the Lobby Camera, the parking gate and the
 * executive floor door by their face terminals.
 */
export const POINTS = [
  'entrance',
  'turnstile1',
  'turnstile2',
  'turnstile3',
  'turnstile4',
  'reception',
  'lounge',
  'serverRoom',
  'dock',
  'parking',
  'executive',
] as const;
export type PointKey = (typeof POINTS)[number];

export type Bbox = { x: number; y: number; width: number; height: number };

export type PlannedDetection = {
  identityId: string;
  point: PointKey;
  at: number;
  similarity: number;
  confidence: number;
  quality: number;
  bbox: Bbox;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Collects detections; `pass` is one walk past a camera point (1–2 frames with a face a few seconds apart). */
export class Track {
  readonly out: PlannedDetection[] = [];

  constructor(
    readonly rnd: Random,
    readonly timezone: string,
  ) {}

  /** Epoch ms of local `minutes` (plus up to a minute of jitter) on the local date. */
  at(date: string, minutes: number): number {
    return zonedTime(date, minutes, this.timezone) + this.rnd.int(0, 59) * SECOND;
  }

  turnstile(): PointKey {
    return this.rnd.pick(['turnstile1', 'turnstile2', 'turnstile3', 'turnstile4'] as const);
  }

  /** Detections of one passage; returns the time of the last one. */
  pass(identityId: string, point: PointKey, at: number, frames = this.rnd.int(1, 2)): number {
    let t = at;
    for (let i = 0; i < frames; i += 1) {
      if (i > 0) t += this.rnd.int(2, 6) * SECOND;
      const width = this.rnd.int(70, 190);
      const height = Math.round(width * 1.25);
      this.out.push({
        identityId,
        point,
        at: t,
        similarity: Number((0.5 + this.rnd.next() * 0.36).toFixed(3)),
        confidence: Number((0.88 + this.rnd.next() * 0.11).toFixed(3)),
        quality: Number((0.45 + this.rnd.next() * 0.47).toFixed(3)),
        bbox: { x: this.rnd.int(0, 1920 - width), y: this.rnd.int(80, 1080 - height), width, height },
      });
    }
    return t;
  }

  /** In through a door point and on through a turnstile `gap` seconds later. */
  enter(identityId: string, door: PointKey, at: number, gap: [number, number] = [35, 70]): number {
    const t = this.pass(identityId, door, at);
    return this.pass(identityId, this.turnstile(), t + this.rnd.int(gap[0], gap[1]) * SECOND);
  }

  /** Out through a turnstile and a door point. */
  leave(identityId: string, door: PointKey, at: number, gap: [number, number] = [35, 70]): number {
    const t = this.pass(identityId, this.turnstile(), at);
    return this.pass(identityId, door, t + this.rnd.int(gap[0], gap[1]) * SECOND);
  }

  /** Stays at a point, seen every 1.5–3 minutes for `minutes`; returns the last detection time. */
  linger(identityId: string, point: PointKey, at: number, minutes: number): number {
    let t = this.pass(identityId, point, at, 1);
    while (t < at + minutes * MINUTE) t = this.pass(identityId, point, t + this.rnd.int(90, 180) * SECOND, 1);
    return t;
  }
}

/** A tracked person of the history (an identity linked to a profile). */
export type HistoryPerson = {
  identityId: string;
  profileId: string;
  role: 'employee' | 'contractor' | 'vip';
  clearance: string;
  /** Has a parking spot: usually arrives through the parking gate. */
  car: boolean;
  /** Logistics staff cleared for the loading dock. */
  dockDuty: boolean;
  guard: 'chief' | 'guard' | null;
  /** Profile validity (contractors), YYYY-MM-DD. */
  activeFrom: string | null;
  activeTo: string | null;
};

/** A regular office day: arrival 08:15–10:00, lunch out on some days, departure 8.5–9.5 h later (by 20:35). */
export function officeDay(t: Track, p: HistoryPerson, date: string): void {
  const { rnd } = t;
  const id = p.identityId;
  const byCar = p.car && rnd.chance(0.8);
  const door: PointKey = byCar ? 'parking' : 'entrance';
  const arrive = t.at(date, rnd.int(495, 599));
  t.enter(id, door, arrive, byCar ? [80, 150] : [35, 70]);
  if (rnd.chance(0.45)) {
    const out = t.leave(id, 'entrance', t.at(date, rnd.int(735, 825)));
    t.enter(id, 'entrance', out + rnd.int(30, 60) * MINUTE);
  }
  if (p.dockDuty && rnd.chance(0.25)) t.pass(id, 'dock', t.at(date, rnd.int(900, 960)), rnd.int(2, 3));
  const depart = Math.min(arrive + rnd.int(510, 570) * MINUTE, t.at(date, 1234));
  t.leave(id, door, depart, byCar ? [80, 150] : [35, 70]);
}

/** A Saturday in the office (10:00–14:00), through the main entrance. */
export function saturdayDay(t: Track, p: HistoryPerson, date: string): void {
  t.enter(p.identityId, 'entrance', t.at(date, t.rnd.int(600, 660)));
  t.leave(p.identityId, 'entrance', t.at(date, t.rnd.int(780, 840)));
}

/** Day security: Mon–Sat; the chief checks the server room twice, guards check the loading dock twice. */
export function guardDay(t: Track, p: HistoryPerson, date: string): void {
  const { rnd } = t;
  const id = p.identityId;
  const saturday = weekday(date) === 6;
  t.enter(id, 'entrance', t.at(date, saturday ? rnd.int(545, 555) : rnd.int(455, 474)));
  const rounds = saturday ? [660] : p.guard === 'chief' ? [rnd.int(580, 620), rnd.int(970, 1010)] : [rnd.int(630, 690), rnd.int(870, 930)];
  for (const minutes of rounds) t.pass(id, p.guard === 'chief' ? 'serverRoom' : 'dock', t.at(date, minutes), 2);
  t.leave(id, 'entrance', t.at(date, saturday ? rnd.int(880, 889) : rnd.int(1170, 1230)));
}

/** A contractor day: signs in at reception, works 08:00–17:30. */
export function contractorDay(t: Track, p: HistoryPerson, date: string): void {
  const { rnd } = t;
  const id = p.identityId;
  const arrive = t.pass(id, 'entrance', t.at(date, rnd.int(480, 570)));
  const signed = t.pass(id, 'reception', arrive + rnd.int(40, 80) * SECOND);
  t.pass(id, t.turnstile(), signed + rnd.int(3, 6) * MINUTE);
  t.leave(id, 'entrance', t.at(date, rnd.int(960, 1050)));
}

/** A VIP morning: through the main entrance or the parking gate, a turnstile and the executive floor door. */
export function vipMorning(t: Track, p: HistoryPerson, date: string, byCar: boolean): void {
  const { rnd } = t;
  const turned = t.enter(p.identityId, byCar ? 'parking' : 'entrance', t.at(date, rnd.int(560, 630)), byCar ? [80, 150] : [40, 120]);
  t.pass(p.identityId, 'executive', turned + rnd.int(2, 4) * MINUTE, 1);
}

/** An unknown face passing the entrance and lingering briefly in the lobby lounge. */
export function strangerVisit(t: Track, identityId: string, date: string): void {
  const arrive = t.pass(identityId, 'entrance', t.at(date, t.rnd.int(600, 1080)));
  t.pass(identityId, 'lounge', arrive + t.rnd.int(60, 180) * SECOND);
}
