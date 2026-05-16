import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { signOut, useAuth } from '../hooks/useAuth';

const NAV_LINKS = [
  { label: 'Live Skill Assessment', to: '/skill-test' },
  { label: 'Scan & Verify', to: '/scan' },
  { label: 'Nearby', to: '/map' },
  { label: 'Review Queue', to: '/review' },
];

export default function Layout() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const { session } = useAuth();
  const username = session
    ? (session.user.user_metadata?.username as string | undefined)
      ?? session.user.email?.replace(/@vouch\.local$/, '')
      ?? session.user.email
      ?? ''
    : '';

  return (
    <div className="min-h-screen bg-navy text-slate-200 flex flex-col">
      <nav className="border-b border-white/5 bg-navy-deep/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center">
          {/* Left — logo */}
          <div className="flex-1 flex items-center">
            <Link to="/" className="flex items-center gap-2 font-mono text-lg font-bold tracking-tight text-white shrink-0">
              <VouchIcon className="w-6 h-6 text-[#F2DDA4]" />
              <span>Illume</span>
            </Link>
          </div>

          {/* Centre — nav links */}
          <div className="hidden lg:flex items-center gap-2 text-sm text-slate-400">
            {NAV_LINKS.map((l) => {
              const active = pathname === l.to;
              return (
                <Link
                  key={l.label}
                  to={l.to}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                    active
                      ? 'text-white bg-white/5'
                      : 'hover:text-white hover:bg-white/5'
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>

          {/* Right — auth + card */}
          <div className="flex-1 hidden lg:flex items-center justify-end gap-3">
            {session ? (
              <>
                <span
                  className="text-xs text-[#F2DDA4]/80 font-mono truncate max-w-[140px]"
                  title={username}
                >
                  @{username}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-xs font-mono text-slate-300 hover:text-[#F2DDA4] border border-[#E6B347]/30 px-3 py-1.5 rounded-full transition"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/auth?mode=signin" className="text-sm text-slate-300 hover:text-[#F2DDA4] transition-colors">
                  Sign in
                </Link>
                <Link
                  to="/auth?mode=signup"
                  className="text-xs font-mono bg-[#E6B347]/10 text-[#F2DDA4] border border-[#E6B347]/40 font-semibold px-3 py-1.5 rounded-full hover:bg-[#E6B347]/20 transition"
                >
                  Sign up
                </Link>
              </>
            )}
            <Link
              to="/card"
              className="px-4 py-1.5 rounded-full bg-[#C7A97A] text-white text-sm font-semibold hover:bg-[#E6B347] transition-all"
            >
              My Card
            </Link>
          </div>

          <button
            className="lg:hidden ml-auto text-slate-300 hover:text-white transition-colors"
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
          <div className="lg:hidden border-t border-white/5 bg-navy-deep/95 px-6 py-4 flex flex-col gap-4 text-sm text-slate-300">
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
            <div className="border-t border-[#E6B347]/10 pt-3 flex flex-col gap-3">
              {session ? (
                <>
                  <span className="text-xs text-[#F2DDA4]/80 font-mono truncate">@{username}</span>
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="self-start text-xs font-mono text-slate-300 hover:text-[#F2DDA4] border border-[#E6B347]/30 px-3 py-1 rounded-full"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Link
                    to="/auth?mode=signin"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 text-center text-sm font-mono text-slate-200 border border-[#E6B347]/40 px-4 py-2 rounded-full hover:bg-[#E6B347]/10 transition"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/auth?mode=signup"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 text-center text-sm font-mono font-semibold bg-[#E6B347]/10 text-[#F2DDA4] border border-[#E6B347]/40 px-4 py-2 rounded-full hover:bg-[#E6B347]/20 transition"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
            <Link
              to="/card"
              className="mt-1 px-5 py-2.5 rounded-full bg-[#C7A97A] text-white text-sm font-semibold text-center hover:bg-[#E6B347] transition-all"
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
            <Link to="/scan" className="hover:text-white transition-colors">Scan Profile</Link>
            <Link to="/map" className="hover:text-white transition-colors">Nearby</Link>
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
