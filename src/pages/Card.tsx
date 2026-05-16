import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '../hooks/useUser';
import {
  deleteCredentialPhoto,
  listCredentialPhotos,
  listReviewsForTests,
  listTestsForCandidate,
  updateProfilePhoto,
  uploadCredentialPhoto,
} from '../lib/db';
import { captureVideoFrame } from '../lib/biometric';
import InterviewVideo from '../components/InterviewVideo';
import type { Credential, CredentialPhoto, SkillReviewWithReviewer, SkillTest } from '../lib/types';

export default function Card() {
  const { passport, profile, vouches, credentials, loading, error, refresh } = useUser();
  const [qr, setQr] = useState<string | null>(null);
  const [tests, setTests] = useState<SkillTest[]>([]);
  const [reviewsByTest, setReviewsByTest] = useState<Record<string, SkillReviewWithReviewer[]>>({});
  const [credentialPhotos, setCredentialPhotos] = useState<CredentialPhoto[]>([]);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  useEffect(() => {
    if (!passport) return;
    QRCode.toDataURL(
      JSON.stringify({ h: passport.handle, id: passport.hash, pid: passport.profileId }),
      { width: 280, margin: 1, color: { dark: '#050505', light: '#F2DDA4' } },
    ).then(setQr);
  }, [passport]);

  useEffect(() => {
    if (!profile) return;
    listTestsForCandidate(profile.id)
      .then(async (rows) => {
        setTests(rows);
        if (rows.length === 0) {
          setReviewsByTest({});
          return;
        }
        try {
          const reviews = await listReviewsForTests(rows.map((r) => r.id));
          const grouped: Record<string, SkillReviewWithReviewer[]> = {};
          for (const r of reviews) {
            (grouped[r.test_id] ??= []).push(r);
          }
          setReviewsByTest(grouped);
        } catch (e) {
          console.warn('failed to load reviews', e);
        }
      })
      .catch(console.error);
    listCredentialPhotos(profile.id).then(setCredentialPhotos).catch(console.error);
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
            <img src={qr} alt="Your Illume QR" className="w-48 md:w-64 aspect-square object-contain rounded-lg shrink-0" />
          ) : (
            <div className="w-48 md:w-64 aspect-square bg-black/40 rounded-lg" />
          )}
          <div className="flex-1 space-y-4 text-center md:text-left">
            <div className="flex items-center gap-4 justify-center md:justify-start">
              <button
                onClick={() => setShowPhotoModal(true)}
                className="shrink-0 group relative w-20 h-20 rounded-full overflow-hidden border-2 border-cyan-electric/60 shadow-glow focus:outline-none"
                title="Update photo"
              >
                {profile.photo ? (
                  <img src={profile.photo} alt={`${profile.handle} portrait`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-navy-light flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-slate-500">
                      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-white">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
              </button>
              <div>
                <div className="text-slate-500 font-mono text-xs uppercase tracking-widest">
                  Identity
                </div>
                <div className="text-2xl md:text-4xl font-mono font-bold text-cyan-electric mt-1 break-all">
                  @{profile.handle}
                </div>
                <div className="flex items-center gap-2 mt-2 justify-center md:justify-start flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cyan-electric/40 bg-cyan-electric/10 text-cyan-electric font-mono text-xs">
                    {passport.source === 'platform' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 shrink-0">
                        <rect x="2" y="6" width="20" height="14" rx="2" />
                        <path d="M8 6V4a4 4 0 018 0v2" strokeLinecap="round" />
                        <circle cx="12" cy="13" r="2" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 shrink-0">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                      </svg>
                    )}
                    {passport.biometricType ?? (passport.source === 'platform' ? 'Device Biometric' : 'Face Scan')}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">{passport.hash.slice(0, 16)}…</span>
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
          <ul className="space-y-3">
            {activeCreds.map((c) => {
              const test = c.test_id ? tests.find((t) => t.id === c.test_id) : undefined;
              const reviews = test ? reviewsByTest[test.id] ?? [] : [];
              return <CredentialCard key={c.id} credential={c} test={test} reviews={reviews} />;
            })}
          </ul>
        )}
      </Section>

      <Section title="Credential photos">
        <CredentialPhotosManager
          profileId={profile.id}
          photos={credentialPhotos}
          onChange={setCredentialPhotos}
        />
      </Section>

      {pendingTests.length > 0 && (
        <Section title="Pending review">
          <ul className="space-y-2">
            {pendingTests.map((t) => <SubmissionCard key={t.id} test={t} />)}
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

      <AnimatePresence>
        {showPhotoModal && profile && (
          <PhotoModal
            profileId={profile.id}
            onSaved={async () => { await refresh(); setShowPhotoModal(false); }}
            onClose={() => setShowPhotoModal(false)}
            isRequired={!profile.photo}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PhotoModal({
  profileId,
  onSaved,
  onClose,
  isRequired,
}: {
  profileId: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
  isRequired: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<'choose' | 'camera' | 'saving'>('choose');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCamera() {
    setMode('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError('Could not access camera.');
      setMode('choose');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function captureSnapshot() {
    if (!videoRef.current) return;
    const photo = captureVideoFrame(videoRef.current, 480, 0.85);
    if (photo) { stopCamera(); setPreview(photo); setMode('choose'); }
  }

  async function save() {
    if (!preview) return;
    setMode('saving');
    setError(null);
    try {
      await updateProfilePhoto(profileId, preview);
      await onSaved();
    } catch {
      setError('Failed to save photo.');
      setMode('choose');
    }
  }

  useEffect(() => () => stopCamera(), []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isRequired) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        className="bg-navy-deep border border-cyan-electric/30 rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-glow"
      >
        <div>
          <h3 className="text-xl font-mono font-bold text-cyan-electric">Add your photo</h3>
          <p className="text-slate-400 text-sm mt-1">
            {isRequired
              ? 'A photo is required on your card. Take one using your camera.'
              : 'Update your profile photo.'}
          </p>
        </div>

        {mode === 'camera' ? (
          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden aspect-square bg-black border border-cyan-electric/20 relative">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-3">
              <button
                onClick={captureSnapshot}
                className="flex-1 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold text-sm hover:shadow-glow transition"
              >
                Capture
              </button>
              <button onClick={() => { stopCamera(); setMode('choose'); }} className="px-4 py-2 text-slate-400 hover:text-cyan-electric text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {preview && (
              <div className="flex justify-center">
                <img src={preview} alt="Preview" className="w-32 h-32 rounded-full object-cover border-2 border-cyan-electric/60 shadow-glow" />
              </div>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={startCamera}
                className="flex items-center justify-center gap-2 py-2.5 rounded-full border border-cyan-electric/40 text-cyan-electric font-mono text-sm hover:bg-cyan-electric/10 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
                </svg>
                Take a photo
              </button>
            </div>
            {error && <div className="text-red-300 text-xs font-mono text-center">{error}</div>}
            <div className="flex gap-3 pt-1">
              {preview && (
                <button
                  onClick={save}
                  disabled={mode === 'saving'}
                  className="flex-1 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold text-sm hover:shadow-glow disabled:opacity-40 transition"
                >
                  {mode === 'saving' ? 'Saving…' : 'Save photo'}
                </button>
              )}
              {!isRequired && (
                <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-cyan-electric text-sm">
                  Skip
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
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

function CredentialCard({
  credential: c,
  test,
  reviews = [],
}: {
  credential: Credential;
  test?: SkillTest;
  reviews?: SkillReviewWithReviewer[];
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = !!(test && (test.video_url || test.question || test.answer || reviews.length > 0));
  return (
    <li className="rounded-lg border border-cyan-electric/30 bg-cyan-electric/5 overflow-hidden">
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        className="w-full px-4 py-3 text-left flex items-center justify-between gap-2"
        disabled={!canExpand}
      >
        <div className="space-y-0.5">
          <div className="font-mono text-cyan-electric text-lg">{c.skill}</div>
          <div className="text-xs text-slate-400">
            Issued {new Date(c.issued_at).toLocaleDateString()}
            {c.expires_at && <> · expires {new Date(c.expires_at).toLocaleDateString()}</>}
          </div>
        </div>
        {canExpand && (
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`w-4 h-4 text-cyan-electric/70 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {expanded && test && (
        <div className="border-t border-cyan-electric/20 px-4 py-4 space-y-4">
          {test.video_url && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Interview recording</div>
              <InterviewVideo src={test.video_url} className="w-full rounded-lg bg-black border border-white/5 max-h-64" />
            </div>
          )}
          {test.question && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Question</div>
              <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{test.question}</div>
            </div>
          )}
          {test.answer && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Spoken transcript</div>
              <div className="font-mono text-sm text-slate-200 bg-black/30 rounded px-3 py-2 border border-white/5 whitespace-pre-wrap">
                {test.answer}
              </div>
            </div>
          )}
          {(test.ai_score !== null || test.ai_rationale) && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">
                AI mark
                {test.ai_score !== null && (
                  <span className="ml-2 text-cyan-electric normal-case">{test.ai_score}/100</span>
                )}
                {test.ai_verdict && (
                  <span className={`ml-2 ${
                    test.ai_verdict === 'approve' ? 'text-cyan-electric' :
                    test.ai_verdict === 'reject' ? 'text-red-300' : 'text-amber-200'
                  }`}>· {test.ai_verdict}</span>
                )}
              </div>
              {test.ai_rationale && (
                <div className="text-sm text-slate-300 leading-relaxed">{test.ai_rationale}</div>
              )}
            </div>
          )}
          {reviews.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">
                Peer reviews
              </div>
              <ul className="space-y-1.5">
                {reviews.map((r) => (
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
                        <Link to={`/p/${r.reviewer.handle}`} className="underline hover:opacity-80">
                          @{r.reviewer.handle}
                        </Link>
                      </span>
                      <span className="opacity-60">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {r.notes && (
                      <div className="mt-1 text-slate-300/90 whitespace-pre-wrap">"{r.notes}"</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function SubmissionCard({ test: t }: { test: SkillTest }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 text-left flex items-center justify-between gap-2"
      >
        <div className="space-y-0.5">
          <div className="font-mono text-amber-200">{t.skill}</div>
          <div className="text-xs text-slate-400">
            Submitted {new Date(t.created_at).toLocaleString()} · awaiting peers
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
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
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-amber-500/20 px-4 py-4 space-y-4">
          {t.video_url && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Recording</div>
              <InterviewVideo src={t.video_url} className="w-full rounded-lg bg-black border border-white/5 max-h-64" />
            </div>
          )}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Spoken transcript</div>
            <div className="font-mono text-sm text-slate-200 bg-black/30 rounded px-3 py-2 border border-white/5 whitespace-pre-wrap">
              {t.answer}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Question</div>
            <div className="text-sm text-slate-400 leading-relaxed">{t.question}</div>
          </div>
          {t.ai_rationale && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">AI feedback</div>
              <div className="text-sm text-slate-300 leading-relaxed">{t.ai_rationale}</div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function CredentialPhotosManager({
  profileId,
  photos,
  onChange,
}: {
  profileId: string;
  photos: CredentialPhoto[];
  onChange: (next: CredentialPhoto[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<CredentialPhoto | null>(null);

  async function handleFile(file: File) {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isImage && !isPdf) {
      setErr('Only images and PDFs are supported.');
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      setErr('File too large (max 16 MB).');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const created = await uploadCredentialPhoto(profileId, file, label);
      onChange([created, ...photos]);
      setLabel('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(
        /bucket not found/i.test(msg)
          ? 'Storage bucket "credential-photos" not found. Create it in Supabase (see supabase/schema.sql).'
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(photo: CredentialPhoto) {
    if (!confirm('Delete this credential photo?')) return;
    setBusy(true);
    try {
      await deleteCredentialPhoto(photo);
      onChange(photos.filter((p) => p.id !== photo.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-cyan-electric/20 bg-navy-deep/40 p-4 space-y-3">
        <p className="text-xs text-slate-400 font-mono leading-relaxed">
          Upload images or PDFs of diplomas, licenses, certificates, or other
          off-platform proof. They appear on your public profile.
        </p>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Optional label (e.g. MD diploma, Stanford 2018)"
          maxLength={140}
          className="w-full bg-navy border border-cyan-electric/30 text-white font-mono px-3 py-2 rounded text-sm focus:outline-none focus:border-cyan-electric transition"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="text-xs text-slate-400 font-mono file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-cyan-electric file:text-navy-deep file:font-semibold file:cursor-pointer hover:file:shadow-glow"
          />
          {busy && <span className="text-xs text-cyan-electric font-mono animate-pulse">Uploading…</span>}
        </div>
        {err && <div className="text-xs text-red-300 font-mono">{err}</div>}
      </div>

      {photos.length === 0 ? (
        <div className="rounded-lg border border-cyan-electric/10 bg-navy-deep/40 px-4 py-6 text-center text-slate-400 text-sm">
          No credential photos uploaded yet.
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((p) => {
            const pdf = isPdfUrl(p.photo_url);
            return (
              <li
                key={p.id}
                className="rounded-lg border border-cyan-electric/20 bg-black/30 overflow-hidden group relative"
              >
                {pdf ? (
                  <a
                    href={p.photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full aspect-square bg-gradient-to-br from-navy-deep to-black hover:from-cyan-electric/10 transition"
                    title="Open PDF"
                  >
                    <PdfIcon />
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
                      className="w-full h-full object-cover group-hover:opacity-90 transition"
                    />
                  </button>
                )}
                <div className="px-2 py-1.5 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-mono text-slate-300 truncate" title={p.label ?? ''}>
                    {p.label || (pdf ? 'PDF' : 'Untitled')}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    disabled={busy}
                    title="Delete"
                    className="text-red-300/70 hover:text-red-300 text-xs font-mono disabled:opacity-40"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
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
    </div>
  );
}

function isPdfUrl(url: string): boolean {
  try {
    return /\.pdf(?:$|\?)/i.test(new URL(url).pathname);
  } catch {
    return /\.pdf$/i.test(url);
  }
}

function PdfIcon() {
  return (
    <div className="flex flex-col items-center gap-1 text-cyan-electric">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-10 h-10">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[10px] tracking-widest">PDF</span>
    </div>
  );
}
