import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

const NAV_LINKS = [
  { label: 'How It Works', to: '/#how' },
  { label: 'Generate Card', to: '/register' },
  { label: 'Verify Peer', to: '/cosign' },
  { label: 'Scan Profile', to: '/scan' },
  { label: 'Live Skill Assessment', to: '/skill-test' },
  { label: 'Review Queue', to: '/review' },
  { label: 'My Card', to: '/card' },
];

export default function Layout() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-navy text-slate-200 flex flex-col">
      <nav className="border-b border-cyan-electric/10 bg-navy-deep/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <Link to="/" className="flex items-center gap-2 font-mono text-xl font-bold tracking-tight text-cyan-electric">
            <ShieldIcon className="w-7 h-7" />
            <span>Vouch</span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-sm text-slate-300">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="hover:text-cyan-electric transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>
          <button
            className="md:hidden text-slate-300 hover:text-cyan-electric transition-colors"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-cyan-electric/10 bg-navy-deep/95 px-6 py-4 flex flex-col gap-4 text-sm text-slate-300">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="hover:text-cyan-electric transition-colors py-1"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <main className={onHome ? 'flex-1' : 'flex-1 max-w-5xl w-full mx-auto px-6 py-10'}>
        <Outlet />
      </main>

      <footer className="border-t border-cyan-electric/10 bg-navy-deep/60 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-400">
          <div className="flex flex-col gap-2">
            <Link to="/" className="hover:text-cyan-electric">Home</Link>
            <Link to="/#privacy" className="hover:text-cyan-electric">Privacy</Link>
            <Link to="/#contact" className="hover:text-cyan-electric">Contact Us</Link>
          </div>
          <div>
            <h4 className="text-cyan-electric font-mono mb-2">Mission</h4>
            <p className="text-slate-400 max-w-md">
              A decentralized, biometric-driven network for a world where your record
              is your body and your community.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ShieldIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
