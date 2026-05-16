import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { socket } from '../lib/socket';
import { apiGenerateAuthenticationOptions, apiVerifyAuthentication } from '../lib/api';
import { getDeviceName } from '../lib/aaguid';

type Phase = 'idle' | 'generated' | 'verified';
type AuthStage = 'idle' | 'signing' | 'done' | 'error';

interface VerifyResult {
  username: string;
  aaguid: string | null;
}

export default function CoSign() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [authStage, setAuthStage] = useState<AuthStage>('idle');
  const [sessionId, setSessionId] = useState('');
  const [authOptions, setAuthOptions] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [authError, setAuthError] = useState('');
  const [username, setUsername] = useState('');
  const joinedRef = useRef(false);

  // Socket: listen for auth:success broadcast to this session's room
  useEffect(() => {
    function onSuccess(payload: { username: string; aaguid: string | null }) {
      setResult({ username: payload.username, aaguid: payload.aaguid });
      setPhase('verified');
    }
    socket.on('auth:success', onSuccess);
    return () => { socket.off('auth:success', onSuccess); };
  }, []);

  async function generateChallenge() {
    setPhase('idle');
    setAuthStage('idle');
    setResult(null);
    setAuthError('');
    joinedRef.current = false;

    // Pass username so backend populates allowCredentials — browser will
    // only offer the matching registered passkey, not all passkeys on device.
    const { options, sessionId: sid } = await apiGenerateAuthenticationOptions(username.trim() || undefined);
    setSessionId(sid);
    setAuthOptions(options);
    setPhase('generated');

    socket.emit('join:session', sid);
    joinedRef.current = true;
  }

  async function authenticateOnThisDevice() {
    if (!authOptions || !sessionId) return;
    setAuthStage('signing');
    setAuthError('');
    try {
      const response = await startAuthentication({ optionsJSON: authOptions });
      await apiVerifyAuthentication(sessionId, response);
      setAuthStage('done');
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
      setAuthStage('error');
    }
  }

  const qrUrl = sessionId
    ? `${window.location.origin}/auth?session=${sessionId}`
    : '';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-mono font-bold text-cyan-electric">Silicon Witness</h2>
        <p className="text-slate-400 mt-1 text-sm">
          Identity handshake — prove who you are with your biometric, not a password.
        </p>
      </div>

      {/* Step indicator */}
      <StepBar phase={phase} authStage={authStage} />

      {/* Two-panel demo */}
      <div className="grid lg:grid-cols-2 gap-5">
        <VerifierPanel
          phase={phase}
          qrUrl={qrUrl}
          sessionId={sessionId}
          result={result}
          username={username}
          onUsernameChange={setUsername}
          onGenerate={generateChallenge}
        />
        <AuthenticatorPanel
          phase={phase}
          authStage={authStage}
          authError={authError}
          onAuthenticate={authenticateOnThisDevice}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step bar
// ---------------------------------------------------------------------------
function StepBar({ phase, authStage }: { phase: Phase; authStage: AuthStage }) {
  const steps = [
    { label: 'Generate QR', done: phase !== 'idle' },
    { label: 'Scan & Sign', done: authStage === 'done' || phase === 'verified' },
    { label: 'Match Found', done: phase === 'verified' },
  ];
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2 flex-1">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 transition-colors ${
              s.done
                ? 'bg-cyan-electric text-navy-deep'
                : 'bg-navy-light border border-cyan-electric/20 text-slate-500'
            }`}
          >
            {s.done ? '✓' : i + 1}
          </div>
          <span
            className={`text-xs font-mono transition-colors ${
              s.done ? 'text-cyan-electric' : 'text-slate-500'
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px transition-colors ${s.done ? 'bg-cyan-electric/40' : 'bg-cyan-electric/10'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device A — Verifier (left panel, shows QR → waits → shows result)
// ---------------------------------------------------------------------------
function VerifierPanel({
  phase,
  qrUrl,
  sessionId,
  result,
  username,
  onUsernameChange,
  onGenerate,
}: {
  phase: Phase;
  qrUrl: string;
  sessionId: string;
  result: VerifyResult | null;
  username: string;
  onUsernameChange: (v: string) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-cyan-electric/15 bg-navy-light/40 backdrop-blur p-6 flex flex-col gap-5">
      {/* Panel header */}
      <div className="flex items-center gap-2 text-sm font-mono text-slate-400">
        <MonitorIcon />
        <span>Device A</span>
        <span className="ml-auto px-2 py-0.5 rounded-full text-xs border border-cyan-electric/20 text-cyan-electric">
          VERIFIER
        </span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-5 py-8"
          >
            <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-cyan-electric/20 flex items-center justify-center text-cyan-electric/30">
              <QrIcon className="w-10 h-10" />
            </div>
            <input
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
              placeholder="Enter your registered handle…"
              className="w-full bg-navy-deep border border-cyan-electric/20 rounded-xl px-4 py-2.5 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-electric/60 transition-colors"
            />
            <button
              onClick={onGenerate}
              disabled={!username.trim()}
              className="px-6 py-3 rounded-xl bg-cyan-electric text-navy-deep font-semibold font-mono hover:shadow-glow transition-all disabled:opacity-40"
            >
              Generate QR Challenge
            </button>
          </motion.div>
        )}

        {phase === 'generated' && (
          <motion.div
            key="qr"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="bg-white rounded-2xl p-4 shadow-glow">
              <QRCodeSVG value={qrUrl} size={180} level="M" />
            </div>
            <p className="text-xs font-mono text-slate-500 text-center">
              Scan with a registered device
            </p>
            <div className="w-full bg-navy-deep/60 rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
              <span className="text-xs font-mono text-slate-400 truncate">
                Waiting for authentication… · {sessionId.slice(0, 8)}
              </span>
            </div>
            <button
              onClick={onGenerate}
              className="text-xs font-mono text-slate-500 hover:text-cyan-electric transition-colors"
            >
              Regenerate
            </button>
          </motion.div>
        )}

        {phase === 'verified' && result && (
          <motion.div
            key="verified"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-4"
          >
            {/* Match banner */}
            <div className="rounded-xl bg-cyan-electric/10 border border-cyan-electric/30 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan-electric/20 flex items-center justify-center shrink-0">
                <ShieldCheckIcon className="w-5 h-5 text-cyan-electric" />
              </div>
              <div>
                <div className="font-mono font-bold text-cyan-electric tracking-wide">MATCH FOUND</div>
                <div className="text-slate-400 text-xs font-mono">Identity verified via biometric</div>
              </div>
            </div>

            {/* Identity details */}
            <div className="space-y-3">
              <ResultField label="Verified Handle">
                <span className="text-white font-mono font-bold text-lg">@{result.username}</span>
              </ResultField>
              <ResultField label="Device (Hardware Model)">
                <span className="text-cyan-electric font-mono">{getDeviceName(result.aaguid)}</span>
              </ResultField>
              <ResultField label="Hardware Instance ID">
                <span className="text-slate-300 font-mono text-xs break-all">{result.aaguid ?? '—'}</span>
              </ResultField>
            </div>

            <button
              onClick={onGenerate}
              className="text-xs font-mono text-slate-500 hover:text-cyan-electric transition-colors mt-1"
            >
              New challenge →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device B — Authenticator (right panel, triggers Touch ID)
// ---------------------------------------------------------------------------
function AuthenticatorPanel({
  phase,
  authStage,
  authError,
  onAuthenticate,
}: {
  phase: Phase;
  authStage: AuthStage;
  authError: string;
  onAuthenticate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-cyan-electric/15 bg-navy-light/40 backdrop-blur p-6 flex flex-col gap-5">
      {/* Panel header */}
      <div className="flex items-center gap-2 text-sm font-mono text-slate-400">
        <PhoneIcon />
        <span>Device B</span>
        <span className="ml-auto px-2 py-0.5 rounded-full text-xs border border-cyan-electric/20 text-cyan-electric">
          AUTHENTICATOR
        </span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-3 py-10 text-center"
          >
            <div className="text-4xl opacity-30">📱</div>
            <p className="text-slate-500 text-sm font-mono">
              Waiting for Device A to<br />generate a challenge…
            </p>
          </motion.div>
        )}

        {(phase === 'generated' || phase === 'verified') && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-5"
          >
            {/* Instructions */}
            <div className="rounded-xl bg-navy-deep/60 border border-white/5 p-4 space-y-2">
              <p className="text-slate-300 text-sm font-mono font-semibold">Option 1 — Same Device</p>
              <p className="text-slate-500 text-xs font-mono">
                Click the button below. Your browser will prompt for Touch ID or biometric.
              </p>
              <p className="text-slate-300 text-sm font-mono font-semibold mt-3">Option 2 — Phone / Another Device</p>
              <p className="text-slate-500 text-xs font-mono">
                Scan the QR on the left with a registered phone.
              </p>
            </div>

            {/* Auth button */}
            {authStage !== 'done' && (
              <button
                onClick={onAuthenticate}
                disabled={authStage === 'signing' || phase === 'verified'}
                className="w-full py-4 rounded-xl bg-navy-deep border border-cyan-electric/30 text-cyan-electric font-mono font-semibold hover:bg-cyan-electric/10 hover:shadow-glow transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {authStage === 'signing' ? (
                  <>
                    <Spinner /> Waiting for Touch ID…
                  </>
                ) : (
                  <>
                    <FingerprintIcon /> Authenticate on This Device
                  </>
                )}
              </button>
            )}

            {/* Success state */}
            {authStage === 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-cyan-electric/10 border border-cyan-electric/30 px-5 py-4 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-cyan-electric/20 flex items-center justify-center shrink-0">
                  <CheckIcon className="w-4 h-4 text-cyan-electric" />
                </div>
                <div>
                  <div className="font-mono font-bold text-cyan-electric text-sm">Signature Sent</div>
                  <div className="text-slate-400 text-xs font-mono">Awaiting confirmation on Device A</div>
                </div>
              </motion.div>
            )}

            {/* Error state */}
            {authStage === 'error' && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2"
              >
                {authError}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ResultField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-navy-deep/40 px-4 py-3 space-y-1">
      <div className="text-xs uppercase tracking-wider text-slate-500 font-mono">{label}</div>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  );
}

function FingerprintIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M6 12c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <path d="M8 14c0-2.2 1.8-4 4-4s4 1.8 4 4v2" strokeLinecap="round" />
      <path d="M12 12v6" strokeLinecap="round" />
      <path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function ShieldCheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function QrIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="3" height="3" />
      <rect x="18" y="18" width="3" height="3" />
    </svg>
  );
}
