import type { SyncHandle } from './syncController';

export interface UpdateOptions {
  currentBuild: string;
  sync: Pick<SyncHandle, 'subscribe'>;
  isSafe: () => boolean;
  intervalMs?: number;
}

/**
 * Register the service worker. When the hub reports a different app build, fetch the new worker;
 * once it has installed, switch to it only while nobody is filling in a form.
 */
export async function watchForUpdates(o: UpdateOptions): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register('./sw.js');
  } catch {
    return; // e.g. the Vite dev server, which has no sw.js
  }

  let lastSeen: string | null = null;
  o.sync.subscribe(view => {
    if (!view.hubBuild || view.hubBuild === lastSeen) return;
    lastSeen = view.hubBuild;
    if (view.hubBuild !== o.currentBuild) void reg.update().catch(() => {});
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // the very first install needs no reload
    reloading = true;
    location.reload();
  });

  setInterval(() => {
    if (reg.waiting && o.isSafe()) reg.waiting.postMessage('skipWaiting');
  }, o.intervalMs ?? 2000);
}
