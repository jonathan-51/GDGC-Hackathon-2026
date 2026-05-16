import type { HardwareWitness, HardwareWitnessIcon } from '../lib/webauthn';

function FingerprintIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-cyan-electric shrink-0">
      <path d="M12 2C6.48 2 2 6.48 2 12" strokeLinecap="round" />
      <path d="M12 6c-3.31 0-6 2.69-6 6" strokeLinecap="round" />
      <path d="M12 10c-1.1 0-2 .9-2 2" strokeLinecap="round" />
      <path d="M12 10c1.1 0 2 .9 2 2v1c0 2-1 4-2 5" strokeLinecap="round" />
      <path d="M16 12c0-2.21-1.79-4-4-4" strokeLinecap="round" />
      <path d="M20 12c0-4.42-3.58-8-8-8" strokeLinecap="round" />
      <path d="M6 18.5C7.5 17 8 15 8 12" strokeLinecap="round" />
      <path d="M18 17c-.5-1.5-1-3-1-5" strokeLinecap="round" />
    </svg>
  );
}

function FaceIDIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-cyan-electric shrink-0">
      <path d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
      <path d="M9 15c.83.67 1.67 1 3 1s2.17-.33 3-1" strokeLinecap="round" />
      <path d="M12 7v3" strokeLinecap="round" />
    </svg>
  );
}

function GenericBiometricIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-cyan-electric shrink-0">
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M8 6V4a4 4 0 018 0v2" strokeLinecap="round" />
      <circle cx="12" cy="13" r="2" />
    </svg>
  );
}

function Icon({ type }: { type: HardwareWitnessIcon }) {
  if (type === 'fingerprint') return <FingerprintIcon />;
  if (type === 'faceid') return <FaceIDIcon />;
  return <GenericBiometricIcon />;
}

export default function HardwareWitnessBox({ witness }: { witness: HardwareWitness }) {
  return (
    <div className="rounded-xl border border-cyan-electric/20 bg-black/30 p-4 space-y-3 text-left">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-electric animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Hardware Metadata</span>
      </div>
      <div className="flex items-center gap-3">
        <Icon type={witness.icon} />
        <span className="font-mono text-sm text-cyan-electric">{witness.label}</span>
      </div>
      {witness.credentialId && (
        <div className="space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Raw Credential ID</div>
          <div className="font-mono text-[10px] text-slate-400 break-all bg-black/40 rounded px-2 py-1.5 border border-white/5">
            {witness.credentialId}
          </div>
        </div>
      )}
    </div>
  );
}
