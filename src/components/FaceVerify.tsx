import { useEffect, useRef, useState } from 'react';
import {
  euclideanDistance,
  getFaceEmbedding,
  loadFaceModels,
  MATCH_THRESHOLD,
  type StoredPassport,
} from '../lib/biometric';
import { registerPlatformBiometric } from '../lib/webauthn';

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
    try {
      const embedding = await getFaceEmbedding(videoRef.current);
      if (!embedding) {
        setError('No face detected. Center your face and try again.');
        setStatus('live');
        return;
      }
      const d = euclideanDistance(embedding, passport.embedding);
      setDistance(d);
      if (d <= MATCH_THRESHOLD) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onVerified({ distance: d });
      } else {
        setError(`Face does not match passport (distance ${d.toFixed(2)} > ${MATCH_THRESHOLD}).`);
        setStatus('live');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.');
      setStatus('live');
    }
  }

  async function verifyPlatform() {
    setStatus('matching');
    setError(null);
    try {
      const res = await registerPlatformBiometric(passport.handle);
      if (!res) {
        setError('Cancelled.');
        setStatus('idle');
        return;
      }
      if (res.hash === passport.hash) {
        onVerified({ distance: 0 });
      } else {
        setError('Device biometric did not match the registered credential.');
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
        </div>
      )}
      {error && <div className="text-red-300 text-sm font-mono text-center">{error}</div>}
      <div className="flex gap-3 justify-center">
        <button
          onClick={verifyFace}
          disabled={status !== 'live' && status !== 'matching'}
          className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow disabled:opacity-40 transition"
        >
          {status === 'matching' ? 'Matching…' : 'Verify Face'}
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
