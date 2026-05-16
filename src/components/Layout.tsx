import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

const NAV_LINKS = [
  { label: 'How it works', to: '/#how' },
  { label: 'Live Skill Assessment', to: '/skill-test' },
  { label: 'Verify Peer', to: '/cosign' },
  { label: 'Review Queue', to: '/review' },
  { label: 'Register', to: '/register' },
];

export default function Layout() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-navy text-slate-200 flex flex-col">
      <nav className="border-b border-white/5 bg-navy-deep/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <Link to="/" className="flex items-center gap-2 font-mono text-lg font-bold tracking-tight text-white">
            <VouchIcon className="w-6 h-6 text-cyan-electric" />
            <span>Vouch</span>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-sm text-slate-400">
            {NAV_LINKS.map((l) => (
              <Link key={l.label} to={l.to} className="hover:text-white transition-colors">
                {l.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/card"
              className="px-5 py-2 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-all"
            >
              My Card
            </Link>
          </div>

          <button
            className="md:hidden text-slate-300 hover:text-white transition-colors"
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
          <div className="md:hidden border-t border-white/5 bg-navy-deep/95 px-6 py-4 flex flex-col gap-4 text-sm text-slate-300">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="hover:text-white transition-colors py-1"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link
              to="/card"
              className="mt-1 px-5 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold text-center hover:bg-blue-500 transition-all"
              onClick={() => setMenuOpen(false)}
            >
              My Card
            </Link>
          </div>
        )}
      </nav>

      <main className={onHome ? 'flex-1' : 'flex-1 max-w-5xl w-full mx-auto px-6 py-10'}>
        <Outlet />
      </main>

      <footer className="border-t border-white/5 bg-navy-deep/60 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-400">
          <div className="flex flex-wrap gap-6">
            <Link to="/#how" className="hover:text-white transition-colors">How it works</Link>
            <Link to="/skill-test" className="hover:text-white transition-colors">Live Skill Assessment</Link>
            <Link to="/cosign" className="hover:text-white transition-colors">Verify Peer</Link>
            <Link to="/review" className="hover:text-white transition-colors">Review Queue</Link>
            <Link to="/register" className="hover:text-white transition-colors">Register</Link>
          </div>
          <Link to="/#contact" className="hover:text-white transition-colors">Contact us</Link>
        </div>
      </footer>
    </div>
  );
}

function VouchIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2">
      <path d="M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
