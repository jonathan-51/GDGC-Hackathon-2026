import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { startRegistration } from '@simplewebauthn/browser';
import { apiGenerateRegistrationOptions, apiVerifyRegistration } from '../lib/api';
import { getDeviceName } from '../lib/aaguid';

type Stage = 'idle' | 'loading' | 'success' | 'error';

export default function Register() {
  const [username, setUsername] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [aaguid, setAaguid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleRegister() {
    const handle = username.trim();
    if (!handle || stage === 'loading') return;
    setStage('loading');
    setErrorMsg('');
    try {
      const { options, userId } = await apiGenerateRegistrationOptions(handle);
      const regResponse = await startRegistration({ optionsJSON: options });
      const { aaguid: id } = await apiVerifyRegistration(userId, regResponse);
      setAaguid(id);
      setStage('success');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed');
      setStage('error');
    }
  }

  function reset() {
    setStage('idle');
    setUsername('');
    setAaguid(null);
    setErrorMsg('');
  }

  return (
    <div className="max-w-md mx-auto pt-6 space-y-8">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-3xl font-mono font-bold text-cyan-electric">Register Biometric</h2>
        <p className="text-slate-400 mt-2 text-sm leading-relaxed">
          Bind a handle to your Touch ID, Face ID, or device biometric. No password is ever created.
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {stage !== 'success' ? (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              placeholder="Choose a handle…"
              disabled={stage === 'loading'}
              className="w-full bg-navy-light border border-cyan-electric/20 rounded-xl px-4 py-3 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-electric/60 transition-colors disabled:opacity-50"
            />

            <button
              onClick={handleRegister}
              disabled={stage === 'loading' || !username.trim()}
              className="w-full py-3.5 rounded-xl bg-cyan-electric text-navy-deep font-semibold font-mono tracking-wide hover:shadow-glow transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {stage === 'loading' ? (
                <>
                  <Spinner /> Waiting for biometric…
                </>
              ) : (
                <>
                  <FingerprintIcon /> Register with Touch ID
                </>
              )}
            </button>

            {stage === 'error' && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-sm font-mono bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2"
              >
                {errorMsg}
              </motion.p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-cyan-electric/30 bg-navy-light/60 backdrop-blur p-6 space-y-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan-electric/20 flex items-center justify-center shrink-0">
                <CheckIcon className="w-5 h-5 text-cyan-electric" />
              </div>
              <div>
                <div className="text-white font-mono font-bold">Registered Successfully</div>
                <div className="text-slate-400 text-sm font-mono">@{username}</div>
              </div>
            </div>

            <div className="border-t border-white/5 pt-4 space-y-3">
              <Field label="Device">
                <span className="text-white font-mono text-sm">{getDeviceName(aaguid)}</span>
              </Field>
              <Field label="Hardware Instance ID (AAGUID)">
                <span className="text-cyan-electric font-mono text-xs break-all">{aaguid ?? '—'}</span>
              </Field>
            </div>

            <button
              onClick={reset}
              className="text-sm text-slate-400 hover:text-cyan-electric transition-colors font-mono"
            >
              Register another handle →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
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
