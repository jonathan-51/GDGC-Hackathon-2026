import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { motion } from 'framer-motion';
import {
  getProfileByHandle,
  listCredentialPhotos,
  listCredentialsFor,
  listReviewsForTests,
  listTestsForCandidate,
  listVouchesFor,
} from '../lib/db';
import { useUser } from '../hooks/useUser';
import type {
  Credential,
  CredentialPhoto,
  Profile,
  SkillReviewWithReviewer,
  SkillTest,
  VouchWithVoucher,
} from '../lib/types';

export default function PublicProfile() {
  const { handle = '' } = useParams<{ handle: string }>();
  const { profile: viewerProfile } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vouches, setVouches] = useState<VouchWithVoucher[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [interviews, setInterviews] = useState<SkillTest[]>([]);
  const [reviewsByTest, setReviewsByTest] = useState<Record<string, SkillReviewWithReviewer[]>>({});
  const [credentialPhotos, setCredentialPhotos] = useState<CredentialPhoto[]>([]);
  const [lightbox, setLightbox] = useState<CredentialPhoto | null>(null);
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
    setInterviews([]);
    setReviewsByTest({});
    setCredentialPhotos([]);
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
        const [v, c, tests, photos, qrUrl] = await Promise.all([
          listVouchesFor(p.id),
          listCredentialsFor(p.id),
          listTestsForCandidate(p.id),
          listCredentialPhotos(p.id),
          QRCode.toDataURL(
            JSON.stringify({ h: p.handle, id: p.face_hash, pid: p.id }),
            { width: 240, margin: 1, color: { dark: '#050505', light: '#F2DDA4' } },
          ),
        ]);
        if (cancelled) return;
        setVouches(v);
        setCredentials(c);
        setInterviews(tests);
        setCredentialPhotos(photos);
        setQr(qrUrl);
        if (tests.length > 0) {
          const reviews = await listReviewsForTests(tests.map((t) => t.id));
          if (cancelled) return;
          const grouped: Record<string, SkillReviewWithReviewer[]> = {};
          for (const r of reviews) {
            (grouped[r.test_id] ??= []).push(r);
          }
          setReviewsByTest(grouped);
        }
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
            {viewerProfile && viewerProfile.id !== profile.id && (() => {
              const alreadyVouched = vouches.some((v) => v.voucher.id === viewerProfile.id);
              const params = new URLSearchParams({
                handle: profile.handle,
                hash: profile.face_hash,
                pid: profile.id,
              });
              return alreadyVouched ? (
                <div className="text-xs text-cyan-electric/80 font-mono text-center md:text-left">
                  ✓ You've already vouched for @{profile.handle}
                </div>
              ) : (
                <div className="flex justify-center md:justify-start">
                  <Link
                    to={`/cosign?${params.toString()}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold text-sm hover:shadow-glow transition"
                  >
                    Vouch for @{profile.handle}
                  </Link>
                </div>
              );
            })()}
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

      {credentialPhotos.length > 0 && (
        <Section title="Credential photos">
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {credentialPhotos.map((p) => {
              const pdf = /\.pdf(?:$|\?)/i.test(p.photo_url);
              return (
                <li
                  key={p.id}
                  className="rounded-lg border border-cyan-electric/20 bg-black/30 overflow-hidden"
                >
                  {pdf ? (
                    <a
                      href={p.photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-full aspect-square bg-gradient-to-br from-navy-deep to-black hover:from-cyan-electric/10 transition"
                      title="Open PDF"
                    >
                      <div className="flex flex-col items-center gap-1 text-cyan-electric">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-10 h-10">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-mono text-[10px] tracking-widest">PDF</span>
                      </div>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLightbox(p)}
                      className="block w-full aspect-square overflow-hidden"
                    >
                      <img
                        src={p.photo_url}
                        alt={p.label ?? 'credential'}
                        className="w-full h-full object-cover hover:opacity-90 transition"
                      />
                    </button>
                  )}
                  {(p.label || pdf) && (
                    <div className="px-2 py-1.5 text-[11px] font-mono text-slate-300 truncate" title={p.label ?? ''}>
                      {p.label || 'PDF'}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="max-w-3xl w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.photo_url}
              alt={lightbox.label ?? ''}
              className="w-full max-h-[80vh] object-contain rounded-lg border border-cyan-electric/30 bg-black"
            />
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="font-mono text-cyan-electric">{lightbox.label || 'Untitled'}</div>
              <button
                onClick={() => setLightbox(null)}
                className="px-4 py-1.5 rounded-full border border-cyan-electric/40 text-cyan-electric font-mono text-xs hover:bg-cyan-electric/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {interviews.length > 0 && (
        <Section title="Skill assessments">
          <div className="space-y-4">
            {interviews.map((t) => {
              const testReviews = reviewsByTest[t.id] ?? [];
              return (
              <div key={t.id} className="rounded-xl border border-cyan-electric/15 bg-navy-deep/60 overflow-hidden">
                {t.video_url && <video src={t.video_url} controls className="w-full bg-black" />}
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm text-cyan-electric">{t.skill}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {new Date(t.created_at).toLocaleDateString()} ·{' '}
                        <span className={
                          t.status === 'approved' ? 'text-cyan-electric' :
                          t.status === 'rejected' ? 'text-red-300' : 'text-amber-200'
                        }>{t.status}</span>
                        {' · '}
                        <span className="text-cyan-electric">
                          AI {t.ai_score ?? '—'}/100
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">
                      Spoken transcript
                    </div>
                    <div className="font-mono text-sm text-slate-200 bg-black/30 rounded px-3 py-2 border border-white/5 whitespace-pre-wrap">
                      {t.answer}
                    </div>
                  </div>
                  {testReviews.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">
                        Peer reviews
                      </div>
                      <ul className="space-y-1.5">
                        {testReviews.map((r) => (
                          <li
                            key={r.id}
                            className={`rounded border px-3 py-2 text-xs font-mono ${
                              r.verdict === 'approve'
                                ? 'border-cyan-electric/30 bg-cyan-electric/5 text-cyan-electric'
                                : 'border-red-400/30 bg-red-500/5 text-red-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>
                                {r.verdict === 'approve' ? '✓ approved' : '✗ rejected'} by{' '}
                                <Link
                                  to={`/p/${r.reviewer.handle}`}
                                  className="underline hover:opacity-80"
                                >
                                  @{r.reviewer.handle}
                                </Link>
                              </span>
                              <span className="opacity-60">
                                {new Date(r.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            {r.notes && (
                              <div className="mt-1 text-slate-300/90 whitespace-pre-wrap">
                                "{r.notes}"
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </Section>
      )}
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
