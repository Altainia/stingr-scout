import type { SyncProgress, SyncResult } from './sync';

export type SyncPhase = 'offline' | 'syncing' | 'done' | 'error';

export interface SyncView {
  phase: SyncPhase;
  progress: SyncProgress;
  error: string | null;
  overlay: boolean;
  hubBuild: string | null;
}

export interface SyncHandle {
  readonly view: SyncView;
  subscribe(listener: (view: SyncView) => void): () => void;
  retry(): Promise<void>;
  dismiss(): void;
}

export interface SyncControllerDeps {
  ping(): Promise<{ appBuild: string } | null>;
  sync(onProgress: (p: SyncProgress) => void): Promise<SyncResult>;
  hasPending(): Promise<boolean>;
  onSynced(result: SyncResult): void | Promise<void>;
}

export class SyncController implements SyncHandle {
  view: SyncView = { phase: 'offline', progress: { done: 0, total: 0 }, error: null, overlay: false, hubBuild: null };
  private readonly deps: SyncControllerDeps;
  private readonly listeners = new Set<(view: SyncView) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(deps: SyncControllerDeps) {
    this.deps = deps;
  }

  subscribe(listener: (view: SyncView) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** One poll: notice the hub arriving or leaving, and sync when appropriate. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const hub = await this.deps.ping();
      if (!hub) {
        if (this.view.phase !== 'offline' || this.view.overlay) this.set({ phase: 'offline', overlay: false, error: null });
        return;
      }
      if (hub.appBuild !== this.view.hubBuild) this.set({ hubBuild: hub.appBuild });
      if (this.view.phase === 'offline' || (this.view.phase === 'done' && (await this.deps.hasPending()))) await this.run();
    } finally {
      this.busy = false;
    }
  }

  async retry(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.run();
    } finally {
      this.busy = false;
    }
  }

  dismiss(): void {
    if (this.view.phase !== 'syncing') this.set({ overlay: false });
  }

  start(intervalMs = 3000): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private set(patch: Partial<SyncView>): void {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener(this.view);
  }

  private async run(): Promise<void> {
    this.set({ phase: 'syncing', overlay: true, error: null, progress: { done: 0, total: 0 } });
    try {
      const result = await this.deps.sync(p => this.set({ progress: p }));
      await this.deps.onSynced(result);
      this.set({ phase: 'done' });
    } catch (e) {
      this.set({ phase: 'error', error: (e as Error).message });
    }
  }
}
