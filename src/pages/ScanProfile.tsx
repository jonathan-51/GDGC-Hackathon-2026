import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import QRScanner from '../components/QRScanner';
import { getProfileByHandle, listVouchesFor, listCredentialsFor } from '../lib/db';
import { useUser } from '../hooks/useUser';
import type { Credential, Profile, VouchWithVoucher } from '../lib/types';

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

type ProfileHit = Pick<Profile, 'id' | 'handle' | 'photo'>;

export default function ScanProfile() {
  const navigate = useNavigate();
  const { vouches: myVouches } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // IDs of everyone who has vouched for the current user
  const myVoucherIds = new Set(myVouches.map((v) => v.voucher.id));

  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (!q) { setResults([]); setSearchError(null); return; }
    let cancelled = false;
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const { searchProfilesByHandle } = await import('../lib/db');
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
    if (!parsed) {
      setError(`That QR is not an Illume card. Decoded: ${text.slice(0, 80)}`);
      return;
    }
    setSelectedHandle(parsed.handle);
  }

  function submitSearch(e: React.SyntheticEvent) {
    e.preventDefault();
    const q = query.trim().replace(/^@/, '');
    if (!q) return;
    if (results.length === 1) setSelectedHandle(results[0].handle);
    else if (results.length > 1) setSelectedHandle(q);
    else setSelectedHandle(q);
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header className="space-y-2">
        <h2 className="text-4xl font-mono font-bold text-cyan-electric">Find a Profile</h2>
        <p className="text-slate-400">
          Scan an Illume QR code or search by handle to view someone's profile.
        </p>
      </header>

      <form onSubmit={submitSearch} className="space-y-2">
        <label className="block text-sm font-mono text-slate-400 uppercase tracking-widest">
          Search by handle
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. @alice"
            className="flex-1 bg-navy-deep border border-cyan-electric/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-cyan-electric transition"
          />
          <button
            type="submit"
            disabled={!query.trim()}
            className="px-5 py-3 rounded bg-cyan-electric text-navy-deep font-semibold text-sm disabled:opacity-40 hover:shadow-glow transition"
          >
            Open
          </button>
        </div>
        {searchError && <div className="text-xs text-red-300 font-mono">{searchError}</div>}
        {query.trim() && (
          <ul className="rounded-lg border border-cyan-electric/15 bg-navy-deep/40 divide-y divide-cyan-electric/10 overflow-hidden">
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
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-cyan-electric/5 transition text-left"
                >
                  {p.photo ? (
                    <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover border border-cyan-electric/30" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-black/40 border border-cyan-electric/20" />
                  )}
                  <span className="font-mono text-cyan-electric text-sm">@{p.handle}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="space-y-2">
        <div className="text-sm font-mono text-slate-400 uppercase tracking-widest">
          Or scan a QR code
        </div>
        <div className="rounded-2xl border border-cyan-electric/20 bg-navy-deep/60 p-4">
          <QRScanner
            key={scanKey}
            onResult={handleScan}
            onError={(msg) => setError(msg)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm font-mono space-y-3">
          <div>{error}</div>
          <button
            onClick={() => { setError(null); setScanKey((k) => k + 1); }}
            className="px-4 py-1.5 rounded-full border border-cyan-electric/40 text-cyan-electric font-mono text-xs hover:bg-cyan-electric/10"
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
// Profile popup
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
        className="bg-navy-deep border border-cyan-electric/30 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-glow"
      >
        {/* Header */}
        <div className="sticky top-0 bg-navy-deep border-b border-cyan-electric/10 px-5 py-4 flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400">Profile</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && (
            <div className="text-slate-400 font-mono text-sm text-center py-8">Loading…</div>
          )}

          {error && (
            <div className="text-red-300 font-mono text-sm text-center py-4">{error}</div>
          )}

          {!loading && profile && (
            <>
              {/* Identity */}
              <div className="flex items-center gap-4">
                {profile.photo ? (
                  <img src={profile.photo} alt={profile.handle}
                    className="w-20 h-20 rounded-full object-cover border-2 border-cyan-electric/60 shadow-glow shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-navy-light border-2 border-cyan-electric/20 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-9 h-9 text-slate-500">
                      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
                <div>
                  <div className="text-2xl font-mono font-bold text-cyan-electric">@{profile.handle}</div>
                  <div className="text-xs text-slate-500 font-mono mt-1">
                    Joined {new Date(profile.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex gap-3 mt-2 text-xs font-mono text-slate-400">
                    <span>{vouches.length} vouch{vouches.length !== 1 ? 'es' : ''}</span>
                    <span>{credentials.length} credential{credentials.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

              {/* Credentials */}
              {credentials.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">
                    Verified skills
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {credentials.map((c) => (
                      <span key={c.id} className="px-2.5 py-1 rounded-full border border-cyan-electric/30 bg-cyan-electric/5 text-cyan-electric font-mono text-xs">
                        {c.skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Mutual vouchers */}
              {mutualVouches.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-electric inline-block" />
                    Mutual connections ({mutualVouches.length})
                  </div>
                  <ul className="space-y-2">
                    {mutualVouches.map((v) => (
                      <VoucherRow key={v.id} vouch={v} mutual />
                    ))}
                  </ul>
                </div>
              )}

              {/* All other vouchers */}
              {otherVouches.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">
                    {mutualVouches.length > 0 ? `Other vouchers (${otherVouches.length})` : `Vouched by (${otherVouches.length})`}
                  </div>
                  <ul className="space-y-2">
                    {otherVouches.map((v) => (
                      <VoucherRow key={v.id} vouch={v} mutual={false} />
                    ))}
                  </ul>
                </div>
              )}

              {vouches.length === 0 && (
                <div className="text-center text-slate-500 text-sm font-mono py-2">
                  No vouches yet.
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2 border-t border-cyan-electric/10">
                <Link
                  to={`/cosign?handle=${encodeURIComponent(profile.handle)}&hash=${encodeURIComponent(profile.face_hash)}&pid=${encodeURIComponent(profile.id)}`}
                  className="flex-1 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold text-sm text-center hover:shadow-glow transition"
                >
                  Vouch this person
                </Link>
                <button
                  onClick={onViewFull}
                  className="px-4 py-2.5 rounded-full border border-cyan-electric/30 text-cyan-electric font-mono text-sm hover:bg-cyan-electric/10 transition"
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
      mutual
        ? 'border-cyan-electric/30 bg-cyan-electric/5'
        : 'border-white/5 bg-navy-light/20'
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        {mutual && (
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-electric mt-0.5" />
        )}
        <div className="min-w-0">
          <Link
            to={`/p/${v.voucher.handle}`}
            className={`font-mono text-sm hover:underline ${mutual ? 'text-cyan-electric' : 'text-white'}`}
          >
            @{v.voucher.handle}
          </Link>
          {v.context && (
            <div className="text-xs text-slate-400 mt-0.5 truncate">{v.context}</div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-slate-500 font-mono shrink-0 mt-0.5">
        {new Date(v.created_at).toLocaleDateString()}
      </div>
    </li>
  );
}
