import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import FaceVerify from '../components/FaceVerify';
import { useUser } from '../hooks/useUser';
import {
  listAllPendingTests,
  listReviewsForTests,
  maybeFinalizeTest,
  submitReview,
} from '../lib/db';
import { APPROVAL_THRESHOLD } from '../lib/types';
import type { SkillTestWithCandidate } from '../lib/types';

export default function Review() {
  const { passport, profile, credentials, loading } = useUser();
  const [filter, setFilter] = useState<string>('');
  const [allTests, setAllTests] = useState<SkillTestWithCandidate[]>([]);
  const [tallies, setTallies] = useState<Record<string, { approve: number; reject: number }>>({});
  const [busy, setBusy] = useState(false);
  const [pendingVerdict, setPendingVerdict] = useState<{
    test: SkillTestWithCandidate;
    verdict: 'approve' | 'reject';
    notes: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const verifiedSkills = credentials
    .filter((c) => !c.revoked)
    .map((c) => c.skill.toLowerCase());

  useEffect(() => {
    if (!profile) return;
    setError(null);
    listAllPendingTests(profile.id)
      .then(async (rows) => {
        setAllTests(rows);
        try {
          const reviews = await listReviewsForTests(rows.map((r) => r.id));
          const next: Record<string, { approve: number; reject: number }> = {};
          for (const r of rows) next[r.id] = { approve: 0, reject: 0 };
          for (const rev of reviews) {
            const t = next[rev.test_id] ?? { approve: 0, reject: 0 };
            if (rev.verdict === 'approve') t.approve += 1;
            else if (rev.verdict === 'reject') t.reject += 1;
            next[rev.test_id] = t;
          }
          setTallies(next);
        } catch (e) {
          console.warn('failed to load review tallies', e);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [profile, flash]);

  const tests = (() => {
    const q = filter.trim().toLowerCase().replace(/^@/, '');
    if (!q) return allTests;
    return allTests.filter(
      (t) =>
        t.skill.toLowerCase().includes(q) ||
        t.candidate.handle.toLowerCase().includes(q),
    );
  })();

  if (loading) {
    return <div className="text-slate-400 font-mono">Loading…</div>;
  }

  if (!passport || !profile) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-3xl font-mono text-cyan-electric">Review queue</h2>
        <p className="text-slate-400">
          You need a card before you can review peers.
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

  async function commit(distance: number | null) {
    if (!pendingVerdict || !profile) return;
    setBusy(true);
    const { test, verdict, notes } = pendingVerdict;
    try {
      await submitReview({
        test_id: test.id,
        reviewer_id: profile.id,
        verdict,
        notes: notes.trim() || undefined,
      });
      const outcome = await maybeFinalizeTest(test.id, test.candidate.id, test.skill);
      setAllTests((cur) => cur.filter((t) => t.id !== test.id));
      setFlash(
        outcome.finalized
          ? `Threshold reached — test ${outcome.outcome}.`
          : `Recorded as ${verdict}. Needs ${APPROVAL_THRESHOLD} of the same verdict to finalize.`,
      );
      // Surface match score for honesty.
      if (distance !== null) {
        console.info('reviewer face-match distance', distance);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record verdict.');
    } finally {
      setBusy(false);
      setPendingVerdict(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header className="space-y-2">
        <h2 className="text-4xl font-mono font-bold text-cyan-electric">
          Peer Review
        </h2>
        <p className="text-slate-400">
          Read what a candidate wrote under time pressure, then approve or
          reject. {APPROVAL_THRESHOLD} approvals issue a credential;{' '}
          {APPROVAL_THRESHOLD} rejections close the test. Every verdict is signed
          with your biometric.
        </p>
      </header>

      <div className="space-y-2">
        <label className="block text-sm font-mono text-slate-400 uppercase tracking-widest">
          Filter by skill or person
        </label>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder='e.g. "Medicine" or "@alice" — leave blank for everything'
          className="w-full bg-navy-deep border border-cyan-electric/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-cyan-electric transition"
        />
        <div className="text-xs text-slate-500 font-mono">
          {allTests.length} pending overall · {tests.length} match
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm font-mono">
          {error}
        </div>
      )}
      {flash && (
        <div className="rounded-lg border border-cyan-electric/40 bg-cyan-electric/5 text-cyan-electric px-4 py-3 text-sm font-mono">
          {flash}
        </div>
      )}

      {tests.length === 0 && (
        <div className="rounded-lg border border-cyan-electric/10 bg-navy-deep/40 px-4 py-6 text-center text-slate-400 text-sm">
          {allTests.length === 0
            ? 'No pending tests in the network right now.'
            : `Nothing pending matches "${filter}".`}
        </div>
      )}

      <ul className="space-y-4">
        {tests.map((t) => (
          <li
            key={t.id}
            className="rounded-2xl border border-cyan-electric/20 bg-navy-deep/60 p-5 space-y-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <Link
                  to={`/p/${t.candidate.handle}`}
                  className="font-mono text-cyan-electric text-lg hover:underline"
                >
                  @{t.candidate.handle}
                </Link>
                <div className="text-xs text-slate-500 font-mono">
                  {new Date(t.created_at).toLocaleString()}
                  {t.duration_seconds != null && (
                    <> · answered in {t.duration_seconds}s</>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {(() => {
                  const tally = tallies[t.id] ?? { approve: 0, reject: 0 };
                  const aiApprove = t.ai_verdict === 'approve' ? 1 : 0;
                  const aiReject = t.ai_verdict === 'reject' ? 1 : 0;
                  const approves = tally.approve + aiApprove;
                  const rejects = tally.reject + aiReject;
                  return (
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded-full border border-cyan-electric/20 text-slate-300 bg-black/20"
                      title={`${tally.approve} peer approve${tally.approve === 1 ? '' : 's'}${aiApprove ? ' + AI approve' : ''} / ${tally.reject} peer reject${tally.reject === 1 ? '' : 's'}${aiReject ? ' + AI reject' : ''} · ${APPROVAL_THRESHOLD} of either finalises`}
                    >
                      <span className="text-cyan-electric">{approves}</span>
                      <span className="opacity-50">/{APPROVAL_THRESHOLD}</span>
                      <span className="opacity-50"> · </span>
                      <span className="text-red-300">{rejects}</span>
                      <span className="opacity-50">/{APPROVAL_THRESHOLD}</span>
                    </span>
                  );
                })()}
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                    verifiedSkills.includes(t.skill.toLowerCase())
                      ? 'border-cyan-electric/50 text-cyan-electric bg-cyan-electric/5'
                      : 'border-slate-600/40 text-slate-400'
                  }`}
                  title={
                    verifiedSkills.includes(t.skill.toLowerCase())
                      ? 'You hold a credential in this exact skill'
                      : 'You are not credentialed in this skill — production would gate review'
                  }
                >
                  {t.skill}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">
                  Scenario
                </div>
                <div className="text-slate-300 text-sm">{t.question}</div>
              </div>
              {t.video_url && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">
                    Interview recording
                  </div>
                  <video src={t.video_url} controls className="w-full rounded-lg bg-black border border-cyan-electric/15 max-h-64" />
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">
                  Spoken transcript
                </div>
                <div className="text-white text-sm whitespace-pre-wrap font-mono bg-black/30 rounded-lg px-3 py-2 border border-white/5">
                  {t.answer}
                </div>
              </div>
              {t.ai_verdict && (
                <AiMark
                  verdict={t.ai_verdict}
                  score={t.ai_score}
                  rationale={t.ai_rationale}
                />
              )}
            </div>
            <ReviewActions
              onApprove={(notes) =>
                setPendingVerdict({ test: t, verdict: 'approve', notes })
              }
              onReject={(notes) =>
                setPendingVerdict({ test: t, verdict: 'reject', notes })
              }
              disabled={busy}
            />
          </li>
        ))}
      </ul>

      {pendingVerdict && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur z-30 flex items-center justify-center p-4">
          <div className="bg-navy-deep border border-cyan-electric/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-glow">
            <h3 className="text-xl font-mono text-cyan-electric">
              Sign your {pendingVerdict.verdict}
            </h3>
            <p className="text-slate-400 text-sm">
              Re-verify your biometric to record this verdict against{' '}
              <span className="text-white">@{pendingVerdict.test.candidate.handle}</span>.
            </p>
            <FaceVerify
              passport={passport}
              onCancel={() => setPendingVerdict(null)}
              onVerified={({ distance }) => commit(distance)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AiMark({
  verdict,
  score,
  rationale,
}: {
  verdict: 'approve' | 'reject' | 'borderline';
  score: number | null;
  rationale: string | null;
}) {
  const color =
    verdict === 'approve'
      ? 'border-cyan-electric/40 bg-cyan-electric/5 text-cyan-electric'
      : verdict === 'reject'
        ? 'border-red-400/40 bg-red-500/5 text-red-300'
        : 'border-amber-400/40 bg-amber-500/5 text-amber-200';
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest font-mono opacity-70">
          AI mark · counts as 1 vote
        </span>
        <span className="font-mono text-sm">
          {verdict.toUpperCase()}
          {score !== null && <span className="opacity-70"> · {score}/100</span>}
        </span>
      </div>
      {rationale && (
        <p className="text-xs leading-relaxed mt-1 opacity-90">{rationale}</p>
      )}
    </div>
  );
}

function ReviewActions({
  onApprove,
  onReject,
  disabled,
}: {
  onApprove: (notes: string) => void;
  onReject: (notes: string) => void;
  disabled: boolean;
}) {
  const [notes, setNotes] = useState('');
  return (
    <div className="space-y-3 border-t border-cyan-electric/10 pt-4">
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional reviewer notes"
        className="w-full bg-navy border border-cyan-electric/30 text-white font-mono px-3 py-2 rounded text-sm focus:outline-none focus:border-cyan-electric transition"
      />
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => onReject(notes)}
          disabled={disabled}
          className="px-5 py-2 rounded-full border border-red-400/40 text-red-300 font-mono text-sm hover:bg-red-500/10 disabled:opacity-40"
        >
          Reject
        </button>
        <button
          onClick={() => onApprove(notes)}
          disabled={disabled}
          className="px-5 py-2 rounded-full bg-cyan-electric text-navy-deep font-semibold text-sm hover:shadow-glow disabled:opacity-40"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
