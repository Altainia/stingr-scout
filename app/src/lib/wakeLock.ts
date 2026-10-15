/** Keep the screen on while a form is open. Returns a function that lets it sleep again. */
export function keepScreenOn(): () => void {
  let lock: WakeLockSentinel | null = null;
  let active = true;
  const acquire = async () => {
    if (!active || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
    } catch {
      // Not allowed right now (e.g. battery saver); the screen may sleep.
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  void acquire();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release();
  };
}
