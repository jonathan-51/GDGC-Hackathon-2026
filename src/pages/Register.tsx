import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import {
  getFaceEmbedding,
  hashEmbedding,
  loadFaceModels,
  loadPassport,
  savePassport,
  clearPassport,
  type StoredPassport,
} from '../lib/biometric';

type Stage = 'idle' | 'loading-models' | 'camera-on' | 'capturing' | 'no-face' | 'done';

export default function Register() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [passport, setPassport] = useState<StoredPassport | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const existing = loadPassport();
    if (existing) {
      setPassport(existing);
      setStage('done');
    }
  }, []);

  useEffect(() => {
    if (!passport) {
      setQrDataUrl(null);
      return;
    }
    const payload = JSON.stringify({ h: passport.handle, id: passport.hash });
    QRCode.toDataURL(payload, {
      width: 320,
      margin: 1,
      color: { dark: '#0a0e27', light: '#00ffd1' },
    }).then(setQrDataUrl);
  }, [passport]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setError(null);
    setStage('loading-models');
    try {
      await loadFaceModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStage('camera-on');
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : 'Could not access camera. Grant permission and try again.',
      );
      setStage('idle');
    }
  }

  async function capture() {
    if (!videoRef.current || !handle.trim()) return;
    setStage('capturing');
    try {
      const embedding = await getFaceEmbedding(videoRef.current);
      if (!embedding) {
        setStage('no-face');
        return;
      }
      const hash = await hashEmbedding(embedding);
      const newPassport: StoredPassport = {
        handle: handle.trim(),
        hash,
        embedding: Array.from(embedding),
        createdAt: Date.now(),
      };
      savePassport(newPassport);
      setPassport(newPassport);
      stopCamera();
      setStage('done');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Capture failed.');
      setStage('camera-on');
    }
  }

  function reset() {
    clearPassport();
    setPassport(null);
    setHandle('');
    setStage('idle');
    setError(null);
  }

  if (stage === 'done' && passport) {
    return <PassportView passport={passport} qrDataUrl={qrDataUrl} onReset={reset} />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="space-y-2">
        <h2 className="text-4xl font-mono font-bold text-cyan-electric">
          Generate Your Card
        </h2>
        <p className="text-slate-400">
          Your face becomes your passport. The embedding is hashed locally — no
          photo, no server. The hash + your handle become a printable QR code.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm font-mono">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-mono text-slate-400 uppercase tracking-widest">
          Handle
        </label>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="e.g. red-fox-42"
          maxLength={32}
          disabled={stage === 'capturing'}
          className="w-full bg-navy-deep border border-cyan-electric/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-cyan-electric focus:shadow-glow transition"
        />
      </div>

      <div className="rounded-2xl border border-cyan-electric/20 bg-navy-deep/60 overflow-hidden">
        <div className="aspect-[4/3] bg-black flex items-center justify-center relative">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${stage === 'camera-on' || stage === 'capturing' || stage === 'no-face' ? 'block' : 'hidden'}`}
          />
          {stage === 'idle' && (
            <span className="text-slate-500 font-mono text-sm">Camera off</span>
          )}
          {stage === 'loading-models' && (
            <span className="text-cyan-electric font-mono text-sm animate-pulse">
              Loading face models…
            </span>
          )}
          {(stage === 'camera-on' || stage === 'capturing' || stage === 'no-face') && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-72 border-2 border-cyan-electric/60 rounded-[50%] shadow-glow" />
            </div>
          )}
          {stage === 'capturing' && (
            <div className="absolute inset-0 bg-cyan-electric/10 flex items-center justify-center">
              <span className="text-cyan-electric font-mono animate-pulse">
                Computing embedding…
              </span>
            </div>
          )}
        </div>

        <div className="p-4 flex flex-wrap gap-3 justify-between items-center">
          {stage === 'idle' && (
            <button
              onClick={startCamera}
              className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition"
            >
              Enable Camera
            </button>
          )}
          {stage === 'loading-models' && (
            <span className="text-slate-400 font-mono text-sm">Please wait…</span>
          )}
          {(stage === 'camera-on' || stage === 'no-face') && (
            <>
              <button
                onClick={capture}
                disabled={!handle.trim()}
                className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-glow transition"
              >
                Capture Face
              </button>
              <button
                onClick={() => {
                  stopCamera();
                  setStage('idle');
                }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-cyan-electric transition"
              >
                Cancel
              </button>
            </>
          )}
          {stage === 'capturing' && (
            <span className="text-cyan-electric font-mono text-sm">Working…</span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {stage === 'no-face' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 px-4 py-3 text-sm font-mono"
          >
            No face detected. Center your face inside the oval and try again.
          </motion.div>
        )}
      </AnimatePresence>

      <aside className="text-xs text-slate-500 font-mono leading-relaxed border-t border-cyan-electric/10 pt-4">
        Liveness check (blink / head-turn) stubbed — production would gate
        capture on a randomized gesture to defeat photo-replay attacks.
      </aside>
    </div>
  );
}

function PassportView({
  passport,
  qrDataUrl,
  onReset,
}: {
  passport: StoredPassport;
  qrDataUrl: string | null;
  onReset: () => void;
}) {
  const short = passport.hash.slice(0, 12).match(/.{1,4}/g)?.join(' ') ?? passport.hash;
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="space-y-2 text-center">
        <h2 className="text-4xl font-mono font-bold text-cyan-electric">
          Your Vouch Card
        </h2>
        <p className="text-slate-400">
          Print it. Tattoo it. Stick it on your jacket. This QR is your identity.
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-cyan-electric/30 bg-navy-deep p-8 shadow-glow"
      >
        <div className="flex flex-col items-center gap-6">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Your Vouch QR"
              className="w-72 h-72 rounded-lg"
            />
          ) : (
            <div className="w-72 h-72 flex items-center justify-center text-slate-500 font-mono">
              Rendering…
            </div>
          )}
          <div className="text-center space-y-1">
            <div className="text-2xl font-mono text-cyan-electric">
              @{passport.handle}
            </div>
            <div className="text-xs text-slate-500 font-mono">
              {short}…
            </div>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-wrap gap-3 justify-center">
        {qrDataUrl && (
          <a
            href={qrDataUrl}
            download={`vouch-${passport.handle}.png`}
            className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition"
          >
            Download QR
          </a>
        )}
        <button
          onClick={onReset}
          className="px-6 py-2.5 rounded-full border border-cyan-electric/40 text-cyan-electric font-mono hover:bg-cyan-electric/10 transition"
        >
          Re-register
        </button>
      </div>

      <aside className="text-xs text-slate-500 font-mono leading-relaxed border-t border-cyan-electric/10 pt-4 text-center">
        Embedding stored in this browser only. Re-scan computes a new embedding
        and matches by Euclidean distance.
      </aside>
    </div>
  );
}
