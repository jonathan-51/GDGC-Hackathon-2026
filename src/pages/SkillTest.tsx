import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useUser } from '../hooks/useUser';
import { generateSkillScenario, geminiEnabled, gradeSkillAnswer, pinnedTranscript, type AiGrade } from '../lib/gemini';
import { createSkillTest, maybeFinalizeTest } from '../lib/db';
import InterviewVideo from '../components/InterviewVideo';
import { supabase } from '../lib/supabase';
import { SKILL_TEST_SECONDS, VOUCH_SKILLS } from '../lib/types';

type Stage = 'choose' | 'camera-setup' | 'generating' | 'answering' | 'grading' | 'done';

// Augment window for SpeechRecognition cross-browser
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

async function uploadInterviewVideo(blob: Blob, testId: string): Promise<{ url: string | null; error: string | null }> {
  const path = `${testId}.webm`;
  const { error: uploadError } = await supabase.storage
    .from('interview-videos')
    .upload(path, blob, { contentType: 'video/webm', upsert: true });
  if (uploadError) return { url: null, error: uploadError.message };
  const { data } = supabase.storage.from('interview-videos').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export default function SkillTest() {
  const { passport, profile, loading } = useUser();
  const [stage, setStage] = useState<Stage>('choose');
  const [skill, setSkill] = useState('');
  const [question, setQuestion] = useState('');
  const [transcript, setTranscript] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(SKILL_TEST_SECONDS);
  const [grade, setGrade] = useState<AiGrade | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const interimRef = useRef('');
  const finalTextRef = useRef('');
  const recognitionActiveRef = useRef(false);
  const handleSubmitRef = useRef<(usedSeconds: number) => void>(() => {});
  const secondsLeftRef = useRef(SKILL_TEST_SECONDS);
  const autoSubmittedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => () => {
    recognitionActiveRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recognitionRef.current?.stop();
  }, []);

  // Re-attach stream whenever the video element is mounted/remounted (stage change)
  useEffect(() => {
    if (!videoRef.current || !streamRef.current) return;
    if (videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  // Countdown timer
  useEffect(() => {
    if (stage !== 'answering') return;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, SKILL_TEST_SECONDS - elapsed);
      setSecondsLeft(left);
      secondsLeftRef.current = left;
      if (left === 0) { clearInterval(id); handleSubmit(SKILL_TEST_SECONDS); }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Anti-tab-switch: during the live assessment, leaving the tab/window or
  // exiting fullscreen auto-submits the attempt. Reason: this is a proctored
  // skill test and the candidate must not be able to consult other sources.
  useEffect(() => {
    if (stage !== 'answering') return;
    autoSubmittedRef.current = false;

    const forceSubmit = (reason: string) => {
      if (autoSubmittedRef.current) return;
      autoSubmittedRef.current = true;
      setError(reason);
      handleSubmitRef.current(SKILL_TEST_SECONDS - secondsLeftRef.current);
    };

    const onVisibility = () => {
      if (document.hidden) forceSubmit('You left the assessment tab — your attempt was auto-submitted.');
    };
    const onBlur = () => forceSubmit('You switched away from the assessment window — your attempt was auto-submitted.');
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        forceSubmit('You exited fullscreen during the assessment — your attempt was auto-submitted.');
      }
    };
    const blockKeys = (e: KeyboardEvent) => {
      // Block common tab/window-switch and devtools shortcuts. Browsers won't
      // let us block Ctrl+Tab / Alt+Tab at the OS level, but we catch what we can.
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 't' || k === 'w' || k === 'n' || k === 'tab')) {
        e.preventDefault();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', blockKeys);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', blockKeys);
    };
  }, [stage]);

  if (loading) return <div className="text-slate-400 font-mono">Loading…</div>;

  if (!passport || !profile) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-3xl font-mono text-cyan-electric">Live Skill Assessment</h2>
        <p className="text-slate-400">You need a card before you can prove a skill on it.</p>
        <Link to="/register" className="inline-block px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition">
          Generate your card
        </Link>
      </div>
    );
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      return true;
    } catch {
      setError('Camera and microphone access are required for the assessment.');
      return false;
    }
  }

  async function goToSetup(chosen: string) {
    setSkill(chosen);
    setError(null);
    setStage('camera-setup');
    await startCamera();
  }

  async function beginAssessment() {
    if (!streamRef.current) {
      const ok = await startCamera();
      if (!ok) return;
    }
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Fullscreen denied — assessment still proceeds; visibility/blur listeners
      // remain the primary anti-cheat signal.
    }
    setStage('generating');
    setError(null);
    try {
      const q = await generateSkillScenario(skill);
      setQuestion(q);
      const pinned = pinnedTranscript(skill);
      setTranscript(pinned ?? '');
      interimRef.current = '';
      setSecondsLeft(SKILL_TEST_SECONDS);

      // Start recording
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';
      chunksRef.current = [];
      const recorder = new MediaRecorder(streamRef.current!, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);

      // Start speech recognition (skipped when transcript is pinned for demo).
      // We accumulate finalised text into finalTextRef so a long answer never
      // gets wiped if Chrome's recognition restarts and resets event.results.
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR && !pinned) {
        finalTextRef.current = '';
        interimRef.current = '';
        const buildRecognition = () => {
          const recognition = new SR();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              if (res.isFinal) finalTextRef.current += res[0].transcript + ' ';
              else interim += res[0].transcript;
            }
            interimRef.current = interim;
            setTranscript(finalTextRef.current + interim);
          };
          recognition.onerror = () => {};
          // Chrome ends recognition on silence even with continuous:true. Restart
          // while the candidate is still answering so transcription resumes.
          (recognition as unknown as { onend: (() => void) | null }).onend = () => {
            if (!recognitionActiveRef.current) return;
            try {
              const next = buildRecognition();
              recognitionRef.current = next;
              next.start();
            } catch {
              // start() can throw if called too quickly; ignore — the next
              // onend (immediate) will retry once the engine is ready.
            }
          };
          return recognition;
        };
        recognitionActiveRef.current = true;
        const recognition = buildRecognition();
        recognition.start();
        recognitionRef.current = recognition;
      }

      setStage('answering');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate scenario.');
      setStage('camera-setup');
    }
  }

  async function handleSubmit(usedSeconds: number) {
    if (!profile) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setStage('grading');

    // Stop recognition (and prevent the onend handler from restarting it)
    recognitionActiveRef.current = false;
    recognitionRef.current?.stop();

    // Stop recording and collect video blob
    let videoBlob: Blob | null = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorderRef.current!.onstop = () => {
          videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
          resolve();
        };
        recorderRef.current!.stop();
      });
    }
    setRecording(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const accumulated = (finalTextRef.current + interimRef.current).trim();
    const finalAnswer = accumulated || transcript.trim() || '(no spoken answer)';

    try {
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

      // Upload video after test is created (so we have the ID)
      if (videoBlob) {
        const { url, error: uploadErr } = await uploadInterviewVideo(videoBlob, test.id);
        if (url) {
          setVideoUrl(url);
          const { error: updateErr } = await supabase
            .from('skill_tests')
            .update({ video_url: url })
            .eq('id', test.id);
          if (updateErr) {
            console.error('[SkillTest] failed to write video_url to skill_tests:', updateErr);
            if (/column .*video_url.* does not exist/i.test(updateErr.message)) {
              console.error(
                '[SkillTest] Run this in Supabase SQL editor: alter table skill_tests add column if not exists video_url text;',
              );
            }
          }
        } else if (uploadErr) {
          console.warn('[SkillTest] video upload skipped:', uploadErr);
          if (/bucket not found/i.test(uploadErr)) {
            console.warn(
              '[SkillTest] Create the "interview-videos" bucket in Supabase Storage (see supabase/schema.sql).',
            );
          }
        }
      }

      await maybeFinalizeTest(test.id, profile.id, skill);
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
      setStage('answering');
    }
  }

  handleSubmitRef.current = handleSubmit;

  function reset() {
    setStage('choose');
    setSkill('');
    setQuestion('');
    setTranscript('');
    setGrade(null);
    setVideoUrl(null);
    setError(null);
    setRecording(false);
    recognitionActiveRef.current = false;
    recognitionRef.current?.stop();
    finalTextRef.current = '';
    interimRef.current = '';
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // ── Choose skill ──────────────────────────────────────────────────────────
  if (stage === 'choose') {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <h2 className="text-4xl font-mono font-bold text-cyan-electric">Live Skill Assessment</h2>
          <p className="text-slate-400">
            Describe your skill. An AI generates a real scenario. You have{' '}
            {SKILL_TEST_SECONDS}s to answer <span className="text-cyan-electric font-mono">on camera, out loud</span> — no typing.
            Your interview video is visible on your public profile.
          </p>
          {!geminiEnabled && (
            <div className="text-xs text-amber-300/80 font-mono">
              Gemini key not set — using built-in scenarios.
            </div>
          )}
        </header>
        <SkillEntry onStart={goToSetup} />
        {error && <div className="text-red-300 font-mono text-sm">{error}</div>}
      </div>
    );
  }

  // ── Camera setup ──────────────────────────────────────────────────────────
  if (stage === 'camera-setup') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <div className="text-slate-500 font-mono text-xs uppercase tracking-widest">Assessment for</div>
          <h2 className="text-3xl font-mono font-bold text-cyan-electric">{skill}</h2>
        </header>
        <div className="rounded-2xl overflow-hidden border border-cyan-electric/30 bg-black aspect-video relative">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {!streamRef.current && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-slate-600 mx-auto">
                  <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
                <div className="text-slate-500 font-mono text-sm">Camera initialising…</div>
              </div>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200 font-mono space-y-1">
          <div className="font-bold">Before you begin:</div>
          <ul className="list-disc list-inside space-y-0.5 text-amber-200/80">
            <li>Your camera and microphone will record the entire assessment</li>
            <li>Speak your answer clearly — no typing allowed</li>
            <li>The video will appear on your public profile</li>
            <li>You have {SKILL_TEST_SECONDS} seconds once the question appears</li>
          </ul>
        </div>
        {error && <div className="text-red-300 font-mono text-sm">{error}</div>}
        <div className="flex gap-3">
          <button
            onClick={beginAssessment}
            className="px-8 py-3 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition"
          >
            I'm ready — begin assessment
          </button>
          <button onClick={reset} className="px-4 py-2 text-slate-400 hover:text-cyan-electric text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Generating ────────────────────────────────────────────────────────────
  if (stage === 'generating') {
    return (
      <div className="text-center py-20 space-y-3">
        <div className="text-cyan-electric font-mono animate-pulse text-lg">Generating scenario for {skill}…</div>
        <div className="text-xs text-slate-500 font-mono">Get ready to speak your answer.</div>
      </div>
    );
  }

  // ── Answering — HackerRank-style split UI ─────────────────────────────────
  if (stage === 'answering') {
    const ratio = secondsLeft / SKILL_TEST_SECONDS;
    const lowTime = secondsLeft <= 20;
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const ss = String(secondsLeft % 60).padStart(2, '0');

    return (
      <div className="flex flex-col gap-0 -mx-6 -my-10 min-h-[calc(100vh-80px)]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-cyan-electric/15 bg-navy-deep/90 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-slate-400">Assessment</span>
            <span className="px-2 py-0.5 rounded border border-cyan-electric/30 text-cyan-electric font-mono text-xs">{skill}</span>
            {recording && (
              <span className="flex items-center gap-1.5 text-red-400 font-mono text-xs">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                REC
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className={`font-mono text-2xl tabular-nums ${lowTime ? 'text-red-300' : 'text-cyan-electric'}`}>
              {mm}:{ss}
            </div>
            <button
              onClick={() => handleSubmit(SKILL_TEST_SECONDS - secondsLeft)}
              disabled={!transcript.trim()}
              className="px-5 py-2 rounded-full bg-cyan-electric text-navy-deep font-semibold text-sm disabled:opacity-40 hover:shadow-glow transition"
            >
              Submit
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-navy-light">
          <motion.div
            initial={false}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ ease: 'linear', duration: 0.25 }}
            className={`h-full ${lowTime ? 'bg-red-400' : 'bg-cyan-electric'}`}
          />
        </div>

        {/* Split pane */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left — Question */}
          <div className="flex-1 overflow-y-auto px-6 py-8 border-r border-cyan-electric/10 space-y-6">
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Scenario</div>
              <h3 className="text-xl font-mono font-bold text-white">Skill: {skill}</h3>
            </div>
            <div className="prose prose-invert max-w-none">
              <div className="rounded-xl border border-cyan-electric/15 bg-navy-deep/60 p-5 text-slate-200 leading-relaxed font-mono text-sm whitespace-pre-wrap">
                {question}
              </div>
            </div>
            <div className="rounded-lg border border-cyan-electric/10 bg-cyan-electric/5 px-4 py-3 text-xs text-cyan-electric/70 font-mono">
              Speak your answer clearly into the microphone. Your speech is transcribed in real time on the right.
            </div>
          </div>

          {/* Right — Camera + transcript */}
          <div className="flex-1 flex flex-col gap-0 bg-black/20">
            {/* Camera */}
            <div className="relative bg-black aspect-video md:aspect-auto md:flex-1">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              {recording && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded text-red-400 font-mono text-xs">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  RECORDING
                </div>
              )}
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur px-2 py-1 rounded font-mono text-xs text-slate-300">
                {mm}:{ss}
              </div>
            </div>

            {/* Live transcript */}
            <div className="border-t border-cyan-electric/10 bg-navy-deep/80 p-4 min-h-[140px] md:max-h-[220px] overflow-y-auto">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">Live transcript</div>
              {transcript ? (
                <p className="text-slate-200 font-mono text-sm leading-relaxed">{transcript}</p>
              ) : (
                <p className="text-slate-600 font-mono text-sm italic">Start speaking — your words will appear here…</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Grading ───────────────────────────────────────────────────────────────
  if (stage === 'grading') {
    return (
      <div className="text-center py-20 space-y-3">
        <div className="text-cyan-electric font-mono animate-pulse text-lg">AI is marking your answer…</div>
        <div className="text-xs text-slate-500 font-mono">Uploading interview video…</div>
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {grade && <AiGradeCard grade={grade} />}
      {videoUrl && (
        <div className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Your interview recording</div>
          <InterviewVideo src={videoUrl} className="w-full rounded-xl border border-cyan-electric/20 bg-black" />
        </div>
      )}
      <div className="rounded-2xl border border-cyan-electric/40 bg-cyan-electric/5 p-8 text-center space-y-4">
        <div className="text-cyan-electric text-5xl font-mono">⌛</div>
        <h3 className="text-2xl font-mono text-white">Submitted</h3>
        <p className="text-slate-400 text-sm">
          The AI's mark counts as one vote. Verified peers in{' '}
          <span className="text-cyan-electric">{skill}</span> review next.
          {videoUrl && ' Your interview video is now visible on your public profile.'}
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link to="/card" className="px-6 py-2.5 rounded-full bg-cyan-electric text-navy-deep font-semibold hover:shadow-glow transition">
            View card
          </Link>
          <button
            onClick={reset}
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
          onKeyDown={(e) => { if (e.key === 'Enter' && trimmed.length >= 3) onStart(trimmed); }}
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
          Begin
        </button>
      </div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">Quick-fill</div>
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
          <div className="text-[10px] uppercase tracking-widest font-mono opacity-60">AI mark</div>
          <div className="font-mono text-xl">{grade.verdict.toUpperCase()}</div>
        </div>
        <div className="font-mono text-4xl tabular-nums">{grade.score}<span className="text-base opacity-60">/100</span></div>
      </div>
      {grade.rationale && <p className="text-sm leading-relaxed opacity-90">{grade.rationale}</p>}
    </div>
  );
}
