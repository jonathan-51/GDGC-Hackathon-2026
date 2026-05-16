import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { motion } from 'framer-motion';
import {
  getProfileByHandle,
  listCredentialsFor,
  listVouchesFor,
} from '../lib/db';
import type { Credential, Profile, VouchWithVoucher } from '../lib/types';

export default function PublicProfile() {
  const { handle = '' } = useParams<{ handle: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vouches, setVouches] = useState<VouchWithVoucher[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);
    setVouches([]);
    setCredentials([]);
    setQr(null);

    (async () => {
      try {
        const p = await getProfileByHandle(handle);
        if (cancelled) return;
        if (!p) {
          setError(`No card found for @${handle}.`);
          setLoading(false);
          return;
        }
        setProfile(p);
        const [v, c, qrUrl] = await Promise.all([
          listVouchesFor(p.id),
          listCredentialsFor(p.id),
          QRCode.toDataURL(
            JSON.stringify({ h: p.handle, id: p.face_hash, pid: p.id }),
            { width: 240, margin: 1, color: { dark: '#0a0e27', light: '#00ffd1' } },
          ),
        ]);
        if (cancelled) return;
        setVouches(v);
        setCredentials(c);
        setQr(qrUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (loading) {
    return <div className="text-slate-400 font-mono">Looking up @{handle}…</div>;
  }

  if (error || !profile) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-3xl font-mono text-cyan-electric">@{handle}</h2>
        <p className="text-red-300 font-mono text-sm">{error}</p>
        <Link to="/" className="text-cyan-electric font-mono text-sm hover:underline">
          ← back to home
        </Link>
      </div>
    );
  }

  const activeCreds = credentials.filter(
    (c) => !c.revoked && (!c.expires_at || new Date(c.expires_at) > new Date()),
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-cyan-electric/30 bg-navy-deep p-8 shadow-glow"
      >
        <div className="flex flex-col md:flex-row gap-8 items-center">
          {qr ? (
            <img src={qr} alt={`${profile.handle} QR`} className="w-56 h-56 rounded-lg shrink-0" />
          ) : (
            <div className="w-56 h-56 bg-black/40 rounded-lg" />
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
                  Public card
                </div>
                <div className="text-4xl font-mono font-bold text-cyan-electric mt-1">
                  @{profile.handle}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1">
                  joined {new Date(profile.created_at).toLocaleDateString()} ·{' '}
                  {profile.face_hash.slice(0, 12)}…
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <Stat label="Vouches" value={vouches.length} />
              <Stat label="Credentials" value={activeCreds.length} />
            </div>
          </div>
        </div>
      </motion.div>

      <Section title="Vouched by">
        {vouches.length === 0 ? (
          <Empty>No one has co-signed this card yet.</Empty>
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Trusted to">
        {activeCreds.length === 0 ? (
          <Empty>No verified skills yet.</Empty>
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
