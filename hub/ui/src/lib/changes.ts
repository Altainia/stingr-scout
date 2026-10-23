/**
 * Hub pages refresh when the hub says its data changed (a tablet sync, a QR scan, publishing a form, …), instead of
 * on a timer. One connection to /api/changes is shared by every subscriber and closed when nobody is listening.
 *
 * It is shared across tabs too: a browser opens at most 6 connections to one address, and a connection held open by
 * every hub tab (the hub opens a new tab each time it is started) left none for loading data. One tab holds the
 * connection (the Web Lock) and passes each change on to the others (a BroadcastChannel); when it closes, the next
 * waiting tab takes over.
 */
const QUIET_MS = 250; // a sync arrives in batches: wait for the burst to settle, then refresh once
const LOCK = 'stingr-hub-changes';

const subscribers = new Set<() => void>();
let source: EventSource | null = null;
let channel: BroadcastChannel | null = null;
let waiting: AbortController | null = null;
let release: (() => void) | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;

function notify() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    for (const fn of [...subscribers]) fn();
  }, QUIET_MS);
}

/** Opens the connection; changes go to this tab's subscribers and, when shared, to the other tabs. */
function connect() {
  source = new EventSource('/api/changes');
  source.onmessage = source.onopen = () => {
    channel?.postMessage('changed');
    notify();
  };
}

function start() {
  if (typeof BroadcastChannel === 'undefined' || typeof navigator === 'undefined' || !navigator.locks) {
    connect(); // no way to share it: this tab keeps its own
    return;
  }
  channel = new BroadcastChannel(LOCK);
  channel.onmessage = notify;
  waiting = new AbortController();
  navigator.locks
    .request(LOCK, { signal: waiting.signal }, () => new Promise<void>(resolve => {
      waiting = null;
      release = resolve;
      connect();
      notify(); // changes may have been missed while the connection changed hands
    }))
    .catch(() => {}); // stopped while waiting for its turn
}

function stop() {
  source?.close();
  source = null;
  channel?.close();
  channel = null;
  waiting?.abort();
  waiting = null;
  release?.();
  release = null;
  if (pending) clearTimeout(pending);
  pending = null;
}

/** Calls `fn` after the hub's data changes, and after reconnecting (to catch up). Returns a function that stops it. */
export function onHubChange(fn: () => void): () => void {
  subscribers.add(fn);
  if (subscribers.size === 1 && typeof EventSource !== 'undefined') start();
  return () => {
    if (!subscribers.delete(fn)) return;
    if (subscribers.size === 0) stop();
  };
}
