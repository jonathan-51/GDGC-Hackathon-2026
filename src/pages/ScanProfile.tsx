import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRScanner from '../components/QRScanner';
import { searchProfilesByHandle } from '../lib/db';
import type { Profile } from '../lib/types';

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
  const [error, setError] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);

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
    if (!parsed) {
      setError(`That QR is not a Vouch card. Decoded: ${text.slice(0, 80)}`);
      return;
    }
    navigate(`/p/${encodeURIComponent(parsed.handle)}`);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim().replace(/^@/, '');
    if (!q) return;
    if (results.length === 1) navigate(`/p/${encodeURIComponent(results[0].handle)}`);
    else navigate(`/p/${encodeURIComponent(q)}`);
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header className="space-y-2">
        <h2 className="text-4xl font-mono font-bold text-cyan-electric">Find a Profile</h2>
        <p className="text-slate-400">
          Scan a Vouch QR code or search by handle to open someone's public profile.
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
        {searchError && (
          <div className="text-xs text-red-300 font-mono">{searchError}</div>
        )}
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
                <Link
                  to={`/p/${encodeURIComponent(p.handle)}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-cyan-electric/5 transition"
                >
                  {p.photo ? (
                    <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover border border-cyan-electric/30" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-black/40 border border-cyan-electric/20" />
                  )}
                  <span className="font-mono text-cyan-electric text-sm">@{p.handle}</span>
                </Link>
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
    </div>
  );
}
