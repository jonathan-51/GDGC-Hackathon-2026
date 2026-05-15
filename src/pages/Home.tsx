import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-7xl font-mono font-bold text-cyan-electric drop-shadow-[0_0_20px_rgba(0,255,209,0.4)]"
      >
        Vouch
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="mt-4 text-slate-400 font-mono text-sm tracking-wide"
      >
        Identity for a world without records.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="mt-12 flex flex-col sm:flex-row gap-4"
      >
        <NavButton to="/register" label="Register" />
        <NavButton to="/cosign" label="Co-Sign" />
        <NavButton to="/skill-test" label="Skill Test" />
      </motion.div>
    </div>
  );
}

function NavButton({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="px-8 py-3 border border-cyan-electric/40 text-cyan-electric font-mono uppercase tracking-widest text-sm hover:bg-cyan-electric/10 hover:shadow-glow transition-all"
    >
      {label}
    </Link>
  );
}
