import type { EventInfo, FormDef, FormKind, ScheduleMatch, ScoutRecord, Side } from '@stingr/shared';
import type { AdbStatus } from '../../../server/src/adb';
import type { CoverageRow } from '../../../server/src/coverage';
import type { EventCounts, SeasonCounts } from '../../../server/src/store/clear';
import type { DeviceRow } from '../../../server/src/store/devices';
import type { PublishResult } from '../../../server/src/store/forms';
import type { TeamSummary } from '../../../server/src/summaries';

export type { AdbStatus, CoverageRow, DeviceRow, EventCounts, PublishResult, SeasonCounts, TeamSummary };

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface EventsView { events: EventInfo[]; current: EventInfo | null }
export interface FormValidation { errors: string[]; warnings: string[] }
export interface DevicesView { adb: AdbStatus; devices: DeviceRow[] }
export interface TeamDetail {
  summary: TeamSummary;
  matchForm: FormDef | null;
  pitForm: FormDef | null;
  matchRecords: ScoutRecord[];
  pitRecords: ScoutRecord[];
}
export type QrResult =
  | { status: 'partial'; group: string; have: number; total: number }
  | { status: 'stored' | 'duplicate'; record: { id: string; revision: number; kind: FormKind; team: number; matchKey?: string; slot?: string; scout: string } }
  | { status: 'invalid'; reason: string };

type Http = (input: string, init?: RequestInit) => Promise<Response>;

export function createApi(http: Http = (input, init) => fetch(input, init)) {
  async function call<T>(method: string, path: string, body?: unknown, opts: { type?: string; accept?: number[] } = {}): Promise<T> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      const type = opts.type ?? 'application/json';
      init.headers = { 'content-type': type };
      init.body = type === 'application/json' ? JSON.stringify(body) : (body as BodyInit);
    }
    let res: Response;
    try {
      res = await http(path, init);
    } catch {
      throw new ApiError(0, "Can't reach the hub server. Is it still running?");
    }
    if (res.ok || opts.accept?.includes(res.status)) return (await res.json()) as T;
    let message = `The hub answered HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: unknown; errors?: unknown };
      if (typeof b.error === 'string') message = b.error;
      else if (Array.isArray(b.errors)) message = b.errors.join('\n');
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, message);
  }

  return {
    events: () => call<EventsView>('GET', '/api/events'),
    createEvent: (ev: { key: string; name?: string; redSide?: Side }) => call<EventsView>('POST', '/api/events', ev),
    setCurrentEvent: (key: string) => call<EventsView>('PUT', '/api/events/current', { key }),
    schedule: () => call<ScheduleMatch[]>('GET', '/api/schedule'),
    saveSchedule: (matches: ScheduleMatch[]) => call<ScheduleMatch[]>('PUT', '/api/schedule', matches),
    importScheduleCsv: (csv: string) =>
      call<{ matches: number } | { errors: string[] }>('POST', '/api/schedule/csv', csv, { type: 'text/csv', accept: [422] }),
    fetchTba: () => call<{ matches: number; teams: number; scheduleReplaced: boolean }>('POST', '/api/schedule/tba'),
    teams: () => call<number[]>('GET', '/api/teams'),
    addTeam: (team: number) => call<number[]>('POST', '/api/teams', { team }),
    removeTeam: (team: number) => call<number[]>('DELETE', `/api/teams/${team}`),
    teamNames: () => call<Record<number, string>>('GET', '/api/team-names'),
    setTeamName: (team: number, name: string) => call<Record<number, string>>('PUT', `/api/teams/${team}/name`, { name }),
    settings: () => call<{ tbaKeySet: boolean }>('GET', '/api/settings'),
    saveSettings: (s: { tbaKey: string }) => call<{ tbaKeySet: boolean }>('PUT', '/api/settings', s),
    forms: () => call<FormDef[]>('GET', '/api/forms'),
    draft: (kind: FormKind) => call<{ draft: FormDef | null; isDraft: boolean }>('GET', `/api/forms/${kind}/draft`),
    saveDraft: (kind: FormKind, form: FormDef) => call<FormValidation>('PUT', `/api/forms/${kind}/draft`, form),
    discardDraft: (kind: FormKind) => call<{ draft: FormDef | null; isDraft: boolean }>('DELETE', `/api/forms/${kind}/draft`),
    publish: (kind: FormKind) => call<PublishResult>('POST', `/api/forms/${kind}/publish`, undefined, { accept: [422] }),
    records: (kind: FormKind) => call<ScoutRecord[]>('GET', `/api/records?kind=${kind}`),
    history: (id: string) => call<ScoutRecord[]>('GET', `/api/records/${encodeURIComponent(id)}/history`),
    coverage: () => call<CoverageRow[]>('GET', '/api/coverage'),
    summaries: () => call<{ form: FormDef | null; summaries: TeamSummary[] }>('GET', '/api/summaries'),
    team: (team: number) => call<TeamDetail>('GET', `/api/summaries/${team}`),
    qr: (text: string) => call<QrResult>('POST', '/api/qr', { text }, { accept: [422] }),
    devices: () => call<DevicesView>('GET', '/api/devices'),
    restore: (file: Blob) => call<{ ok: true }>('POST', '/api/restore', file, { type: 'application/octet-stream' }),
    eventClearPreview: (key: string) => call<EventCounts>('GET', `/api/events/${encodeURIComponent(key)}/clear`),
    deleteEvent: (key: string, confirm: string) =>
      call<{ ok: true; backup: string | null; removed: EventCounts }>('POST', `/api/events/${encodeURIComponent(key)}/delete`, { confirm }),
    seasonClearPreview: () => call<SeasonCounts>('GET', '/api/season/clear'),
    newSeason: (confirm: string) => call<{ ok: true; backup: string | null; removed: SeasonCounts }>('POST', '/api/season/new', { confirm }),
  };
}

export type Api = ReturnType<typeof createApi>;
