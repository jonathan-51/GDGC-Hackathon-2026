import { Link, Outlet } from 'react-router-dom';
import { useUser } from '../hooks/useUser';

export default function Layout() {
  const { user } = useUser();
  const trustScore = user?.trustScore ?? 0;

  return (
    <div className="min-h-screen bg-navy text-slate-200">
      <nav className="border-b border-cyan-electric/10 bg-navy-deep/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-mono text-xl font-bold tracking-tight text-cyan-electric">
            VOUCH
          </Link>
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="text-slate-400">trust</span>
            <span className="text-cyan-electric font-bold">
              {trustScore.toFixed(2)}
            </span>
          </div>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
