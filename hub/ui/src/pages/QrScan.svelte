<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Api, QrResult } from '../lib/api';
  import { recordLabel } from '../lib/format';
  import { createRepeatFilter, startScanner } from '../lib/qrScan';
  import { loadTeamNames } from '../lib/teamNames';

  /** scanner: how the camera is opened (tests pass a stand-in). */
  let { api, scanner = startScanner }: { api: Api; scanner?: typeof startScanner } = $props();
  type Entry = { id: number; text: string; kind: 'ok' | 'info' | 'bad' };

  let log = $state<Entry[]>([]);
  let pasted = $state('');
  let video = $state<HTMLVideoElement>();
  let running = $state(false);
  let cameraError = $state<string | null>(null);
  let stopCamera: (() => void) | null = null;
  const isRepeat = createRepeatFilter();
  let nextId = 0;
  let destroyed = false;
  let names: Record<number, string> = {};
  onMount(() => { void loadTeamNames(api).then(n => (names = n)); });

  function describe(r: QrResult): Omit<Entry, 'id'> {
    switch (r.status) {
      case 'stored': return { kind: 'ok', text: `Stored: ${recordLabel(r.record, names)}` };
      case 'duplicate': return { kind: 'info', text: `Already had: ${recordLabel(r.record, names)}` };
      case 'partial': return { kind: 'info', text: `Got part ${r.have} of ${r.total}. Keep scanning the other codes.` };
      case 'invalid': return { kind: 'bad', text: `Not stored: ${r.reason}` };
    }
  }

  async function submit(text: string) {
    try {
      const entry = describe(await api.qr(text));
      log = [{ ...entry, id: ++nextId }, ...log].slice(0, 50);
    } catch (e) {
      isRepeat.forget(text); // the hub didn't get it: let the camera send it again
      log = [{ id: ++nextId, kind: 'bad' as const, text: (e as Error).message }, ...log].slice(0, 50);
    }
  }

  async function submitPasted() {
    // Keep trailing spaces: base45 data can end with one.
    const text = pasted.replace(/^\s+/, '').replace(/[\r\n]+$/, '');
    pasted = '';
    if (text) await submit(text);
  }

  async function start() {
    cameraError = null;
    if (!navigator.mediaDevices?.getUserMedia || !video) {
      cameraError = "This browser can't use a camera here. Paste the QR text instead.";
      return;
    }
    try {
      const stopIt = await scanner(video, text => { if (!isRepeat(text, Date.now())) void submit(text); });
      if (destroyed) {
        stopIt(); // the page was left while the browser was still asking for the camera
        return;
      }
      stopCamera = stopIt;
      running = true;
    } catch (e) {
      cameraError = `Couldn't start the camera: ${(e as Error).message}`;
    }
  }

  function stop() {
    stopCamera?.();
    stopCamera = null;
    running = false;
  }

  onDestroy(() => {
    destroyed = true;
    stop();
  });
</script>

<h1>QR scanner</h1>
<p>For a tablet that can't be plugged in: on the tablet open Past records → Show QR, then hold it up to this laptop's camera.</p>

<section class="card">
  <h2>Camera</h2>
  <video class="camera" bind:this={video} muted playsinline></video>
  <div class="row">
    {#if running}
      <button type="button" onclick={stop}>Stop camera</button>
    {:else}
      <button type="button" class="primary" onclick={start}>Start camera</button>
    {/if}
  </div>
  {#if cameraError}<p class="banner warn" role="alert">{cameraError}</p>{/if}
</section>

<section class="card">
  <h2>Paste instead</h2>
  <p class="hint">If the camera can't read a code, scan it with a phone and paste the text here. It starts with ST1:.</p>
  <textarea aria-label="QR text" rows="3" value={pasted} oninput={e => (pasted = e.currentTarget.value)}></textarea>
  <button type="button" disabled={!pasted.trim()} onclick={submitPasted}>Submit</button>
</section>

<section class="card">
  <h2>Scanned</h2>
  {#if log.length === 0}<p class="muted">Nothing scanned yet.</p>{/if}
  <ul class="list scanlog" aria-label="Scan results">
    {#each log as e (e.id)}<li class={e.kind}>{e.text}</li>{/each}
  </ul>
</section>
