import { useEffect, useRef, useState } from 'react';
import {
  euclideanDistance,
  getSingleFaceStrict,
  loadFaceModels,
  MATCH_THRESHOLD,
  VERIFY_FRAMES_REQUIRED,
  type StoredPassport,
} from '../lib/biometric';
import { authenticatePlatformBiometric } from '../lib/webauthn';

// Re-verify that the human holding the device is the same one stored in the
// local passport. For face passports we re-compute an embedding and compare
// by Euclidean distance; for platform (WebAuthn) passports we re-prompt the
// device biometric and compare the resulting credential hash.
interface Props {
  passport: StoredPassport;
  onVerified: (info: { distance: number | null }) => void;
  onCancel?: () => void;
  label?: string;
}

export default function FaceVerify({ passport, onVerified, onCancel, label }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'live' | 'matching' | 'failed' | 'unsupported'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ pass: number; total: number } | null>(null);

  useEffect(() => {
    if (passport.source === 'platform') return;
    let cancelled = false;
    (async () => {
      setStatus('loading');
      try {
        await loadFaceModels();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 480, height: 360 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('live');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Camera unavailable.');
        setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [passport.source]);

  async function verifyFace() {
    if (!videoRef.current) return;
    setStatus('matching');
    setError(null);
    setDistance(null);
    setProgress({ pass: 0, total: VERIFY_FRAMES_REQUIRED });
    try {
      const distances: number[] = [];
      for (let i = 0; i < VERIFY_FRAMES_REQUIRED; i++) {
        // Small pause between samples so we capture *different* frames rather
        // than re-scoring the same frozen image — a single lucky frame
        // shouldn't be enough to authenticate.
        if (i > 0) await new Promise((r) => setTimeout(r, 250));
        const sample = await getSingleFaceStrict(videoRef.current!);
        if (sample.kind === 'no-face') {
          setError('No face detected. Center your face and try again.');
          setStatus('live');
          setProgress(null);
          return;
        }
        if (sample.kind === 'multiple-faces') {
          setError(
            `Multiple faces in frame (${sample.count}). Only the card holder may be visible during verification.`,
          );
          setStatus('live');
          setProgress(null);
          return;
        }
        const d = euclideanDistance(sample.descriptor, passport.embedding);
        distances.push(d);
        setDistance(d);
        if (d > MATCH_THRESHOLD) {
          setError(
            `Face does not match passport (distance ${d.toFixed(2)} > ${MATCH_THRESHOLD}). Keep still and try again.`,
          );
          setStatus('live');
          setProgress(null);
          return;
        }
        setProgress({ pass: i + 1, total: VERIFY_FRAMES_REQUIRED });
      }
      const worst = Math.max(...distances);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onVerified({ distance: worst });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.');
      setStatus('live');
      setProgress(null);
    }
  }

  async function verifyPlatform() {
    if (!passport.credentialId) {
      setError('No credential ID found. Please re-register your device biometric.');
      return;
    }
    setStatus('matching');
    setError(null);
    try {
      const ok = await authenticatePlatformBiometric(passport.credentialId);
      if (ok) {
        onVerified({ distance: 0 });
      } else {
        setError('Device biometric did not match.');
        setStatus('idle');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Device biometric failed.');
      setStatus('idle');
    }
  }

  if (passport.source === 'platform') {
    return (
      <div className="space-y-4">
        <p className="text-slate-300 font-mono text-sm">
          {label ?? 'Confirm with your device biometric.'}
        </p>
        {error && (
          <div className="text-red-300 text-sm font-mono">{error}</div>
        )}
        <div className="flex gap-3">
          <button
            onClick={verifyPlatform}
            disabled={status === 'matching'}
            className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow disabled:opacity-40 transition"
          >
            {status === 'matching' ? 'Waiting…' : 'Confirm with device'}
          </button>
          {onCancel && (
            <button onClick={onCancel} className="px-4 py-2 text-slate-400 hover:text-cyan-electric">
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-300 font-mono text-sm">
        {label ?? 'Re-scan your face to sign.'}
      </p>
      <div className="rounded-2xl overflow-hidden border border-cyan-electric/30 bg-black aspect-[4/3] max-w-md mx-auto relative">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-44 h-56 border-2 border-cyan-electric/60 rounded-[50%] shadow-glow" />
        </div>
        {status === 'loading' && (
          <span className="absolute inset-0 flex items-center justify-center text-cyan-electric font-mono animate-pulse">
            Starting camera…
          </span>
        )}
      </div>
      {distance !== null && (
        <div className="text-xs text-slate-400 font-mono text-center">
          distance {distance.toFixed(3)} / threshold {MATCH_THRESHOLD}
          {progress && (
            <> · sample {progress.pass}/{progress.total}</>
          )}
        </div>
      )}
      {error && <div className="text-red-300 text-sm font-mono text-center">{error}</div>}
      <div className="flex gap-3 justify-center">
        <button
          onClick={verifyFace}
          disabled={status !== 'live' && status !== 'matching'}
          className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow disabled:opacity-40 transition"
        >
          {status === 'matching'
            ? progress
              ? `Matching ${progress.pass}/${progress.total}…`
              : 'Matching…'
            : 'Verify Face'}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2 text-slate-400 hover:text-cyan-electric">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
