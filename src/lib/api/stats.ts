import axios from 'axios';
import { api } from './client';

/** Why the NAS half of the dashboard is not live. A 200 with online:false is not an error. */
export type NasOfflineReason =
  | 'unreachable'
  | 'timeout'
  | 'auth'
  | 'not_configured'
  | 'bad_payload'
  | 'unknown';

export type MemoryPressure = 'ok' | 'low' | 'critical' | 'unknown';
export type HistoryRange = 'now' | '7d' | '30d';
export type StatMetric =
  | 'nasCpu'
  | 'nasRam'
  | 'nasDisk'
  | 'vpsCpu'
  | 'vpsRam'
  | 'vpsDisk'
  | 'vpsSteal';

export interface NasCpu {
  cores: number | null;
  pct: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
}

export interface NasMemory {
  totalMb: number | null;
  availableMb: number | null;
  freeMb: number | null;
  arcMb: number | null;
  arcCapMb: number | null;
  pressure: MemoryPressure;
}

export interface NasPool {
  name: string | null;
  health: string | null;
  sizeBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usedPct: number | null;
  role: string | null;
}

export interface NasMovies {
  dataset: string | null;
  path: string | null;
  usedBytes: number | null;
  availBytes: number | null;
  referBytes: number | null;
  headlineFreeGb: number | null;
  note: string | null;
}

export interface NasSnapshotHold {
  countStorage: number | null;
  heldBytes: number | null;
}

export interface NasDisk {
  name: string | null;
  role: string | null;
  tempC: number | null;
  ok: boolean | null;
}

export interface NasServices {
  jellyfin: boolean | null;
  nextcloud: boolean | null;
  caddy: boolean | null;
  smb: boolean | null;
  mediaWatch: boolean | null;
  liveTv: string | null;
}

export interface NasPlaybackItem {
  title: string | null;
  where: string | null;
  method: string | null;
}

export interface NasPlayback {
  count: number | null;
  items: NasPlaybackItem[];
}

export interface NasHealth {
  stagesOk: number | null;
  stagesTotal: number | null;
  failing: string[];
}

export interface NasSnapshot {
  at: number | null;
  host: string | null;
  version: string | null;
  uptimeS: number | null;
  schema: number | null;
  cpu: NasCpu | null;
  memory: NasMemory | null;
  pools: NasPool[];
  movies: NasMovies | null;
  snapshots: NasSnapshotHold | null;
  disks: NasDisk[];
  services: NasServices | null;
  playback: NasPlayback | null;
  health: NasHealth | null;
}

export interface VpsSubscription {
  name: string | null;
  status: string | null;
  autoRenew: boolean | null;
  dueAt: string | null;
  dueKind: string | null;
  daysLeft: number | null;
  period: number | null;
  periodUnit: string | null;
  renewalPrice: number | null;
  currency: string | null;
}

export interface VpsBilling {
  at: number | null;
  error: string | null;
  vps: VpsSubscription | null;
  others: VpsSubscription[];
  fromCache: boolean;
  ageS: number | null;
}

export interface VpsLive {
  cpuPct: number | null;
  cores: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  memPct: number | null;
  memTotalGb: number | null;
  memFreeGb: number | null;
  diskPct: number | null;
  diskTotalGb: number | null;
  diskFreeGb: number | null;
  uptimeS: number | null;
  state: string | null;
  stateFrom: string | null;
  reachable: boolean | null;
  stealPct: number | null;
  throttled: boolean | null;
  conditions: string[];
  containers: number | null;
  running: number | null;
  ageS: number | null;
  stale: boolean | null;
  planName: string | null;
  vcpus: number | null;
  planRamMb: number | null;
  planDiskMb: number | null;
  hostname: string | null;
  billing: VpsBilling | null;
}

export interface NasStatsEnvelope {
  online: boolean;
  reason: NasOfflineReason | null;
  at: number | null;
  ageS: number | null;
  lastSeenAt: number | null;
  snapshot: NasSnapshot | null;
  vpsLive: VpsLive | null;
}

export interface HistoryPoint {
  t: number;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  steal: number | null;
}

export interface StatsHistoryEnvelope {
  range: HistoryRange;
  at: number | null;
  nasOnline: boolean;
  nasReason: string | null;
  nasStepS: number | null;
  nas: HistoryPoint[];
  vpsStepS: number | null;
  vps: HistoryPoint[];
}

export interface NasFilesStatus {
  configured: boolean;
  reachable: boolean;
  reason: string | null;
  root: string | null;
}

const UNKNOWN: NasOfflineReason = 'unknown';

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

function bool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function list<T>(v: unknown, parse: (m: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const e of v) {
    const m = obj(e);
    if (m) out.push(parse(m));
  }
  return out;
}

function pressure(v: unknown): MemoryPressure {
  const s = str(v);
  if (s === 'ok' || s === 'low' || s === 'critical') return s;
  return 'unknown';
}

function reason(v: unknown): NasOfflineReason {
  const s = str(v);
  if (
    s === 'unreachable' ||
    s === 'timeout' ||
    s === 'auth' ||
    s === 'not_configured' ||
    s === 'bad_payload'
  ) {
    return s;
  }
  return UNKNOWN;
}

function parseCpu(m: Record<string, unknown>): NasCpu {
  return {
    cores: int(m.cores),
    pct: num(m.pct),
    load1: num(m.load1),
    load5: num(m.load5),
    load15: num(m.load15),
  };
}

function parseMemory(m: Record<string, unknown>): NasMemory {
  return {
    totalMb: int(m.total_mb),
    availableMb: int(m.available_mb),
    freeMb: int(m.free_mb),
    arcMb: int(m.arc_mb),
    arcCapMb: int(m.arc_cap_mb),
    pressure: pressure(m.pressure),
  };
}

function parsePool(m: Record<string, unknown>): NasPool {
  return {
    name: str(m.name),
    health: str(m.health),
    sizeBytes: int(m.size_bytes),
    usedBytes: int(m.used_bytes),
    freeBytes: int(m.free_bytes),
    usedPct: int(m.used_pct),
    role: str(m.role),
  };
}

function parseMovies(m: Record<string, unknown>): NasMovies {
  return {
    dataset: str(m.dataset),
    path: str(m.path),
    usedBytes: int(m.used_bytes),
    availBytes: int(m.avail_bytes),
    referBytes: int(m.refer_bytes),
    headlineFreeGb: int(m.headline_free_gb),
    note: str(m.note),
  };
}

function parseHold(m: Record<string, unknown>): NasSnapshotHold {
  return {
    countStorage: int(m.count_storage),
    heldBytes: int(m.held_bytes),
  };
}

function parseDisk(m: Record<string, unknown>): NasDisk {
  return {
    name: str(m.name),
    role: str(m.role),
    tempC: int(m.temp_c),
    ok: bool(m.ok),
  };
}

function parseServices(m: Record<string, unknown>): NasServices {
  return {
    jellyfin: bool(m.jellyfin),
    nextcloud: bool(m.nextcloud),
    caddy: bool(m.caddy),
    smb: bool(m.smb),
    mediaWatch: bool(m.media_watch),
    liveTv: str(m.livetv),
  };
}

function parsePlaybackItem(m: Record<string, unknown>): NasPlaybackItem {
  return {
    title: str(m.title),
    where: str(m.where),
    method: str(m.method),
  };
}

function parsePlayback(m: Record<string, unknown>): NasPlayback {
  return {
    count: int(m.count),
    items: list(m.items, parsePlaybackItem),
  };
}

function parseHealth(m: Record<string, unknown>): NasHealth {
  return {
    stagesOk: int(m.stages_ok),
    stagesTotal: int(m.stages_total),
    failing: Array.isArray(m.failing)
      ? m.failing.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

export function parseSnapshot(m: Record<string, unknown>): NasSnapshot {
  const cpu = obj(m.cpu);
  const memory = obj(m.memory);
  const movies = obj(m.movies);
  const snaps = obj(m.snapshots);
  const services = obj(m.services);
  const playback = obj(m.playback);
  const health = obj(m.health);
  return {
    at: int(m.at),
    host: str(m.host),
    version: str(m.version),
    uptimeS: int(m.uptime_s),
    schema: int(m.api),
    cpu: cpu ? parseCpu(cpu) : null,
    memory: memory ? parseMemory(memory) : null,
    pools: list(m.pools, parsePool),
    movies: movies ? parseMovies(movies) : null,
    snapshots: snaps ? parseHold(snaps) : null,
    disks: list(m.disks, parseDisk),
    services: services ? parseServices(services) : null,
    playback: playback ? parsePlayback(playback) : null,
    health: health ? parseHealth(health) : null,
  };
}

function parseSub(m: Record<string, unknown>): VpsSubscription {
  return {
    name: str(m.name),
    status: str(m.status),
    autoRenew: bool(m.auto_renew),
    dueAt: str(m.due_at),
    dueKind: str(m.due_kind),
    daysLeft: int(m.days_left),
    period: int(m.period),
    periodUnit: str(m.period_unit),
    renewalPrice: int(m.renewal_price),
    currency: str(m.currency),
  };
}

function parseBilling(m: Record<string, unknown>): VpsBilling {
  const vps = obj(m.vps);
  return {
    at: int(m.at),
    error: str(m.error),
    vps: vps ? parseSub(vps) : null,
    others: list(m.others, parseSub),
    fromCache: bool(m.from_cache) ?? false,
    ageS: int(m.age_s),
  };
}

export function parseVpsLive(m: Record<string, unknown>): VpsLive {
  const billing = obj(m.billing);
  return {
    cpuPct: num(m.cpu_pct),
    cores: int(m.cores),
    load1: num(m.load1),
    load5: num(m.load5),
    load15: num(m.load15),
    memPct: num(m.mem_pct),
    memTotalGb: num(m.mem_total_gb),
    memFreeGb: num(m.mem_free_gb),
    diskPct: num(m.disk_pct),
    diskTotalGb: num(m.disk_total_gb),
    diskFreeGb: num(m.disk_free_gb),
    uptimeS: int(m.uptime_s),
    state: str(m.state),
    stateFrom: str(m.state_from),
    reachable: bool(m.reachable),
    stealPct: num(m.steal_pct),
    throttled: bool(m.throttled),
    conditions: Array.isArray(m.conditions)
      ? m.conditions.filter((x): x is string => typeof x === 'string')
      : [],
    containers: int(m.containers),
    running: int(m.running),
    ageS: int(m.vps_age_s),
    stale: bool(m.vps_stale),
    planName: str(m.plan_name),
    vcpus: int(m.vcpus),
    planRamMb: int(m.plan_ram_mb),
    planDiskMb: int(m.plan_disk_mb),
    hostname: str(m.hostname),
    billing: billing ? parseBilling(billing) : null,
  };
}

export function parseEnvelope(raw: unknown): NasStatsEnvelope {
  const m = obj(raw) ?? {};
  const online = bool(m.online) ?? false;
  const snap = obj(m.snapshot);
  const vps = obj(m.vps_live);
  return {
    online,
    reason: online ? null : reason(m.reason),
    at: int(m.at),
    ageS: int(m.age_s),
    lastSeenAt: int(m.last_seen_at),
    snapshot: online && snap ? parseSnapshot(snap) : null,
    vpsLive: vps ? parseVpsLive(vps) : null,
  };
}

function parsePoint(m: Record<string, unknown>): HistoryPoint {
  return {
    t: int(m.t) ?? 0,
    cpu: num(m.cpu),
    mem: num(m.mem),
    disk: num(m.disk),
    steal: num(m.steal),
  };
}

export function parseHistory(raw: unknown): StatsHistoryEnvelope {
  const m = obj(raw) ?? {};
  const rangeRaw = str(m.range);
  const range: HistoryRange =
    rangeRaw === '7d' || rangeRaw === '30d' || rangeRaw === 'now' ? rangeRaw : 'now';
  const nas = obj(m.nas);
  const vps = obj(m.vps);
  return {
    range,
    at: int(m.at),
    nasOnline: nas ? bool(nas.online) === true : false,
    nasReason: nas ? str(nas.reason) : null,
    nasStepS: nas ? num(nas.step_s) : null,
    nas: nas ? list(nas.points, parsePoint) : [],
    vpsStepS: vps ? num(vps.step_s) : null,
    vps: vps ? list(vps.points, parsePoint) : [],
  };
}

export function emptyHistory(range: HistoryRange): StatsHistoryEnvelope {
  return {
    range,
    at: null,
    nasOnline: false,
    nasReason: null,
    nasStepS: null,
    nas: [],
    vpsStepS: null,
    vps: [],
  };
}

export async function fetchStats(): Promise<NasStatsEnvelope> {
  const { data } = await api.get('/cloud/stats');
  return parseEnvelope(data);
}

export async function fetchHistory(range: HistoryRange): Promise<StatsHistoryEnvelope> {
  try {
    const { data } = await api.get('/cloud/stats/history', { params: { range } });
    return parseHistory(data);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return emptyHistory(range);
    }
    throw err;
  }
}

export async function fetchNasFilesStatus(): Promise<NasFilesStatus> {
  const { data } = await api.get('/cloud/nas/status');
  const m = obj(data) ?? {};
  return {
    configured: bool(m.configured) ?? false,
    reachable: bool(m.reachable) ?? false,
    reason: str(m.reason),
    root: str(m.root),
  };
}

export function memUsedPct(memory: NasMemory | null | undefined): number | null {
  const t = memory?.totalMb;
  const a = memory?.availableMb;
  if (t == null || a == null || t <= 0) return null;
  return Math.max(0, Math.min(100, ((t - a) / t) * 100));
}

export function moviesUsedPct(movies: NasMovies | null | undefined): number | null {
  const u = movies?.usedBytes;
  const a = movies?.availBytes;
  if (u == null || a == null) return null;
  const total = u + a;
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, (u / total) * 100));
}

export function mainPool(snapshot: NasSnapshot | null | undefined): NasPool | null {
  if (!snapshot?.pools.length) return null;
  return snapshot.pools.find((p) => p.role === 'main') ?? snapshot.pools[0];
}

export function backupPool(snapshot: NasSnapshot | null | undefined): NasPool | null {
  return snapshot?.pools.find((p) => p.role === 'backup_usb') ?? null;
}

export function loadPerCore(cpu: NasCpu | null | undefined): number | null {
  const c = cpu?.cores;
  const l = cpu?.load1;
  if (c == null || c <= 0 || l == null) return null;
  return l / c;
}

export function holdIsMeaningful(hold: NasSnapshotHold | null | undefined): boolean {
  return (hold?.heldBytes ?? 0) > 1024 * 1024 * 1024;
}

export function holdGb(hold: NasSnapshotHold | null | undefined): number {
  return (hold?.heldBytes ?? 0) / (1024 * 1024 * 1024);
}

export const OFFLINE_MESSAGE: Record<NasOfflineReason, string> = {
  unreachable: 'Your NAS is switched off or off the network.',
  timeout: 'Your NAS is not responding right now.',
  auth: 'The server was refused by your NAS. Its status token needs updating.',
  not_configured: 'Live stats are not configured on the server yet.',
  bad_payload: 'Your NAS sent a reading that could not be read.',
  unknown: 'Live stats are unavailable right now.',
};

export const METRIC_META: Record<
  StatMetric,
  { label: string; host: 'NAS' | 'VPS'; field: keyof HistoryPoint }
> = {
  nasCpu: { label: 'CPU', host: 'NAS', field: 'cpu' },
  nasRam: { label: 'RAM', host: 'NAS', field: 'mem' },
  nasDisk: { label: 'DISK', host: 'NAS', field: 'disk' },
  vpsCpu: { label: 'CPU', host: 'VPS', field: 'cpu' },
  vpsRam: { label: 'RAM', host: 'VPS', field: 'mem' },
  vpsDisk: { label: 'DISK', host: 'VPS', field: 'disk' },
  vpsSteal: { label: 'STEAL', host: 'VPS', field: 'steal' },
};
