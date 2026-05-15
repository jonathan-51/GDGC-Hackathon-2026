import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function Home() {
  return (
    <div className="relative">
      <BackgroundGlow />

      {/* HERO */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center lg:text-left"
        >
          <h1 className="text-5xl md:text-6xl font-mono font-bold leading-tight text-white">
            Vouch: Rebuilding Trust,<br />
            <span className="text-white">Person by Person</span>
          </h1>
          <p className="mt-6 text-slate-400 text-lg max-w-xl mx-auto lg:mx-0">
            A decentralized, biometric-driven network for a world where your record
            is your body and your community.
          </p>
          <div className="mt-10 flex justify-center lg:justify-start">
            <Link
              to="/register"
              className="px-8 py-3.5 rounded-full bg-cyan-electric text-navy-deep font-semibold tracking-wide hover:shadow-glow transition-all"
            >
              Get Started: Generate Your Card
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="hidden lg:flex justify-center"
        >
          <NetworkIllustration />
        </motion.div>
      </section>

      {/* THREE PILLARS */}
      <section id="how" className="max-w-7xl mx-auto px-6 pb-24">
        <h2 className="text-3xl md:text-4xl font-mono font-bold text-center text-white mb-12">
          The Three Pillars of Trust
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <PillarCard
            icon={<BiometricIcon />}
            title="1. Local Biometric ID"
            body="Generate a unique cryptographic hash from your face or fingerprint. Stored locally as a QR code—your body is the record. No databases, no cloud."
          />
          <PillarCard
            icon={<HandshakeIcon />}
            title="2. Web of Trust"
            body="People you know scan your QR and co-sign. Each vouch strengthens your network. Strangers can verify your network's authenticity instantly."
          />
          <PillarCard
            icon={<SkillIcon />}
            title="3. Live Skill Verification"
            body="For key roles, an AI generates real-time scenario questions. Peers review your timed answers. Pass to receive temporary, revocable credentials."
          />
        </div>
      </section>

      {/* DIGITAL CARD PREVIEW */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <h2 className="text-3xl md:text-4xl font-mono font-bold text-center text-white mb-12">
          Your Integrated Digital Vouch Card
        </h2>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-center">
          <PhoneMockup />
          <CardDetails />
        </div>
      </section>
    </div>
  );
}

function BackgroundGlow() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-0">
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-electric/10 rounded-full blur-[120px]" />
      <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
    </div>
  );
}

function PillarCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-cyan-electric/15 bg-navy-light/40 backdrop-blur p-7 hover:border-cyan-electric/40 hover:shadow-glow transition-all">
      <div className="text-cyan-electric mb-5">{icon}</div>
      <h3 className="text-xl font-mono font-bold text-white mb-3">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function BiometricIcon() {
  return (
    <div className="flex gap-3">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12">
        <path d="M6 12c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
        <path d="M8 14c0-2.2 1.8-4 4-4s4 1.8 4 4v2" strokeLinecap="round" />
        <path d="M12 12v6" strokeLinecap="round" />
        <path d="M10 18c0 1 0 2 .5 3" strokeLinecap="round" />
        <path d="M14 18c0 1 0 2-.5 3" strokeLinecap="round" />
        <path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="3" height="3" />
        <rect x="18" y="18" width="3" height="3" />
      </svg>
    </div>
  );
}

function HandshakeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-14 h-14">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="5" r="2" />
      <path d="M3 18c0-2 1.5-4 3-4M21 18c0-2-1.5-4-3-4M8 18c0-2 1.5-3 4-3s4 1 4 3" strokeLinecap="round" />
      <path d="M8 14l4 2 4-2" strokeLinecap="round" />
    </svg>
  );
}

function SkillIcon() {
  return (
    <div className="flex gap-2">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 12a7 7 0 0014 0M12 19v3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function NetworkIllustration() {
  const nodes = [
    { x: 80, y: 60 }, { x: 220, y: 40 }, { x: 320, y: 130 },
    { x: 260, y: 240 }, { x: 120, y: 220 }, { x: 40, y: 150 },
  ];
  return (
    <svg viewBox="0 0 380 300" className="w-full max-w-md">
      <defs>
        <radialGradient id="nodeGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00ffd1" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#00ffd1" stopOpacity="0" />
        </radialGradient>
      </defs>
      {nodes.map((n, i) =>
        nodes.slice(i + 1).map((m, j) => (
          <line
            key={`${i}-${j}`}
            x1={n.x} y1={n.y} x2={m.x} y2={m.y}
            stroke="#00ffd1" strokeOpacity="0.25" strokeWidth="1"
          />
        ))
      )}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="22" fill="url(#nodeGrad)" />
          <circle cx={n.x} cy={n.y} r="10" fill="#00ffd1" fillOpacity="0.6" />
          <circle cx={n.x} cy={n.y} r="6" fill="#0a0e27" />
          <circle cx={n.x} cy={n.y - 1} r="2.2" fill="#00ffd1" />
          <path d={`M${n.x - 4} ${n.y + 4} q4 -3 8 0`} stroke="#00ffd1" strokeWidth="1.5" fill="none" />
        </g>
      ))}
    </svg>
  );
}

function PhoneMockup() {
  return (
    <div className="mx-auto w-64 h-[440px] rounded-[2.5rem] border-4 border-slate-700 bg-navy-deep p-3 shadow-glow">
      <div className="w-full h-full rounded-[2rem] bg-gradient-to-b from-navy-light to-navy-deep flex flex-col items-center justify-center gap-4 p-5">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-electric/40 to-blue-500/40 flex items-center justify-center text-3xl">
          🧑
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono text-cyan-electric">
          <span className="w-2 h-2 rounded-full bg-cyan-electric inline-block" />
          Verified
        </div>
        <div className="w-32 h-32 bg-white rounded-lg p-2">
          <QrPattern />
        </div>
        <div className="text-xs font-mono text-slate-400">SCAN TO VERIFY</div>
      </div>
    </div>
  );
}

function QrPattern() {
  const cells = Array.from({ length: 64 }, () => Math.random() > 0.5);
  return (
    <div className="w-full h-full grid grid-cols-8 gap-px">
      {cells.map((on, i) => (
        <div key={i} className={on ? 'bg-navy-deep' : 'bg-white'} />
      ))}
    </div>
  );
}

function CardDetails() {
  return (
    <div className="space-y-5">
      <DetailRow label="Vouched By">
        <div className="flex -space-x-2">
          {['👩', '👨', '🧑', '👱'].map((e, i) => (
            <div
              key={i}
              className="w-9 h-9 rounded-full bg-navy-light border-2 border-navy-deep flex items-center justify-center text-sm"
            >
              {e}
            </div>
          ))}
          <div className="w-9 h-9 rounded-full bg-cyan-electric/20 border-2 border-navy-deep flex items-center justify-center text-xs font-mono text-cyan-electric">
            +2
          </div>
        </div>
      </DetailRow>

      <DetailRow label="Credentials">
        <div className="flex flex-wrap gap-2">
          {['Structural Eng.', 'First Aid', 'Translator'].map((c) => (
            <span
              key={c}
              className="px-3 py-1 rounded-full border border-cyan-electric/30 text-xs font-mono text-cyan-electric bg-cyan-electric/5"
            >
              {c}
            </span>
          ))}
        </div>
      </DetailRow>

      <DetailRow label="Network Strength Score">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-navy-light rounded-full overflow-hidden">
            <div className="h-full w-[78%] bg-gradient-to-r from-cyan-electric to-blue-400" />
          </div>
          <span className="font-mono text-cyan-electric text-sm">78</span>
        </div>
      </DetailRow>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-cyan-electric/15 bg-navy-light/40 p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-mono mb-3">
        {label}
      </div>
      {children}
    </div>
  );
}
