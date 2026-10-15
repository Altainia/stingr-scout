import jsQR from 'jsqr';

/** True when this text was seen less than windowMs ago. Every sighting refreshes the time. */
export function createRepeatFilter(windowMs = 3000): (text: string, now: number) => boolean {
  const lastSeen = new Map<string, number>();
  return (text, now) => {
    const last = lastSeen.get(text);
    lastSeen.set(text, now);
    return last !== undefined && now - last < windowMs;
  };
}

/** Open the camera into `video` and report every QR code seen. Returns a function that stops it. */
export async function startScanner(video: HTMLVideoElement, onText: (text: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
  video.srcObject = stream;
  await video.play();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let running = true;
  let frame = 0;
  const loop = () => {
    if (!running) return;
    if (ctx && video.readyState >= 2 && frame++ % 3 === 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code?.data) onText(code.data);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => {
    running = false;
    for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
  };
}
