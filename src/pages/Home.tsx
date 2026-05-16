import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// --- geodesic sphere geometry (computed once at module level) ---
type V3 = [number, number, number];

function norm3(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function mid3(a: V3, b: V3): V3 {
  return norm3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
}

const PHI = (1 + Math.sqrt(5)) / 2;
const BASE_VERTS: V3[] = (
  [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
   [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
   [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]] as V3[]
).map(norm3);

const BASE_FACES: [number, number, number][] = [
  [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
  [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
  [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
  [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
];

function subdivide(verts: V3[], faces: [number, number, number][]) {
  const v = [...verts];
  const cache: Record<string, number> = {};
  function getMid(a: number, b: number): number {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (cache[key] !== undefined) return cache[key];
    const idx = v.length;
    v.push(mid3(v[a], v[b]));
    cache[key] = idx;
    return idx;
  }
  const nf: [number, number, number][] = [];
  for (const [a, b, c] of faces) {
    const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
    nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  return { verts: v, faces: nf };
}

const { verts: GEO_VERTS, faces: GEO_FACES } = subdivide(BASE_VERTS, BASE_FACES);

const edgeSet = new Set<string>();
const GEO_EDGES: [number, number][] = [];
for (const [a, b, c] of GEO_FACES) {
  for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) {
    const key = `${Math.min(x, y)}-${Math.max(x, y)}`;
    if (!edgeSet.has(key)) { edgeSet.add(key); GEO_EDGES.push([x, y]); }
  }
}

// ---------------------------------------------------------------------------

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <HeroBackground />

      {/* HERO */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-10 items-center relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <h1 className="text-5xl md:text-6xl font-mono font-bold leading-tight">
            <span className="text-blue-500">ILLUME:</span>{' '}
            <span className="text-white">Reclaiming<br />trust in a world<br />without records</span>
          </h1>
          <p className="mt-5 text-slate-400 text-sm max-w-md leading-relaxed">
            A secure, peer-to-peer credential system backed by biometrics and community, not institutions.
          </p>
          <div className="mt-8">
            <Link
              to="/register"
              className="px-7 py-3 rounded-full bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-all shadow-lg"
            >
              Generate Card
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="flex justify-center"
        >
          <GeodesicSphere />
        </motion.div>
      </section>

      {/* THREE PILLARS */}
      <section id="how" className="max-w-7xl mx-auto px-6 pb-20 relative">
        <h2 className="text-3xl md:text-4xl font-mono font-bold text-center text-white mb-10">
          The Three Pillars of Trust
        </h2>
        <div className="grid md:grid-cols-3 gap-5">
          <PillarCard
            icon={<FingerprintPillarIcon />}
            title="Local Biometric ID"
            body="Generate a unique cryptographic hash from your face or fingerprint. Stored locally as a QR code — your body is the record. No databases, no cloud."
          />
          <PillarCard
            icon={<NetworkPillarIcon />}
            title="Web of Trust"
            body="People you know scan your QR and co-sign. Each vouch strengthens your network. Strangers can verify your network's authenticity instantly."
          />
          <PillarCard
            icon={<MicPillarIcon />}
            title="Live Skill Verification"
            body="For key roles, an AI generates real-time scenario questions. Peers review your timed answers. Pass to receive temporary, revocable credentials."
          />
        </div>
      </section>

      {/* THE ILLUME CREDENTIAL */}
      <section className="max-w-7xl mx-auto px-6 pb-24 relative">
        <h2 className="text-3xl md:text-4xl font-mono font-bold text-center text-white mb-12">
          The Illume Credential
        </h2>
        <div className="grid md:grid-cols-2 gap-12 max-w-4xl mx-auto items-center">
          <PhoneMockup />
          <div className="space-y-6 text-center md:text-left">
            <p className="text-slate-300 text-base leading-relaxed">
              A single scannable card showing<br />
              who you are, who vouches for you,<br />
              and what you're trusted to do
            </p>
            <p className="text-slate-400 text-sm leading-relaxed">
              Accumulate confidence points over<br />
              time from your peers
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Background: large ILLUME watermark + cross decorators + glow
// ---------------------------------------------------------------------------
function HeroBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: -1 }}>
      {/* blue glow blobs */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-blue-700/10 rounded-full blur-[120px]" />
      <div className="absolute top-20 right-0 w-[400px] h-[400px] bg-blue-500/8 rounded-full blur-[80px]" />

      {/* ILLUME watermark */}
      <div
        className="absolute top-0 left-0 w-full select-none"
        style={{ pointerEvents: 'none' }}
      >
        <svg viewBox="0 0 1400 520" className="w-full" preserveAspectRatio="xMidYMid meet">
          <text
            x="50%" y="78%"
            textAnchor="middle"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="800"
            fontSize="360"
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
            letterSpacing="-10"
          >
            ILLUME
          </text>
        </svg>
      </div>

      {/* cross / star decorators */}
      <CrossStar x="8%" y="30%" size={22} />
      <CrossStar x="92%" y="15%" size={18} />
      <CrossStar x="85%" y="65%" size={14} />
    </div>
  );
}

function CrossStar({ x, y, size }: { x: string; y: string; size: number }) {
  return (
    <svg
      style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)' }}
      width={size * 2}
      height={size * 2}
      viewBox="-1 -1 2 2"
    >
      <line x1="-1" y1="0" x2="1" y2="0" stroke="#3b82f6" strokeWidth="0.18" strokeLinecap="round" />
      <line x1="0" y1="-1" x2="0" y2="1" stroke="#3b82f6" strokeWidth="0.18" strokeLinecap="round" />
      <line x1="-0.7" y1="-0.7" x2="0.7" y2="0.7" stroke="#3b82f6" strokeWidth="0.08" strokeLinecap="round" strokeOpacity="0.5" />
      <line x1="0.7" y1="-0.7" x2="-0.7" y2="0.7" stroke="#3b82f6" strokeWidth="0.08" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Geodesic sphere
// ---------------------------------------------------------------------------
function GeodesicSphere() {
  const W = 420, H = 420;
  const cx = W / 2, cy = H / 2, r = 175;
  const rotX = 0.28, rotY = -0.35;

  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

  function project(v: V3): [number, number, number] {
    const x1 = v[0] * cosY + v[2] * sinY;
    const y1 = v[1];
    const z1 = -v[0] * sinY + v[2] * cosY;
    const y2 = y1 * cosX - z1 * sinX;
    const z2 = y1 * sinX + z1 * cosX;
    return [cx + x1 * r, cy - y2 * r, z2];
  }

  const projected = GEO_VERTS.map(project);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-72 h-72 md:w-[420px] md:h-[420px]"
      style={{ filter: 'drop-shadow(0 0 32px rgba(37,99,235,0.45))' }}
    >
      <defs>
        <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="sphereBg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* soft sphere glow */}
      <circle cx={cx} cy={cy} r={r + 30} fill="url(#sphereBg)" />

      {/* edges */}
      {GEO_EDGES.map(([a, b], i) => {
        const [x1, y1, z1] = projected[a];
        const [x2, y2, z2] = projected[b];
        const depth = ((z1 + z2) / 2 + 1) / 2;
        const op = 0.15 + depth * 0.65;
        return (
          <line
            key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#3b82f6"
            strokeWidth={depth > 0.55 ? 0.9 : 0.5}
            strokeOpacity={Math.max(0.08, Math.min(0.85, op))}
          />
        );
      })}

      {/* vertex dots */}
      {projected.map(([x, y, z], i) => {
        const depth = (z + 1) / 2;
        if (depth < 0.25) return null;
        const bright = depth > 0.6;
        return (
          <g key={i} filter="url(#dotGlow)">
            <circle cx={x} cy={y} r={bright ? 4 : 2}
              fill="#3b82f6" fillOpacity={0.25 + depth * 0.4} />
            <circle cx={x} cy={y} r={bright ? 2 : 1}
              fill={bright ? 'white' : '#93c5fd'} fillOpacity={0.7 + depth * 0.25} />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pillar cards
// ---------------------------------------------------------------------------
function PillarCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-b from-blue-900/60 to-navy-deep/80 border border-blue-700/30 p-7 flex flex-col min-h-[260px] hover:border-blue-600/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.2)] transition-all">
      <h3 className="text-lg font-mono font-bold text-white mb-3">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed flex-1">{body}</p>
      <div className="mt-6 flex justify-end text-blue-400 opacity-70">{icon}</div>
    </div>
  );
}

function FingerprintPillarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-14 h-14">
      <path d="M6 12c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <path d="M8.5 14c0-1.9 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5" strokeLinecap="round" />
      <path d="M12 12v5" strokeLinecap="round" />
      <path d="M10 18c0 .8 0 1.5.4 2.2" strokeLinecap="round" />
      <path d="M14 18c0 .8 0 1.5-.4 2.2" strokeLinecap="round" />
      <path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3" strokeLinecap="round" />
    </svg>
  );
}

function NetworkPillarIcon() {
  return (
    <svg viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-14 h-14">
      <circle cx="30" cy="12" r="6" />
      <circle cx="12" cy="42" r="6" />
      <circle cx="48" cy="42" r="6" />
      <circle cx="30" cy="30" r="5" />
      <line x1="30" y1="18" x2="30" y2="25" strokeLinecap="round" />
      <line x1="30" y1="35" x2="16" y2="38" strokeLinecap="round" />
      <line x1="30" y1="35" x2="44" y2="38" strokeLinecap="round" />
      <line x1="24" y1="14" x2="15" y2="37" strokeLinecap="round" strokeOpacity="0.5" />
      <line x1="36" y1="14" x2="45" y2="37" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

function MicPillarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-14 h-14">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 12a7 7 0 0014 0" strokeLinecap="round" />
      <path d="M12 19v3" strokeLinecap="round" />
      <path d="M9 22h6" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Phone mockup
// ---------------------------------------------------------------------------
function PhoneMockup() {
  return (
    <div className="mx-auto w-56 h-[400px] rounded-[2.5rem] border-2 border-slate-700 bg-navy-deep p-2 shadow-[0_0_60px_rgba(59,130,246,0.2)]">
      <div className="w-full h-full rounded-[2rem] bg-gradient-to-b from-blue-900/40 to-navy-deep flex flex-col items-center justify-center gap-5 p-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/50 to-blue-700/50 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" className="w-8 h-8">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
          </svg>
        </div>
        <div className="w-28 h-28 bg-white rounded-lg p-2">
          <QrPattern />
        </div>
        <div className="text-[10px] font-mono text-slate-400 tracking-widest">SCAN TO VERIFY</div>
        <div className="text-xs font-mono text-blue-400/70">@username</div>
      </div>
    </div>
  );
}

function QrPattern() {
  const cells = Array.from({ length: 64 }, (_, i) => {
    const row = Math.floor(i / 8);
    const col = i % 8;
    if ((row < 3 && col < 3) || (row < 3 && col > 4) || (row > 4 && col < 3)) return true;
    return (i * 31 + 7) % 3 !== 0;
  });
  return (
    <div className="w-full h-full grid grid-cols-8 gap-px bg-white">
      {cells.map((on, i) => (
        <div key={i} className={on ? 'bg-navy-deep' : 'bg-white'} />
      ))}
    </div>
  );
}
