/**
 * Hub pages refresh when the hub says its data changed (a tablet sync, a QR scan, publishing a form, …), instead of
 * on a timer. One connection to /api/changes is shared by every subscriber and closed when nobody is listening.
 */
const QUIET_MS = 250; // a sync arrives in batches: wait for the burst to settle, then refresh once

const subscribers = new Set<() => void>();
let source: EventSource | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;

function notify() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    for (const fn of [...subscribers]) fn();
  }, QUIET_MS);
}

/** Calls `fn` after the hub's data changes, and after reconnecting (to catch up). Returns a function that stops it. */
export function onHubChange(fn: () => void): () => void {
  subscribers.add(fn);
  if (!source && typeof EventSource !== 'undefined') {
    source = new EventSource('/api/changes');
    source.onmessage = notify;
    source.onopen = notify;
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      source?.close();
      source = null;
      if (pending) clearTimeout(pending);
      pending = null;
    }
  };
}
