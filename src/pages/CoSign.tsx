import { useState } from 'react';
import { Link } from 'react-router-dom';
import QRScanner from '../components/QRScanner';
import FaceVerify from '../components/FaceVerify';
import { useUser } from '../hooks/useUser';
import { createVouch, getProfile, getProfileByHash } from '../lib/db';
import type { Profile } from '../lib/types';

type Stage = 'scan' | 'review' | 'verify' | 'submitting' | 'done' | 'error';

interface ScannedCard {
  handle: string;
  hash: string;
  profileId?: string;
}

function parseQr(text: string): ScannedCard | null {
  try {
    const obj = JSON.parse(text);
    if (typeof obj.h === 'string' && typeof obj.id === 'string') {
      return { handle: obj.h, hash: obj.id, profileId: obj.pid };
    }
  } catch {
    // not json
  }
  return null;
}

export default function CoSign() {
  const { passport, profile, loading, refresh } = useUser();
  const [stage, setStage] = useState<Stage>('scan');
  const [scanned, setScanned] = useState<ScannedCard | null>(null);
  const [target, setTarget] = useState<Profile | null>(null);
  const [context, setContext] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return <div className="text-slate-400 font-mono">Loading…</div>;
  }

  if (!passport || !profile) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-3xl font-mono text-cyan-electric">Verify Peer</h2>
        <p className="text-slate-400">
          You need a card of your own before you can co-sign someone else's.
        </p>
        <Link
          to="/register"
          className="inline-block px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition"
        >
          Generate your card
        </Link>
      </div>
    );
  }

  async function handleScan(text: string) {
    const parsed = parseQr(text);
    if (!parsed) {
      setError('That QR code is not a Vouch card.');
      setStage('error');
      return;
    }
    if (parsed.hash === passport!.hash) {
      setError('You cannot co-sign your own card.');
      setStage('error');
      return;
    }
    setScanned(parsed);
    try {
      const t = parsed.profileId
        ? await getProfile(parsed.profileId)
        : await getProfileByHash(parsed.hash);
      if (!t) {
        setError('No matching profile found on the network. Has this person registered?');
        setStage('error');
        return;
      }
      setTarget(t);
      setStage('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed.');
      setStage('error');
    }
  }

  async function submitVouch(distance: number | null) {
    if (!target || !profile) return;
    setStage('submitting');
    try {
      await createVouch({
        voucher_id: profile.id,
        vouchee_id: target.id,
        context: context.trim() || undefined,
        match_distance: distance ?? undefined,
      });
      await refresh();
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed. Maybe you already vouched.');
      setStage('error');
    }
  }

  function reset() {
    setScanned(null);
    setTarget(null);
    setContext('');
    setError(null);
    setStage('scan');
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="space-y-2">
        <h2 className="text-4xl font-mono font-bold text-cyan-electric">Verify Peer</h2>
        <p className="text-slate-400">
          Scan a peer's Vouch card, then sign with your own biometric. Each
          co-sign is recorded against your own card — your reputation is on the line.
        </p>
      </header>

      {stage === 'scan' && (
        <div className="space-y-4">
          <QRScanner
            onResult={handleScan}
            onError={(m) => {
              setError(m);
              setStage('error');
            }}
          />
          <p className="text-center text-slate-500 font-mono text-xs">
            Point the camera at their QR code.
          </p>
        </div>
      )}

      {stage === 'review' && target && scanned && (
        <div className="rounded-2xl border border-cyan-electric/20 bg-navy-deep/60 p-6 space-y-5">
          <div>
            <div className="text-slate-500 font-mono text-xs uppercase">You are vouching for</div>
            <div className="text-3xl font-mono text-cyan-electric mt-1">@{target.handle}</div>
            <div className="text-xs text-slate-500 font-mono mt-1">
              {scanned.hash.slice(0, 16)}…
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-mono text-slate-400 uppercase tracking-widest">
              Optional context
            </label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. lived next door for two years"
              maxLength={140}
              className="w-full bg-navy border border-cyan-electric/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-cyan-electric transition"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStage('verify')}
              className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition"
            >
              Sign with my biometric
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 text-slate-400 hover:text-cyan-electric"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === 'verify' && (
        <FaceVerify
          passport={passport}
          label="Re-scan to sign this vouch. Your biometric stays local — only the match is recorded."
          onCancel={() => setStage('review')}
          onVerified={({ distance }) => submitVouch(distance)}
        />
      )}

      {stage === 'submitting' && (
        <div className="text-cyan-electric font-mono animate-pulse text-center py-12">
          Publishing vouch…
        </div>
      )}

      {stage === 'done' && target && (
        <div className="rounded-2xl border border-cyan-electric/40 bg-cyan-electric/5 p-8 text-center space-y-4">
          <div className="text-cyan-electric text-5xl font-mono">✓</div>
          <div className="font-mono text-lg text-white">
            You vouched for <span className="text-cyan-electric">@{target.handle}</span>.
          </div>
          <p className="text-slate-400 text-sm">
            Your signature now appears on their card.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="px-6 py-2.5 rounded-full border border-cyan-electric/40 text-cyan-electric font-mono hover:bg-cyan-electric/10 transition"
            >
              Scan another
            </button>
            <Link
              to="/card"
              className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition"
            >
              View my card
            </Link>
          </div>
        </div>
      )}

      {stage === 'error' && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 font-mono text-sm space-y-3">
          <div>{error}</div>
          <button
            onClick={reset}
            className="px-4 py-1.5 rounded-full border border-red-300/40 text-red-200 hover:bg-red-500/20 text-xs"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
