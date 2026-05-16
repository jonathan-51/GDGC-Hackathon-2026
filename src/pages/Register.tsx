import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { Link } from 'react-router-dom';
import {
  captureVideoFrame,
  clearPassport,
  detectBiometricType,
  getFaceEmbedding,
  hashEmbedding,
  loadFaceModels,
  loadPassport,
  savePassport,
  type StoredPassport,
} from '../lib/biometric';
import { platformAuthenticatorAvailable, registerPlatformBiometric, identifyHardwareWitness } from '../lib/webauthn';
import HardwareWitnessBox from '../components/HardwareWitnessBox';
import { supabase } from '../lib/supabase';

type Stage = 'idle' | 'loading-models' | 'camera-on' | 'capturing' | 'no-face' | 'webauthn' | 'syncing' | 'done';

export default function Register() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [passport, setPassport] = useState<StoredPassport | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [platformAvailable, setPlatformAvailable] = useState(false);

  useEffect(() => {
    const existing = loadPassport();
    if (existing) {
      setPassport(existing);
      setStage('done');
    }
    platformAuthenticatorAvailable().then(setPlatformAvailable);
  }, []);

  useEffect(() => {
    if (!passport) {
      setQrDataUrl(null);
      return;
    }
    const payload = JSON.stringify({
      h: passport.handle,
      id: passport.hash,
      pid: passport.profileId,
    });
    QRCode.toDataURL(payload, {
      width: 320,
      margin: 1,
      color: { dark: '#0a0e27', light: '#00ffd1' },
    }).then(setQrDataUrl);
  }, [passport]);

  useEffect(() => () => stopCamera(), []);

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
      setError(e instanceof Error ? e.message : 'Could not access camera.');
      setStage('idle');
    }
  }

  async function finalize(input: {
    hash: string;
    embedding: number[];
    source: 'face' | 'platform';
    photo?: string;
    credentialId?: string;
    biometricType?: string;
  }) {
    setStage('syncing');
    const trimmed = handle.trim();
    try {
      const { data: profile, error: dbError } = await supabase
        .from('profiles')
        .upsert(
          {
            handle: trimmed,
            face_hash: input.hash,
            face_embedding: input.embedding,
            ...(input.photo ? { photo: input.photo } : {}),
          },
          { onConflict: 'handle' },
        )
        .select()
        .single();
      if (dbError) throw dbError;

      const newPassport: StoredPassport = {
        profileId: profile.id,
        source: input.source,
        handle: profile.handle,
        hash: input.hash,
        credentialId: input.credentialId,
        biometricType: input.biometricType,
        embedding: input.embedding,
        photo: input.photo,
        createdAt: Date.now(),
      };
      savePassport(newPassport);
      setPassport(newPassport);
      stopCamera();
      setStage('done');
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Sync to Supabase failed.';
      setError(`${msg}. Check that the schema has been applied.`);
      setStage(input.source === 'face' ? 'camera-on' : 'idle');
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
      const photo = captureVideoFrame(videoRef.current) ?? undefined;
      await finalize({ hash, embedding: Array.from(embedding), source: 'face', photo, biometricType: 'Face Scan' });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Capture failed.');
      setStage('camera-on');
    }
  }

  async function registerWithDevice() {
    if (!handle.trim()) {
      setError('Pick a handle first.');
      return;
    }
    setError(null);
    setStage('webauthn');
    try {
      const result = await registerPlatformBiometric(handle.trim());
      if (!result) {
        setError('Device biometric registration was cancelled.');
        setStage('idle');
        return;
      }
      await finalize({ hash: result.hash, embedding: [], source: 'platform', credentialId: result.credentialId, biometricType: detectBiometricType() });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Device biometric failed.');
      setStage('idle');
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
          photo, no server. Hash + handle become a printable QR. Or use your
          device's built-in biometric.
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
          disabled={stage === 'capturing' || stage === 'syncing'}
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
          {stage === 'webauthn' && (
            <span className="text-cyan-electric font-mono text-sm animate-pulse">
              Waiting on device biometric…
            </span>
          )}
          {stage === 'syncing' && (
            <span className="text-cyan-electric font-mono text-sm animate-pulse">
              Publishing card…
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
            <>
              <button
                onClick={startCamera}
                className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition"
              >
                Enable Camera
              </button>
              {platformAvailable && (
                <button
                  onClick={registerWithDevice}
                  className="px-6 py-2.5 rounded-full border border-cyan-electric/40 text-cyan-electric font-mono hover:bg-cyan-electric/10 transition"
                >
                  Use device biometric
                </button>
              )}
            </>
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
          {(stage === 'capturing' || stage === 'syncing' || stage === 'webauthn') && (
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
          {passport.photo && (
            <img
              src={passport.photo}
              alt="Your captured portrait"
              className="w-32 h-32 rounded-full object-cover border-2 border-cyan-electric/60 shadow-glow"
            />
          )}
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Your Vouch QR" className="w-72 h-72 rounded-lg" />
          ) : (
            <div className="w-72 h-72 flex items-center justify-center text-slate-500 font-mono">
              Rendering…
            </div>
          )}
          <div className="text-center space-y-1">
            <div className="text-2xl font-mono text-cyan-electric">@{passport.handle}</div>
            <div className="text-xs text-slate-500 font-mono">
              {passport.source === 'platform' ? 'device biometric · ' : 'face · '}
              {short}…
            </div>
          </div>
          {passport.source === 'platform' && (
            <div className="w-full">
              <HardwareWitnessBox witness={identifyHardwareWitness(passport.credentialId)} />
            </div>
          )}
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
        <Link
          to="/card"
          className="px-6 py-2.5 rounded-full border border-cyan-electric/40 text-cyan-electric font-mono hover:bg-cyan-electric/10 transition"
        >
          View full card
        </Link>
        <button
          onClick={onReset}
          className="px-6 py-2.5 rounded-full border border-red-500/40 text-red-300 font-mono hover:bg-red-500/10 transition"
        >
          Re-register
        </button>
      </div>
    </div>
  );
}
