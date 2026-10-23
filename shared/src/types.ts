export type FormKind = 'match' | 'pit';
export type Slot = 'red1' | 'red2' | 'red3' | 'blue1' | 'blue2' | 'blue3';
export const SLOTS: Slot[] = ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'];
export type Side = 'left' | 'right';
export type SummaryKind = 'avg' | 'pct' | 'distribution' | 'list' | 'scatter' | 'size' | 'none';
export type DimPart = 'length' | 'width' | 'height';
/** Measurements in inches; a part not measured (yet) is left out. */
export type Dimensions = Partial<Record<DimPart, number>>;

interface QuestionBase {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  summary?: SummaryKind;
}
export interface ChoiceOption { value: string; label: string; points?: number }

export interface CounterQuestion extends QuestionBase { type: 'counter'; min: number; max?: number; step: number; default: number; points?: number }
/** A default is the answer a question starts with; without one it starts unanswered. */
export interface ToggleQuestion extends QuestionBase { type: 'toggle'; default?: boolean; points?: number }
export interface ChoiceQuestion extends QuestionBase { type: 'choice'; options: ChoiceOption[]; display: 'buttons' | 'dropdown'; default?: string }
export interface MultiQuestion extends QuestionBase { type: 'multi'; options: { value: string; label: string }[] }
export interface NumberQuestion extends QuestionBase { type: 'number'; min?: number; max?: number; integer: boolean; default?: number }
export interface TextQuestion extends QuestionBase { type: 'text'; multiline: boolean }
export interface RatingQuestion extends QuestionBase { type: 'rating'; max: number; default?: number }
export interface TimerQuestion extends QuestionBase { type: 'timer' }
export interface FieldMapQuestion extends QuestionBase { type: 'fieldmap'; assetId: string; maxPoints: number; redSide: Side }
/** A robot's size, entered in feet and inches: the measurements asked, in the order length, width, height. */
export interface DimensionsQuestion extends QuestionBase { type: 'dimensions'; parts: DimPart[] }

export type Question =
  | CounterQuestion | ToggleQuestion | ChoiceQuestion | MultiQuestion | NumberQuestion
  | TextQuestion | RatingQuestion | TimerQuestion | FieldMapQuestion | DimensionsQuestion;
export type QuestionType = Question['type'];

export interface Section { id: string; title: string; questions: Question[] }
export interface FormDef {
  kind: FormKind;
  version: number;
  sections: Section[];
  /** assetId → image data URL (field map images) */
  assets: Record<string, string>;
}

export interface Point { x: number; y: number }
/** counter/number/rating/timer → number; toggle → boolean; choice/text → string; multi → string[]; fieldmap → Point[] */
export type AnswerValue = number | boolean | string | string[] | Point[] | Dimensions | null;
export type Answers = Record<string, AnswerValue>;

export interface ScoutRecord {
  id: string;
  revision: number;
  kind: FormKind;
  eventKey: string;
  formVersion: number;
  matchKey?: string;
  slot?: Slot;
  team: number;
  scout: string;
  deviceId: string;
  noShow: boolean;
  answers: Answers;
  missed: string[];
  photoIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EventInfo { key: string; name: string; redSide?: Side }
export interface ScheduleMatch { matchKey: string; red: [number, number, number]; blue: [number, number, number] }
export interface DeviceInfo { id: string; name: string }

export interface HubConfig {
  /** Created once per hub database; tablets only follow deletions from the hub they last synced with. */
  hubId: string;
  /** Changes when the hub starts a new season. */
  seasonId: string;
  /** Every event on the hub, so tablets can drop synced records of deleted ones. */
  eventKeys: string[];
  /** Each event's instance id, new each time an event is set up; a record made for a deleted instance is refused. */
  eventInstances: Record<string, string>;
  event: EventInfo | null;
  forms: FormDef[];
  schedule: ScheduleMatch[];
  teams: number[];
  /** Names of the event's teams that have one (team number → name). */
  teamNames: Record<number, string>;
  appBuild: string;
}
export interface SyncRequest {
  device: DeviceInfo;
  records: ScoutRecord[];
  /** record id → the instance of its event it was made under, when the tablet knows it */
  eventInstances?: Record<string, string>;
}
export interface RecordRef { id: string; revision: number }
export interface SyncResponse {
  acked: RecordRef[];
  rejected: (RecordRef & { reason: string })[];
  wantedPhotoIds: string[];
  config: HubConfig;
}

/** An alliance-level item for this year's game (e.g. balls in a shared hopper), recorded per match per alliance. */
export interface AllianceField { key: string; label: string; /** The Blue Alliance score-breakdown item it is filled from */ tba?: string }
export type AllianceSide = 'red' | 'blue';
/** One recorded value: typed on the hub, or from The Blue Alliance (a typed value is never overwritten by TBA). */
export interface AllianceEntry { value: number; source: 'manual' | 'tba' }
/** A match's results: the alliances' teams, and values by item ('score' or a field key). */
export interface AllianceMatch {
  matchKey: string;
  red: { teams: number[]; values: Record<string, AllianceEntry> };
  blue: { teams: number[]; values: Record<string, AllianceEntry> };
}
