import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useUser } from '../hooks/useUser';
import { generateSkillScenario, geminiEnabled, gradeSkillAnswer, type AiGrade } from '../lib/gemini';
import { createSkillTest, maybeFinalizeTest } from '../lib/db';
import { SKILL_TEST_SECONDS, VOUCH_SKILLS } from '../lib/types';

type Stage = 'choose' | 'generating' | 'answering' | 'grading' | 'done';

export default function SkillTest() {
  const { passport, profile, loading } = useUser();
  const [stage, setStage] = useState<Stage>('choose');
  const [skill, setSkill] = useState<string>('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(SKILL_TEST_SECONDS);
  const [grade, setGrade] = useState<AiGrade | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stage !== 'answering') return;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, SKILL_TEST_SECONDS - elapsed);
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(id);
        submit(SKILL_TEST_SECONDS);
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  if (loading) {
    return <div className="text-slate-400 font-mono">Loading…</div>;
  }

  if (!passport || !profile) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-3xl font-mono text-cyan-electric">Live Skill Assessment</h2>
        <p className="text-slate-400">
          You need a card before you can prove a skill on it.
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

  async function start(chosen: string) {
    setSkill(chosen);
    setError(null);
    setStage('generating');
    try {
      const q = await generateSkillScenario(chosen);
      setQuestion(q);
      setAnswer('');
      setSecondsLeft(SKILL_TEST_SECONDS);
      setStage('answering');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate scenario.');
      setStage('choose');
    }
  }

  async function submit(usedSeconds: number) {
    if (!profile) return;
    setStage('grading');
    try {
      const finalAnswer = answer.trim() || '(no answer)';
      const g = await gradeSkillAnswer(skill, question, finalAnswer);
      setGrade(g);
      const test = await createSkillTest({
        candidate_id: profile.id,
        skill,
        question,
        answer: finalAnswer,
        duration_seconds: usedSeconds,
        ai_score: g.score,
        ai_verdict: g.verdict,
        ai_rationale: g.rationale,
      });
      // The AI verdict counts as one vote — if it's a reject and another peer
      // rejects, the test closes; if it's an approve, one peer approval seals it.
      await maybeFinalizeTest(test.id, profile.id, skill);
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
      setStage('answering');
    }
  }

  if (stage === 'choose') {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <h2 className="text-4xl font-mono font-bold text-cyan-electric">
            Live Skill Assessment
          </h2>
          <p className="text-slate-400">
            Describe what you do. Be specific — "Software engineering, embedded C"
            tests harder than "Engineering". An AI generates one realistic
            scenario inside that field's actual working context, then you have{' '}
            {SKILL_TEST_SECONDS} seconds to answer. Peers in the same field review.
          </p>
          {!geminiEnabled && (
            <div className="text-xs text-amber-300/80 font-mono">
              Gemini key not set — using built-in scenarios. Set
              VITE_GEMINI_API_KEY for live generation.
            </div>
          )}
        </header>
        <SkillEntry onStart={start} />
        {error && (
          <div className="text-red-300 font-mono text-sm">{error}</div>
        )}
      </div>
    );
  }

  if (stage === 'generating') {
    return (
      <div className="text-center py-20">
        <div className="text-cyan-electric font-mono animate-pulse">
          Generating scenario for {skill}…
        </div>
      </div>
    );
  }

  if (stage === 'answering') {
    const ratio = secondsLeft / SKILL_TEST_SECONDS;
    const lowTime = secondsLeft <= 20;
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <div className="text-slate-500 font-mono text-xs uppercase tracking-widest">
              Scenario
            </div>
            <h2 className="text-2xl font-mono font-bold text-cyan-electric">
              {skill}
            </h2>
          </div>
          <div className={`font-mono text-3xl tabular-nums ${lowTime ? 'text-red-300' : 'text-cyan-electric'}`}>
            {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
            {String(secondsLeft % 60).padStart(2, '0')}
          </div>
        </header>
        <div className="h-1 bg-navy-light rounded overflow-hidden">
          <motion.div
            initial={false}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ ease: 'linear', duration: 0.25 }}
            className={`h-full ${lowTime ? 'bg-red-400' : 'bg-cyan-electric'}`}
          />
        </div>
        <div className="rounded-xl border border-cyan-electric/20 bg-navy-deep/60 p-5 text-slate-200 leading-relaxed">
          {question}
        </div>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer. Be concrete."
          autoFocus
          className="w-full min-h-[200px] bg-navy-deep border border-cyan-electric/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-cyan-electric transition resize-y"
        />
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div className="text-xs text-slate-500 font-mono">
            {answer.length} chars · auto-submits at 00:00
          </div>
          <button
            onClick={() => submit(SKILL_TEST_SECONDS - secondsLeft)}
            disabled={!answer.trim()}
            className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold disabled:opacity-40 hover:shadow-glow transition"
          >
            Submit for peer review
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'grading') {
    return (
      <div className="text-center py-20 space-y-3">
        <div className="text-cyan-electric font-mono animate-pulse text-lg">
          AI is marking your answer…
        </div>
        <div className="text-xs text-slate-500 font-mono">
          Peer review opens in a moment.
        </div>
      </div>
    );
  }

  // done
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {grade && <AiGradeCard grade={grade} />}
      <div className="rounded-2xl border border-cyan-electric/40 bg-cyan-electric/5 p-8 text-center space-y-4">
        <div className="text-cyan-electric text-5xl font-mono">⌛</div>
        <h3 className="text-2xl font-mono text-white">Submitted</h3>
        <p className="text-slate-400">
          The AI's mark counts as one vote. Verified peers in{' '}
          <span className="text-cyan-electric">{skill}</span> review next — once
          the total tips far enough, the test closes and a credential is issued.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link
            to="/card"
            className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition"
          >
            View card
          </Link>
          <button
            onClick={() => {
              setStage('choose');
              setSkill('');
              setQuestion('');
              setAnswer('');
              setGrade(null);
              setError(null);
            }}
            className="px-6 py-2.5 rounded-full border border-cyan-electric/40 text-cyan-electric font-mono hover:bg-cyan-electric/10 transition"
          >
            Test another skill
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillEntry({ onStart }: { onStart: (skill: string) => void }) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trimmed.length >= 3) onStart(trimmed);
          }}
          placeholder='e.g. "Software engineering — embedded C"'
          maxLength={120}
          autoFocus
          className="flex-1 bg-navy-deep border border-cyan-electric/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-cyan-electric focus:shadow-glow transition"
        />
        <button
          onClick={() => onStart(trimmed)}
          disabled={trimmed.length < 3}
          className="px-6 py-3 rounded-full bg-cyan-electric text-navy-deep font-semibold disabled:opacity-40 hover:shadow-glow transition"
        >
          Begin scenario
        </button>
      </div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
          Or quick-fill
        </div>
        <div className="flex flex-wrap gap-2">
          {VOUCH_SKILLS.map((s) => (
            <button
              key={s}
              onClick={() => setValue(s)}
              className="px-3 py-1.5 rounded-full border border-cyan-electric/20 text-cyan-electric/80 text-xs font-mono hover:border-cyan-electric hover:text-cyan-electric transition"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AiGradeCard({ grade }: { grade: AiGrade }) {
  const verdictColor =
    grade.verdict === 'approve'
      ? 'text-cyan-electric border-cyan-electric/40 bg-cyan-electric/5'
      : grade.verdict === 'reject'
        ? 'text-red-300 border-red-400/40 bg-red-500/5'
        : 'text-amber-200 border-amber-400/40 bg-amber-500/5';
  return (
    <div className={`rounded-2xl border p-5 space-y-3 ${verdictColor}`}>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-mono opacity-60">
            AI mark
          </div>
          <div className="font-mono text-xl">
            {grade.verdict.toUpperCase()}
          </div>
        </div>
        <div className="font-mono text-4xl tabular-nums">{grade.score}<span className="text-base opacity-60">/100</span></div>
      </div>
      {grade.rationale && (
        <p className="text-sm leading-relaxed opacity-90">{grade.rationale}</p>
      )}
    </div>
  );
}
