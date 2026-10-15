<script lang="ts">
  import { encodeRecordQr, type FormDef, type ScoutRecord } from '@stingr/shared';
  import QRCode from 'qrcode';
  import { recordTitle } from '../lib/session';
  import type { AppStore } from '../lib/store.svelte';

  let { store, id }: { store: AppStore; id: string } = $props();

  let local = $derived(store.records.find(r => r.id === id) ?? null);
  let codes = $state<{ text: string; svg: string }[]>([]);
  let part = $state(0);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!local) return;
    const rec = $state.snapshot(local.rec) as ScoutRecord;
    const form = store.formOf(rec);
    if (!form) {
      error = `Form version ${rec.formVersion} isn't on this tablet, so this record can't be shown as a QR code.`;
      return;
    }
    let cancelled = false;
    encodeRecordQr($state.snapshot(form) as FormDef, rec)
      .then(chunks => Promise.all(chunks.map(async text => ({ text, svg: await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }) }))))
      .then(
        made => { if (!cancelled) { codes = made; part = 0; } },
        e => { if (!cancelled) error = (e as Error).message; },
      );
    return () => { cancelled = true; };
  });
</script>

<section>
  <header class="bar">
    <h1>{local ? recordTitle(local.rec) : 'Record'}</h1>
    <button type="button" onclick={() => store.go({ name: 'records' })}>Back</button>
  </header>
  {#if error}
    <p class="error">{error}</p>
  {:else if codes.length}
    <div class="qr" data-qr-text={codes[part].text}>{@html codes[part].svg}</div>
    {#if codes.length > 1}
      <div class="nav">
        <button type="button" disabled={part === 0} onclick={() => part--}>‹ Previous</button>
        <span>Code {part + 1} of {codes.length}</span>
        <button type="button" disabled={part === codes.length - 1} onclick={() => part++}>Next ›</button>
      </div>
    {/if}
    <p>Scan {codes.length > 1 ? 'each code' : 'this code'} with the hub's QR scanner.</p>
  {:else}
    <p>Making QR code…</p>
  {/if}
</section>
