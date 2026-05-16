import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { apiGetSession, apiVerifyAuthentication } from '../lib/api';
import { getDeviceName } from '../lib/aaguid';

type Stage = 'loading' | 'ready' | 'signing' | 'success' | 'error';

interface AuthResult {
  username: string;
  aaguid: string | null;
}

export default function Auth() {
  const [params] = useSearchParams();
  const sessionId = params.get('session') ?? '';

  const [stage, setStage] = useState<Stage>(sessionId ? 'loading' : 'error');
  const [options, setOptions] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null);
  const [result, setResult] = useState<AuthResult | null>(null);
  const [errorMsg, setErrorMsg] = useState(sessionId ? '' : 'No session ID in URL.');

  useEffect(() => {
    if (!sessionId) return;
    apiGetSession(sessionId)
      .then(({ options: o }) => { setOptions(o); setStage('ready'); })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Session not found or expired.');
        setStage('error');
      });
  }, [sessionId]);

  async function handleAuth() {
    if (!options || !sessionId) return;
    setStage('signing');
    try {
      const response = await startAuthentication({ optionsJSON: options });
      const data = await apiVerifyAuthentication(sessionId, response);
      setResult({ username: data.username, aaguid: data.aaguid });
      setStage('success');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
      setStage('error');
    }
  }

  return (
    <div className="max-w-sm mx-auto pt-10 px-2">
      <AnimatePresence mode="wait">
        {stage === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-16 text-center">
            <Spinner className="w-8 h-8 text-cyan-electric" />
            <p className="text-slate-400 font-mono text-sm">Loading session…</p>
          </motion.div>
        )}

        {stage === 'ready' && (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-cyan-electric/10 border border-cyan-electric/30 flex items-center justify-center">
              <FingerprintIcon className="w-10 h-10 text-cyan-electric" />
            </div>
            <div>
              <h2 className="text-2xl font-mono font-bold text-white">Authenticate</h2>
              <p className="text-slate-400 text-sm mt-2">
                Tap the button to verify your identity with Touch ID or Face ID.
              </p>
            </div>
            <div className="text-xs font-mono text-slate-600 bg-navy-light/40 rounded-lg px-3 py-1">
              Session · {sessionId.slice(0, 12)}…
            </div>
            <button
              onClick={handleAuth}
              className="w-full py-4 rounded-xl bg-cyan-electric text-navy-deep font-semibold font-mono hover:shadow-glow transition-all"
            >
              Authenticate with Biometric
            </button>
          </motion.div>
        )}

        {stage === 'signing' && (
          <motion.div key="signing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-16 text-center">
            <Spinner className="w-8 h-8 text-cyan-electric" />
            <p className="text-slate-400 font-mono text-sm">Waiting for Touch ID…</p>
          </motion.div>
        )}

        {stage === 'success' && result && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-5"
          >
            {/* Match banner */}
            <div className="rounded-2xl bg-cyan-electric/10 border border-cyan-electric/30 px-6 py-5 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-cyan-electric/20 flex items-center justify-center">
                <ShieldCheckIcon className="w-7 h-7 text-cyan-electric" />
              </div>
              <div>
                <div className="font-mono font-bold text-cyan-electric text-xl tracking-wide">MATCH FOUND</div>
                <div className="text-slate-400 text-sm mt-1">Identity confirmed — the verifier has been notified.</div>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3">
              <Field label="Verified Handle">
                <span className="text-white font-mono font-bold text-lg">@{result.username}</span>
              </Field>
              <Field label="Device (Hardware Model)">
                <span className="text-cyan-electric font-mono text-sm">{getDeviceName(result.aaguid)}</span>
              </Field>
              <Field label="Hardware Instance ID">
                <span className="text-slate-400 font-mono text-xs break-all">{result.aaguid ?? '—'}</span>
              </Field>
            </div>
          </motion.div>
        )}

        {stage === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="text-4xl">⚠️</div>
            <p className="text-red-400 font-mono text-sm">{errorMsg}</p>
            <p className="text-slate-500 text-xs font-mono">Go back and generate a new QR code.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-navy-light/40 px-4 py-3 space-y-1">
      <div className="text-xs uppercase tracking-wider text-slate-500 font-mono">{label}</div>
      {children}
    </div>
  );
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  );
}

function FingerprintIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M6 12c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <path d="M8 14c0-2.2 1.8-4 4-4s4 1.8 4 4v2" strokeLinecap="round" />
      <path d="M12 12v6" strokeLinecap="round" />
      <path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3" strokeLinecap="round" />
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
