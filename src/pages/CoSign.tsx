import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import QRScanner from '../components/QRScanner';
import FaceVerify from '../components/FaceVerify';
import HardwareWitnessBox from '../components/HardwareWitnessBox';
import { useUser } from '../hooks/useUser';
import { createVouch, getProfile, getProfileByHash, listVouchesFor, listVouchesByVoucher } from '../lib/db';
import type { VouchWithVouchee } from '../lib/db';
import { identifyHardwareWitness } from '../lib/webauthn';
import type { Profile, VouchWithVoucher } from '../lib/types';

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

const VERIFY_SCAN_TABS = [
  { label: 'Scan Profile', to: '/scan' },
  { label: 'Verify Peer', to: '/cosign' },
];

export default function CoSign() {
  const { passport, profile, vouches: myVouches, loading, refresh } = useUser();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const prefilledRef = useRef(false);
  const [stage, setStage] = useState<Stage>('scan');
  const [scanned, setScanned] = useState<ScannedCard | null>(null);
  const [target, setTarget] = useState<Profile | null>(null);
  const [targetVouches, setTargetVouches] = useState<VouchWithVoucher[]>([]);
  const [targetVouchees, setTargetVouchees] = useState<VouchWithVouchee[]>([]);
  const [context, setContext] = useState('');
  const [error, setError] = useState<string | null>(null);

  const myVoucherIds = new Set(myVouches.map((v) => v.voucher.id));

  useEffect(() => {
    if (!target) return;
    listVouchesFor(target.id).then(setTargetVouches).catch(console.error);
    listVouchesByVoucher(target.id).then(setTargetVouchees).catch(console.error);
  }, [target]);

  useEffect(() => {
    if (prefilledRef.current) return;
    if (!passport || !profile) return;
    const handle = searchParams.get('handle');
    const hash = searchParams.get('hash');
    const pid = searchParams.get('pid') ?? undefined;
    if (!handle || !hash) return;
    prefilledRef.current = true;
    handleScan(JSON.stringify({ h: handle, id: hash, pid }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passport, profile, searchParams]);

  if (loading) {
    return <div className="text-slate-400 font-mono">Loading…</div>;
  }

  if (!passport || !profile) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-4xl font-mono font-bold text-[#F2DDA4]">Verify &amp; Scan</h2>
        <TabBar pathname={pathname} />
        <p className="text-slate-400">
          You need a card of your own before you can co-sign someone else's.
        </p>
        <Link
          to="/register"
          className="inline-block px-6 py-2.5 rounded-full bg-[#C7A97A] text-white font-semibold hover:bg-[#E6B347] transition"
        >
          Generate your card
        </Link>
      </div>
    );
  }

  async function handleScan(text: string) {
    console.log('[CoSign] handleScan received', text);
    const parsed = parseQr(text);
    console.log('[CoSign] parsed', parsed);
    if (!parsed) {
      setError(`That QR is not an Illume card. Decoded: ${text.slice(0, 80)}`);
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
      console.log('[CoSign] profile lookup result', t);
      if (!t) {
        setError(
          `No matching profile found on the network. Looked up ${parsed.profileId ? `id ${parsed.profileId}` : `hash ${parsed.hash.slice(0, 12)}…`}.`,
        );
        setStage('error');
        return;
      }
      setTarget(t);
      setStage('review');
    } catch (e) {
      console.error('[CoSign] lookup failed', e);
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
      <header className="space-y-4">
        <h2 className="text-4xl font-mono font-bold text-[#F2DDA4]">Verify &amp; Scan</h2>
        <TabBar pathname={pathname} />
        <p className="text-slate-400">
          Scan a peer's Illume card, then sign with your own biometric. Each
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
        <div className="rounded-2xl border border-[#8B5E15]/30 bg-navy-deep/60 p-6 space-y-5">
          <div className="flex items-center gap-4">
            {target.photo && (
              <img
                src={target.photo}
                alt={`${target.handle} portrait`}
                className="w-16 h-16 rounded-full object-cover border-2 border-[#E6B347]/60 shadow-[0_0_20px_rgba(230,179,71,0.3)] shrink-0"
              />
            )}
            <div>
              <div className="text-slate-500 font-mono text-xs uppercase">You are vouching for</div>
              <div className="text-3xl font-mono text-[#F2DDA4] mt-1">@{target.handle}</div>
              <div className="text-xs text-slate-500 font-mono mt-1">
                {scanned.hash.slice(0, 16)}…
              </div>
            </div>
          </div>

          {/* People who vouched FOR this person */}
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase tracking-widest text-slate-400">
              Vouched by ({targetVouches.length})
            </div>
            {targetVouches.length === 0 ? (
              <div className="text-slate-500 text-sm font-mono">No one has vouched for them yet.</div>
            ) : (
              <ul className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {targetVouches.map((v) => {
                  const mutual = myVoucherIds.has(v.voucher.id);
                  return (
                    <li key={v.id} className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 border text-sm ${
                      mutual ? 'border-[#E6B347]/30 bg-[#E6B347]/5' : 'border-white/5 bg-white/[0.03]'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {mutual && <span className="w-1.5 h-1.5 rounded-full bg-[#F2DDA4] shrink-0" />}
                        <div className="min-w-0">
                          <Link to={`/p/${v.voucher.handle}`} className={`font-mono text-sm hover:underline ${mutual ? 'text-[#F2DDA4]' : 'text-white'}`}>
                            @{v.voucher.handle}
                          </Link>
                          {mutual && <span className="ml-2 text-[10px] text-[#F2DDA4]/70 font-mono">mutual</span>}
                          {v.context && <div className="text-xs text-slate-400 mt-0.5 truncate">{v.context}</div>}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {new Date(v.created_at).toLocaleDateString()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* People this person has vouched for */}
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase tracking-widest text-slate-400">
              Has vouched for ({targetVouchees.length})
            </div>
            {targetVouchees.length === 0 ? (
              <div className="text-slate-500 text-sm font-mono">Hasn't vouched for anyone yet.</div>
            ) : (
              <ul className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {targetVouchees.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2 border border-white/5 bg-white/[0.03] text-sm">
                    <div className="min-w-0">
                      <Link to={`/p/${v.vouchee.handle}`} className="font-mono text-white text-sm hover:underline">
                        @{v.vouchee.handle}
                      </Link>
                      {v.context && <div className="text-xs text-slate-400 mt-0.5 truncate">{v.context}</div>}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
              className="w-full bg-navy border border-[#E6B347]/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-[#E6B347] transition"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStage('verify')}
              className="px-6 py-2.5 rounded-full bg-[#C7A97A] text-white font-semibold hover:shadow-[0_0_20px_rgba(230,179,71,0.3)] transition"
            >
              Sign with my biometric
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 text-slate-400 hover:text-[#F2DDA4]"
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
        <div className="text-[#F2DDA4] font-mono animate-pulse text-center py-12">
          Publishing vouch…
        </div>
      )}

      {stage === 'done' && target && (
        <div className="rounded-2xl border border-[#E6B347]/40 bg-[#E6B347]/5 p-8 text-center space-y-4">
          <div className="text-[#F2DDA4] text-5xl font-mono">✓</div>
          <div className="font-mono text-lg text-white">
            You vouched for{' '}
            <Link
              to={`/p/${target.handle}`}
              className="text-[#F2DDA4] hover:underline"
            >
              @{target.handle}
            </Link>
            .
          </div>
          <p className="text-slate-400 text-sm">
            Your signature now appears on their card.
          </p>
          {passport?.source === 'platform' && (
            <HardwareWitnessBox
              witness={identifyHardwareWitness(passport.credentialId)}
            />
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="px-6 py-2.5 rounded-full border border-[#E6B347]/40 text-[#F2DDA4] font-mono hover:bg-[#E6B347]/10 transition"
            >
              Scan another
            </button>
            <Link
              to="/card"
              className="px-6 py-2.5 rounded-full bg-[#C7A97A] text-white font-semibold hover:shadow-[0_0_20px_rgba(230,179,71,0.3)] transition"
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

function TabBar({ pathname }: { pathname: string }) {
  return (
    <div className="flex gap-1 border-b border-white/10">
      {VERIFY_SCAN_TABS.map(({ label, to }) => {
        const active = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={`px-4 py-2 font-mono text-sm border-b-2 -mb-px transition ${
              active
                ? 'border-[#E6B347] text-[#F2DDA4]'
                : 'border-transparent text-slate-400 hover:text-[#F2DDA4]'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
