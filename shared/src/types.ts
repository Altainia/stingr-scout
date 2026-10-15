export type FormKind = 'match' | 'pit';
export type Slot = 'red1' | 'red2' | 'red3' | 'blue1' | 'blue2' | 'blue3';
export const SLOTS: Slot[] = ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'];
export type SummaryKind = 'avg' | 'pct' | 'distribution' | 'list' | 'scatter' | 'none';

interface QuestionBase {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  summary?: SummaryKind;
}
export interface ChoiceOption { value: string; label: string; points?: number }

export interface CounterQuestion extends QuestionBase { type: 'counter'; min: number; max?: number; step: number; default: number; points?: number }
export interface ToggleQuestion extends QuestionBase { type: 'toggle'; default: boolean; points?: number }
export interface ChoiceQuestion extends QuestionBase { type: 'choice'; options: ChoiceOption[]; display: 'buttons' | 'dropdown' }
export interface MultiQuestion extends QuestionBase { type: 'multi'; options: { value: string; label: string }[] }
export interface NumberQuestion extends QuestionBase { type: 'number'; min?: number; max?: number; integer: boolean }
export interface TextQuestion extends QuestionBase { type: 'text'; multiline: boolean }
export interface RatingQuestion extends QuestionBase { type: 'rating'; max: number }
export interface TimerQuestion extends QuestionBase { type: 'timer' }
export interface FieldMapQuestion extends QuestionBase { type: 'fieldmap'; assetId: string; maxPoints: number; mirrorForRed: boolean }

export type Question =
  | CounterQuestion | ToggleQuestion | ChoiceQuestion | MultiQuestion | NumberQuestion
  | TextQuestion | RatingQuestion | TimerQuestion | FieldMapQuestion;
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
export type AnswerValue = number | boolean | string | string[] | Point[] | null;
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

export interface EventInfo { key: string; name: string }
export interface ScheduleMatch { matchKey: string; red: [number, number, number]; blue: [number, number, number] }
export interface DeviceInfo { id: string; name: string }

export interface HubConfig {
  event: EventInfo | null;
  forms: FormDef[];
  schedule: ScheduleMatch[];
  teams: number[];
  appBuild: string;
}
export interface SyncRequest { device: DeviceInfo; records: ScoutRecord[] }
export interface RecordRef { id: string; revision: number }
export interface SyncResponse {
  acked: RecordRef[];
  rejected: (RecordRef & { reason: string })[];
  wantedPhotoIds: string[];
  config: HubConfig;
}
