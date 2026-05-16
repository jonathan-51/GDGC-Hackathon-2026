import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onResult: (text: string) => void;
  onError?: (msg: string) => void;
}

export default function QRScanner({ onResult, onError }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'matched' | 'error'>('starting');

  useEffect(() => {
    if (!elRef.current) return;
    const id = 'qr-scanner-region';
    elRef.current.id = id;

    const scanner = new Html5Qrcode(id, { verbose: false });
    let cancelled = false;
    let started = false;
    let handled = false;
    let startPromise: Promise<void> | null = null;

    const onScan = (decodedText: string) => {
      if (handled || cancelled) return;
      handled = true;
      console.log('[QRScanner] decoded', decodedText);
      setStatus('matched');
      // Defer to escape the html5-qrcode worker callback context.
      setTimeout(() => onResult(decodedText), 0);
    };

    const tryStart = async () => {
      // html5-qrcode requires `facingMode` to be a string or `{ exact: ... }`,
      // not `{ ideal: ... }`. We try the rear camera first, then any user-facing
      // camera, then fall back to enumerating devices and picking the first one
      // (handles laptops where neither facingMode hint matches).
      const attempt = async (cameraIdOrConfig: string | MediaTrackConstraints) => {
        if (cancelled) return false;
        try {
          await scanner.start(
            cameraIdOrConfig,
            { fps: 10, qrbox: { width: 240, height: 240 } },
            onScan,
            () => undefined,
          );
          started = true;
          if (cancelled) {
            try { await scanner.stop(); } catch { /* ignore */ }
            return true;
          }
          setStatus('scanning');
          return true;
        } catch (e) {
          console.warn('[QRScanner] start failed for', cameraIdOrConfig, e);
          return false;
        }
      };

      // 1. Try rear camera, 2. any user-facing camera, 3. enumerate and grab
      // whatever the OS reports first (laptops often expose no facingMode).
      if (await attempt({ facingMode: 'environment' })) return;
      if (await attempt({ facingMode: 'user' })) return;
      try {
        const cams = await Html5Qrcode.getCameras();
        console.log('[QRScanner] available cameras', cams);
        for (const c of cams) {
          if (await attempt(c.id)) return;
          if (cancelled) return;
        }
      } catch (e) {
        console.warn('[QRScanner] getCameras failed', e);
      }
      if (!cancelled) {
        setStatus('error');
        onError?.('No usable camera found.');
      }
    };

    startPromise = tryStart();

    return () => {
      cancelled = true;
      // Wait for the start to finish (or fail) before tearing down — html5-qrcode
      // throws "Cannot transition to a new state, already under transition" if
      // stop() races with start().
      (async () => {
        try { await startPromise; } catch { /* ignore */ }
        if (started) {
          try { await scanner.stop(); } catch { /* ignore */ }
        }
        try { scanner.clear(); } catch { /* ignore */ }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="rounded-2xl overflow-hidden border border-cyan-electric/30 bg-black aspect-square max-w-md mx-auto relative">
        <div ref={elRef} className="w-full h-full" />
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-cyan-electric font-mono text-sm animate-pulse pointer-events-none">
            Starting camera…
          </div>
        )}
        {status === 'matched' && (
          <div className="absolute inset-0 bg-cyan-electric/10 flex items-center justify-center text-cyan-electric font-mono pointer-events-none">
            ✓ Scanned
          </div>
        )}
      </div>
      <p className="text-center text-xs font-mono text-slate-500">
        {status === 'starting' && 'requesting camera…'}
        {status === 'scanning' && 'point at a Vouch QR'}
        {status === 'matched' && 'processing…'}
        {status === 'error' && 'camera unavailable'}
      </p>
    </div>
  );
}
