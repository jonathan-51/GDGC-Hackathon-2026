import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import QRScanner from '../components/QRScanner';
import FaceVerify from '../components/FaceVerify';
import HardwareWitnessBox from '../components/HardwareWitnessBox';
import { useUser } from '../hooks/useUser';
import {
  createVouch,
  getProfile,
  getProfileByHash,
  getProfileByHandle,
  listCredentialsFor,
  listVouchesFor,
  listVouchesByVoucher,
  searchProfilesByHandle,
} from '../lib/db';
import type { VouchWithVouchee } from '../lib/db';
import { identifyHardwareWitness } from '../lib/webauthn';
import type { Credential, Profile, VouchWithVoucher } from '../lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  } catch { /* not json */ }
  return null;
}

type VerifyStage = 'scan' | 'review' | 'verify' | 'submitting' | 'done' | 'error';
type ProfileHit = Pick<Profile, 'id' | 'handle' | 'photo'>;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VerifyAndScan() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'verify' ? 'verify' : 'scan';

  function switchTab(tab: 'scan' | 'verify') {
    setSearchParams(tab === 'verify' ? { tab: 'verify' } : {}, { replace: true });
  }

  const { passport, profile, vouches: myVouches, loading, refresh } = useUser();
  const myVoucherIds = new Set(myVouches.map((v) => v.voucher.id));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h2 className="text-4xl font-mono font-bold text-blue-400">Verify &amp; Scan</h2>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/10">
        {([
          { label: 'Scan Profile', id: 'scan' },
          { label: 'Verify Peer', id: 'verify' },
        ] as const).map(({ label, id }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            className={`px-4 py-2 font-mono text-sm border-b-2 -mb-px transition ${
              activeTab === id
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-blue-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'scan' ? (
        <ScanTab
          myVoucherIds={myVoucherIds}
          prefillHandle={activeTab === 'scan' ? (searchParams.get('handle') ?? undefined) : undefined}
        />
      ) : (
        <VerifyTab
          passport={passport}
          profile={profile}
          myVoucherIds={myVoucherIds}
          loading={loading}
          refresh={refresh}
          prefillHandle={searchParams.get('handle') ?? undefined}
          prefillHash={searchParams.get('hash') ?? undefined}
          prefillPid={searchParams.get('pid') ?? undefined}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scan Profile tab
// ---------------------------------------------------------------------------

function ScanTab({
  myVoucherIds,
  prefillHandle,
}: {
  myVoucherIds: Set<string>;
  prefillHandle?: string;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const [selectedHandle, setSelectedHandle] = useState<string | null>(prefillHandle ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (!q) { setResults([]); setSearchError(null); return; }
    let cancelled = false;
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const hits = await searchProfilesByHandle(q);
        if (!cancelled) { setResults(hits); setSearchError(null); }
      } catch (e) {
        if (!cancelled) setSearchError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  function handleScan(text: string) {
    const parsed = parseQr(text);
    if (!parsed) { setError(`That QR is not a Vouch card. Decoded: ${text.slice(0, 80)}`); return; }
    setSelectedHandle(parsed.handle);
  }

  function submitSearch(e: React.SyntheticEvent) {
    e.preventDefault();
    const q = query.trim().replace(/^@/, '');
    if (!q) return;
    setSelectedHandle(results.length === 1 ? results[0].handle : q);
  }

  return (
    <div className="space-y-6">
      <p className="text-slate-400 text-sm">
        Scan a Vouch QR code or search by handle to view someone's profile.
      </p>

      <form onSubmit={submitSearch} className="space-y-2">
        <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest">
          Search by handle
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. @alice"
            className="flex-1 bg-navy-deep border border-blue-500/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-blue-500 transition"
          />
          <button
            type="submit"
            disabled={!query.trim()}
            className="px-5 py-3 rounded bg-blue-600 text-white font-semibold text-sm disabled:opacity-40 hover:bg-blue-500 transition"
          >
            Open
          </button>
        </div>
        {searchError && <div className="text-xs text-red-300 font-mono">{searchError}</div>}
        {query.trim() && (
          <ul className="rounded-lg border border-blue-700/20 bg-navy-deep/40 divide-y divide-blue-500/10 overflow-hidden">
            {searching && results.length === 0 && (
              <li className="px-4 py-3 text-xs text-slate-500 font-mono">Searching…</li>
            )}
            {!searching && results.length === 0 && (
              <li className="px-4 py-3 text-xs text-slate-500 font-mono">
                No handles match. Press Open to try the exact handle anyway.
              </li>
            )}
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedHandle(p.handle)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-500/5 transition text-left"
                >
                  {p.photo ? (
                    <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover border border-blue-500/30" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-black/40 border border-blue-700/30" />
                  )}
                  <span className="font-mono text-blue-400 text-sm">@{p.handle}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="space-y-2">
        <div className="text-xs font-mono text-slate-400 uppercase tracking-widest">
          Or scan a QR code
        </div>
        <div className="rounded-2xl border border-blue-700/30 bg-navy-deep/60 p-4">
          <QRScanner key={scanKey} onResult={handleScan} onError={(msg) => setError(msg)} />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm font-mono space-y-3">
          <div>{error}</div>
          <button
            onClick={() => { setError(null); setScanKey((k) => k + 1); }}
            className="px-4 py-1.5 rounded-full border border-blue-500/40 text-blue-400 font-mono text-xs hover:bg-blue-500/10"
          >
            Try again
          </button>
        </div>
      )}

      <AnimatePresence>
        {selectedHandle && (
          <ProfilePopup
            handle={selectedHandle}
            myVoucherIds={myVoucherIds}
            onClose={() => setSelectedHandle(null)}
            onViewFull={() => navigate(`/p/${encodeURIComponent(selectedHandle)}`)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verify Peer tab
// ---------------------------------------------------------------------------

function VerifyTab({
  passport,
  profile,
  myVoucherIds,
  loading,
  refresh,
  prefillHandle,
  prefillHash,
  prefillPid,
}: {
  passport: ReturnType<typeof useUser>['passport'];
  profile: ReturnType<typeof useUser>['profile'];
  myVoucherIds: Set<string>;
  loading: boolean;
  refresh: () => Promise<void>;
  prefillHandle?: string;
  prefillHash?: string;
  prefillPid?: string;
}) {
  const prefilledRef = useRef(false);
  const [stage, setStage] = useState<VerifyStage>('scan');
  const [scanned, setScanned] = useState<ScannedCard | null>(null);
  const [target, setTarget] = useState<Profile | null>(null);
  const [targetVouches, setTargetVouches] = useState<VouchWithVoucher[]>([]);
  const [targetVouchees, setTargetVouchees] = useState<VouchWithVouchee[]>([]);
  const [context, setContext] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    listVouchesFor(target.id).then(setTargetVouches).catch(console.error);
    listVouchesByVoucher(target.id).then(setTargetVouchees).catch(console.error);
  }, [target]);

  useEffect(() => {
    if (prefilledRef.current || loading) return;
    if (!passport || !profile) return;
    if (!prefillHandle || !prefillHash) return;
    prefilledRef.current = true;
    handleScan(JSON.stringify({ h: prefillHandle, id: prefillHash, pid: prefillPid }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, passport, profile, prefillHandle, prefillHash, prefillPid]);

  async function handleScan(text: string) {
    const parsed = parseQr(text);
    if (!parsed) { setError(`That QR is not a Vouch card. Decoded: ${text.slice(0, 80)}`); setStage('error'); return; }
    if (parsed.hash === passport!.hash) { setError('You cannot co-sign your own card.'); setStage('error'); return; }
    setScanned(parsed);
    try {
      const t = parsed.profileId ? await getProfile(parsed.profileId) : await getProfileByHash(parsed.hash);
      if (!t) {
        setError(`No matching profile found on the network.`);
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

  if (loading) {
    return <div className="text-slate-400 font-mono text-sm py-8 text-center">Loading…</div>;
  }

  if (!passport || !profile) {
    return (
      <div className="space-y-4 py-4">
        <p className="text-slate-400">
          You need a card of your own before you can co-sign someone else's.
        </p>
        <Link
          to="/register"
          className="inline-block px-6 py-2.5 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-500 transition"
        >
          Generate your card
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-slate-400 text-sm">
        Scan a peer's Vouch card, then sign with your own biometric. Each co-sign is recorded against your own card — your reputation is on the line.
      </p>

      {stage === 'scan' && (
        <div className="space-y-4">
          <QRScanner
            onResult={handleScan}
            onError={(m) => { setError(m); setStage('error'); }}
          />
          <p className="text-center text-slate-500 font-mono text-xs">
            Point the camera at their QR code.
          </p>
        </div>
      )}

      {stage === 'review' && target && scanned && (
        <div className="rounded-2xl border border-blue-700/30 bg-navy-deep/60 p-6 space-y-5">
          <div className="flex items-center gap-4">
            {target.photo && (
              <img
                src={target.photo}
                alt={`${target.handle} portrait`}
                className="w-16 h-16 rounded-full object-cover border-2 border-blue-500/60 shrink-0"
              />
            )}
            <div>
              <div className="text-slate-500 font-mono text-xs uppercase">You are vouching for</div>
              <div className="text-3xl font-mono text-blue-400 mt-1">@{target.handle}</div>
              <div className="text-xs text-slate-500 font-mono mt-1">{scanned.hash.slice(0, 16)}…</div>
            </div>
          </div>

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
                      mutual ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/5 bg-white/[0.03]'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {mutual && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                        <div className="min-w-0">
                          <Link to={`/p/${v.voucher.handle}`} className={`font-mono text-sm hover:underline ${mutual ? 'text-blue-400' : 'text-white'}`}>
                            @{v.voucher.handle}
                          </Link>
                          {mutual && <span className="ml-2 text-[10px] text-blue-400/70 font-mono">mutual</span>}
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
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest">
              Optional context
            </label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. lived next door for two years"
              maxLength={140}
              className="w-full bg-navy border border-blue-500/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-blue-500 transition"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStage('verify')}
              className="px-6 py-2.5 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-500 transition"
            >
              Sign with my biometric
            </button>
            <button onClick={reset} className="px-4 py-2 text-slate-400 hover:text-blue-400">
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
        <div className="text-blue-400 font-mono animate-pulse text-center py-12">Publishing vouch…</div>
      )}

      {stage === 'done' && target && (
        <div className="rounded-2xl border border-blue-500/40 bg-blue-500/5 p-8 text-center space-y-4">
          <div className="text-blue-400 text-5xl font-mono">✓</div>
          <div className="font-mono text-lg text-white">
            You vouched for{' '}
            <Link to={`/p/${target.handle}`} className="text-blue-400 hover:underline">
              @{target.handle}
            </Link>.
          </div>
          <p className="text-slate-400 text-sm">Your signature now appears on their card.</p>
          {passport?.source === 'platform' && (
            <HardwareWitnessBox witness={identifyHardwareWitness(passport.credentialId)} />
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="px-6 py-2.5 rounded-full border border-blue-500/40 text-blue-400 font-mono hover:bg-blue-500/10 transition"
            >
              Scan another
            </button>
            <Link
              to="/card"
              className="px-6 py-2.5 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-500 transition"
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

// ---------------------------------------------------------------------------
// Profile popup (for Scan tab)
// ---------------------------------------------------------------------------

function ProfilePopup({
  handle,
  myVoucherIds,
  onClose,
  onViewFull,
}: {
  handle: string;
  myVoucherIds: Set<string>;
  onClose: () => void;
  onViewFull: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vouches, setVouches] = useState<VouchWithVoucher[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const p = await getProfileByHandle(handle);
        if (cancelled) return;
        if (!p) { setError(`No profile found for @${handle}`); setLoading(false); return; }
        setProfile(p);
        const [v, c] = await Promise.all([listVouchesFor(p.id), listCredentialsFor(p.id)]);
        if (cancelled) return;
        setVouches(v);
        setCredentials(c.filter((cr) => !cr.revoked));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const mutualVouches = vouches.filter((v) => myVoucherIds.has(v.voucher.id));
  const otherVouches = vouches.filter((v) => !myVoucherIds.has(v.voucher.id));

  // Build vouch link that opens Verify Peer tab with prefill
  const vouchLink = profile
    ? `/scan?tab=verify&handle=${encodeURIComponent(profile.handle)}&hash=${encodeURIComponent(profile.face_hash)}&pid=${encodeURIComponent(profile.id)}`
    : '#';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-navy-deep border border-blue-500/30 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-navy-deep border-b border-blue-500/10 px-5 py-4 flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400">Profile</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && <div className="text-slate-400 font-mono text-sm text-center py-8">Loading…</div>}
          {error && <div className="text-red-300 font-mono text-sm text-center py-4">{error}</div>}

          {!loading && profile && (
            <>
              <div className="flex items-center gap-4">
                {profile.photo ? (
                  <img src={profile.photo} alt={profile.handle}
                    className="w-20 h-20 rounded-full object-cover border-2 border-blue-500/60 shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-navy-light border-2 border-blue-700/30 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-9 h-9 text-slate-500">
                      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
                <div>
                  <div className="text-2xl font-mono font-bold text-blue-400">@{profile.handle}</div>
                  <div className="text-xs text-slate-500 font-mono mt-1">
                    Joined {new Date(profile.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex gap-3 mt-2 text-xs font-mono text-slate-400">
                    <span>{vouches.length} vouch{vouches.length !== 1 ? 'es' : ''}</span>
                    <span>{credentials.length} credential{credentials.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

              {credentials.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">Verified skills</div>
                  <div className="flex flex-wrap gap-2">
                    {credentials.map((c) => (
                      <span key={c.id} className="px-2.5 py-1 rounded-full border border-blue-500/30 bg-blue-500/5 text-blue-400 font-mono text-xs">
                        {c.skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {mutualVouches.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                    Mutual connections ({mutualVouches.length})
                  </div>
                  <ul className="space-y-2">
                    {mutualVouches.map((v) => <VoucherRow key={v.id} vouch={v} mutual />)}
                  </ul>
                </div>
              )}

              {otherVouches.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">
                    {mutualVouches.length > 0 ? `Other vouchers (${otherVouches.length})` : `Vouched by (${otherVouches.length})`}
                  </div>
                  <ul className="space-y-2">
                    {otherVouches.map((v) => <VoucherRow key={v.id} vouch={v} mutual={false} />)}
                  </ul>
                </div>
              )}

              {vouches.length === 0 && (
                <div className="text-center text-slate-500 text-sm font-mono py-2">No vouches yet.</div>
              )}

              <div className="flex gap-3 pt-2 border-t border-blue-500/10">
                <Link
                  to={vouchLink}
                  className="flex-1 py-2.5 rounded-full bg-blue-600 text-white font-semibold text-sm text-center hover:bg-blue-500 transition"
                >
                  Vouch this person
                </Link>
                <button
                  onClick={onViewFull}
                  className="px-4 py-2.5 rounded-full border border-blue-500/30 text-blue-400 font-mono text-sm hover:bg-blue-500/10 transition"
                >
                  Full profile
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function VoucherRow({ vouch: v, mutual }: { vouch: VouchWithVoucher; mutual: boolean }) {
  return (
    <li className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 border ${
      mutual ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/5 bg-navy-light/20'
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        {mutual && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mt-0.5" />}
        <div className="min-w-0">
          <Link
            to={`/p/${v.voucher.handle}`}
            className={`font-mono text-sm hover:underline ${mutual ? 'text-blue-400' : 'text-white'}`}
          >
            @{v.voucher.handle}
          </Link>
          {v.context && <div className="text-xs text-slate-400 mt-0.5 truncate">{v.context}</div>}
        </div>
      </div>
      <div className="text-[10px] text-slate-500 font-mono shrink-0 mt-0.5">
        {new Date(v.created_at).toLocaleDateString()}
      </div>
    </li>
  );
}
