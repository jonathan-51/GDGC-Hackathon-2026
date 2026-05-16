import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface Props {
  onResult: (text: string) => void;
  onError?: (msg: string) => void;
}

export default function QRScanner({ onResult, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const handledRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'matched' | 'error'>('starting');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        // Prefer rear camera; fall back to any available camera.
        let stream: MediaStream | null = null;
        const attempts: MediaStreamConstraints[] = [
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          { video: true, audio: false },
        ];
        for (const constraints of attempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            break;
          } catch { /* try next */ }
        }
        if (!stream) throw new Error('No camera found.');
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setStatus('scanning');
        requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          onError?.(e instanceof Error ? e.message : 'Camera unavailable.');
        }
      }
    }

    function tick() {
      if (cancelled || handledRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) { rafRef.current = requestAnimationFrame(tick); return; }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);

      const result = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
      if (result?.data) {
        handledRef.current = true;
        setStatus('matched');
        setTimeout(() => onResult(result.data), 0);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="rounded-2xl overflow-hidden border border-cyan-electric/30 bg-black aspect-square max-w-sm mx-auto relative w-full">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Corner-bracket viewfinder */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2/3 h-2/3 relative">
              <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyan-electric" />
              <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan-electric" />
              <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan-electric" />
              <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyan-electric" />
            </div>
          </div>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-cyan-electric font-mono text-sm animate-pulse pointer-events-none">
            Starting camera…
          </div>
        )}
        {status === 'matched' && (
          <div className="absolute inset-0 bg-cyan-electric/10 flex items-center justify-center text-cyan-electric font-mono text-lg pointer-events-none">
            ✓ Scanned
          </div>
        )}
      </div>
      <p className="text-center text-xs font-mono text-slate-500">
        {status === 'starting' && 'requesting camera…'}
        {status === 'scanning' && 'point at an Illume QR'}
        {status === 'matched' && 'processing…'}
        {status === 'error' && 'camera unavailable'}
      </p>
    </div>
  );
}
