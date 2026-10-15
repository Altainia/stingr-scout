import type { SyncHandle } from './syncController';

export interface UpdateOptions {
  currentBuild: string;
  sync: Pick<SyncHandle, 'subscribe'>;
  isSafe: () => boolean;
  intervalMs?: number;
  /** The browser's service-worker API; tests pass a stand-in. */
  container?: Pick<ServiceWorkerContainer, 'controller' | 'register' | 'addEventListener'>;
}

/**
 * Register the service worker. When the hub reports a different app build, fetch the new worker;
 * once it has installed, switch to it only while nobody is filling in a form.
 */
export async function watchForUpdates(o: UpdateOptions): Promise<void> {
  const container = o.container ?? ('serviceWorker' in navigator ? navigator.serviceWorker : null);
  if (!container) return;
  const hadController = !!container.controller;
  let reg: ServiceWorkerRegistration;
  try {
    reg = await container.register('./sw.js');
  } catch {
    return; // e.g. the Vite dev server, which has no sw.js
  }

  let lastSeen: string | null = null;
  o.sync.subscribe(view => {
    if (view.phase === 'offline') {
      lastSeen = null; // check again on the next plug-in
      return;
    }
    if (!view.hubBuild || view.hubBuild === lastSeen) return;
    lastSeen = view.hubBuild;
    if (view.hubBuild !== o.currentBuild) {
      reg.update().catch(() => {
        lastSeen = null; // e.g. the cable was pulled mid-download; try again on the next change
      });
    }
  });

  let reloading = false;
  container.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // the very first install needs no reload
    reloading = true;
    location.reload();
  });

  setInterval(() => {
    if (reg.waiting && o.isSafe()) reg.waiting.postMessage('skipWaiting');
  }, o.intervalMs ?? 2000);
}
