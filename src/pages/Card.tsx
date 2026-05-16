import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { motion } from 'framer-motion';
import { useUser } from '../hooks/useUser';
import { listTestsForCandidate } from '../lib/db';
import type { SkillTest } from '../lib/types';

export default function Card() {
  const { passport, profile, vouches, credentials, loading, error, refresh } = useUser();
  const [qr, setQr] = useState<string | null>(null);
  const [tests, setTests] = useState<SkillTest[]>([]);

  useEffect(() => {
    if (!passport) return;
    QRCode.toDataURL(
      JSON.stringify({ h: passport.handle, id: passport.hash, pid: passport.profileId }),
      { width: 280, margin: 1, color: { dark: '#0a0e27', light: '#00ffd1' } },
    ).then(setQr);
  }, [passport]);

  useEffect(() => {
    if (!profile) return;
    listTestsForCandidate(profile.id).then(setTests).catch(console.error);
  }, [profile]);

  if (loading) {
    return <div className="text-slate-400 font-mono">Loading your card…</div>;
  }

  if (!passport) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-3xl font-mono text-cyan-electric">No card yet</h2>
        <p className="text-slate-400">Register first to generate your card.</p>
        <Link
          to="/register"
          className="inline-block px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition"
        >
          Generate your card
        </Link>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-3xl font-mono text-cyan-electric">Card unavailable</h2>
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 font-mono text-sm">
          {error ?? 'Could not load your profile from Supabase.'}
        </div>
        <p className="text-slate-400 text-sm">
          Your local passport says you're <span className="text-cyan-electric">@{passport.handle}</span>{' '}
          (profile id {passport.profileId}). Most likely causes:
        </p>
        <ul className="text-slate-400 text-sm list-disc list-inside space-y-1">
          <li>The schema isn't applied to this Supabase project — run <code className="text-cyan-electric">supabase/schema.sql</code> in the SQL Editor.</li>
          <li>Your <code className="text-cyan-electric">.env</code> points at a different project than the one you registered against — re-register or fix the env.</li>
          <li>Row Level Security is blocking reads — re-run <code className="text-cyan-electric">supabase/schema.sql</code>; it sets permissive policies.</li>
        </ul>
        <div className="flex gap-3">
          <button
            onClick={refresh}
            className="px-4 py-2 rounded-full border border-cyan-electric/40 text-cyan-electric font-mono text-sm hover:bg-cyan-electric/10"
          >
            Retry
          </button>
          <Link
            to="/register"
            className="px-4 py-2 rounded-full bg-cyan-electric text-navy-deep font-semibold text-sm hover:shadow-glow"
          >
            Re-register
          </Link>
        </div>
      </div>
    );
  }

  const activeCreds = credentials.filter(
    (c) => !c.revoked && (!c.expires_at || new Date(c.expires_at) > new Date()),
  );
  const pendingTests = tests.filter((t) => t.status === 'pending');

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-cyan-electric/30 bg-navy-deep p-4 md:p-8 shadow-glow"
      >
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-center">
          {qr ? (
            <img src={qr} alt="Your Vouch QR" className="w-48 h-48 md:w-64 md:h-64 rounded-lg shrink-0" />
          ) : (
            <div className="w-48 h-48 md:w-64 md:h-64 bg-black/40 rounded-lg" />
          )}
          <div className="flex-1 space-y-4 text-center md:text-left">
            <div className="flex items-center gap-4 justify-center md:justify-start">
              {profile.photo && (
                <img
                  src={profile.photo}
                  alt={`${profile.handle} portrait`}
                  className="w-20 h-20 rounded-full object-cover border-2 border-cyan-electric/60 shadow-glow shrink-0"
                />
              )}
              <div>
                <div className="text-slate-500 font-mono text-xs uppercase tracking-widest">
                  Identity
                </div>
                <div className="text-2xl md:text-4xl font-mono font-bold text-cyan-electric mt-1 break-all">
                  @{profile.handle}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1">
                  {passport.source === 'platform' ? 'device biometric' : 'face hash'} ·{' '}
                  {passport.hash.slice(0, 16)}…
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Vouches" value={vouches.length} />
              <Stat label="Credentials" value={activeCreds.length} />
              <Stat label="Pending" value={pendingTests.length} />
            </div>
          </div>
        </div>
      </motion.div>

      <Section title="Vouches">
        {vouches.length === 0 ? (
          <Empty>
            No one has co-signed your card yet. Show it to people who know you and
            have them open <Link to="/cosign" className="text-cyan-electric">Verify Peer</Link>.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {vouches.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-lg border border-cyan-electric/15 bg-navy-light/30 px-4 py-3"
              >
                <div>
                  <Link
                    to={`/p/${v.voucher.handle}`}
                    className="font-mono text-white hover:text-cyan-electric transition"
                  >
                    @{v.voucher.handle}
                  </Link>
                  {v.context && (
                    <div className="text-xs text-slate-400 mt-0.5">{v.context}</div>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-mono text-right">
                  {new Date(v.created_at).toLocaleDateString()}
                  {v.match_distance !== null && (
                    <div className="text-[10px] text-cyan-electric/70">
                      match {v.match_distance.toFixed(2)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Credentials">
        {activeCreds.length === 0 ? (
          <Empty>
            No verified skills yet.{' '}
            <Link to="/skill-test" className="text-cyan-electric">Take a skill test</Link>.
          </Empty>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {activeCreds.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-cyan-electric/30 bg-cyan-electric/5 p-4"
              >
                <div className="font-mono text-cyan-electric text-lg">{c.skill}</div>
                <div className="text-xs text-slate-400 mt-1">
                  Issued {new Date(c.issued_at).toLocaleDateString()}
                  {c.expires_at && (
                    <> · expires {new Date(c.expires_at).toLocaleDateString()}</>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {pendingTests.length > 0 && (
        <Section title="Pending review">
          <ul className="space-y-2">
            {pendingTests.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-mono text-amber-200">{t.skill}</div>
                  {t.ai_verdict && (
                    <div className="text-xs font-mono text-slate-300">
                      AI: <span className={
                        t.ai_verdict === 'approve' ? 'text-cyan-electric'
                        : t.ai_verdict === 'reject' ? 'text-red-300'
                        : 'text-amber-200'
                      }>{t.ai_verdict}</span>
                      {t.ai_score !== null && <> · {t.ai_score}/100</>}
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  Submitted {new Date(t.created_at).toLocaleString()} · awaiting peers
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex justify-center pt-4">
        <button
          onClick={refresh}
          className="px-4 py-2 text-sm text-slate-400 hover:text-cyan-electric"
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-cyan-electric/15 bg-navy-light/30 py-2">
      <div className="text-2xl font-mono text-cyan-electric">{value}</div>
      <div className="text-[10px] text-slate-400 uppercase tracking-widest">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-mono uppercase tracking-widest text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-cyan-electric/10 bg-navy-deep/40 px-4 py-6 text-center text-slate-400 text-sm">
      {children}
    </div>
  );
}
