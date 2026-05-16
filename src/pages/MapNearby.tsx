import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProfiles } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import type { Profile } from '../lib/types';

type ProfileHit = Pick<Profile, 'id' | 'handle' | 'photo'>;

interface PlacedProfile extends ProfileHit {
  angle: number;
  radius: number;
  distanceM: number;
}

interface Coords {
  lat: number;
  lng: number;
  accuracy: number | null;
}

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function placeProfiles(profiles: ProfileHit[], maxRadius: number, excludeId?: string): PlacedProfile[] {
  return profiles
    .filter((p) => p.id !== excludeId)
    .map((p) => {
      const seed = hashSeed(p.id);
      const angle = (seed % 360) * (Math.PI / 180);
      const r = 0.12 + ((seed >>> 9) % 1000) / 1000 * 0.88;
      const radius = Math.sqrt(r) * maxRadius;
      const distanceM = Math.round(50 + r * 1450);
      return { ...p, angle, radius, distanceM };
    })
    .sort((a, b) => a.distanceM - b.distanceM);
}

export default function MapNearby() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'ready' | 'denied'>('idle');
  const [profiles, setProfiles] = useState<ProfileHit[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProfiles(40)
      .then((rows) => { if (!cancelled) setProfiles(rows); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function requestLocation() {
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not available in this browser.');
      setGeoStatus('denied');
      return;
    }
    setGeoStatus('locating');
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
        setGeoStatus('ready');
      },
      (err) => {
        setGeoError(err.message || 'Could not determine your location.');
        setGeoStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  useEffect(() => {
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myId = (session?.user?.id ?? '') as string;
  const MAX_RADIUS = 140;
  const placed = useMemo(
    () => placeProfiles(profiles, MAX_RADIUS, myId),
    [profiles, myId],
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <h2 className="text-4xl font-mono font-bold text-cyan-electric">Nearby</h2>
        <p className="text-slate-400">
          See who's around you on Illume. Tap any marker to open their profile.
        </p>
      </header>

      <div className="rounded-2xl border border-cyan-electric/20 bg-navy-deep/60 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono uppercase tracking-widest text-slate-400">
          <div>
            {geoStatus === 'locating' && <span>Locating…</span>}
            {geoStatus === 'ready' && coords && (
              <span className="text-cyan-electric/80">
                {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                {coords.accuracy ? ` · ±${Math.round(coords.accuracy)}m` : ''}
              </span>
            )}
            {geoStatus === 'denied' && (
              <span className="text-red-300">Location unavailable</span>
            )}
            {geoStatus === 'idle' && <span>Location needed</span>}
          </div>
          <button
            onClick={requestLocation}
            className="px-3 py-1 rounded-full border border-cyan-electric/40 text-cyan-electric hover:bg-cyan-electric/10 transition"
          >
            Refresh
          </button>
        </div>

        {geoError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-xs font-mono">
            {geoError}
          </div>
        )}

        <div className="relative aspect-square w-full max-w-md mx-auto">
          <svg viewBox="-160 -160 320 320" className="w-full h-full">
            <defs>
              <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0ff4" />
                <stop offset="70%" stopColor="#0ff1" />
                <stop offset="100%" stopColor="#0ff0" />
              </radialGradient>
            </defs>
            <circle cx="0" cy="0" r="150" fill="url(#radarBg)" />
            {[40, 80, 120, 150].map((r) => (
              <circle
                key={r}
                cx="0" cy="0" r={r}
                fill="none"
                stroke="rgba(34,211,238,0.18)"
                strokeDasharray="2 4"
              />
            ))}
            <line x1="-150" y1="0" x2="150" y2="0" stroke="rgba(34,211,238,0.12)" />
            <line x1="0" y1="-150" x2="0" y2="150" stroke="rgba(34,211,238,0.12)" />

            <g>
              <circle cx="0" cy="0" r="9" fill="#22d3ee" opacity="0.25">
                <animate attributeName="r" values="6;16;6" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="0" cy="0" r="6" fill="#22d3ee" stroke="white" strokeWidth="1.5" />
            </g>

            {placed.map((p) => {
              const x = Math.cos(p.angle) * p.radius;
              const y = Math.sin(p.angle) * p.radius;
              const isHover = hovered === p.id;
              return (
                <g
                  key={p.id}
                  transform={`translate(${x},${y})`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(p.id)}
                  onMouseLeave={() => setHovered((h) => (h === p.id ? null : h))}
                  onClick={() => navigate(`/p/${encodeURIComponent(p.handle)}`)}
                >
                  <circle r="14" fill="rgba(34,211,238,0.15)" />
                  {p.photo ? (
                    <>
                      <clipPath id={`clip-${p.id}`}>
                        <circle r="10" />
                      </clipPath>
                      <image
                        href={p.photo}
                        x="-10" y="-10" width="20" height="20"
                        clipPath={`url(#clip-${p.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                      <circle r="10" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
                    </>
                  ) : (
                    <circle r="9" fill="#0b1220" stroke="#22d3ee" strokeWidth="1.5" />
                  )}
                  {isHover && (
                    <g transform="translate(0,-20)">
                      <rect
                        x={-Math.max(28, p.handle.length * 4)}
                        y="-12"
                        width={Math.max(56, p.handle.length * 8)}
                        height="16"
                        rx="4"
                        fill="#0b1220"
                        stroke="#22d3ee"
                        strokeWidth="0.5"
                      />
                      <text
                        textAnchor="middle"
                        y="0"
                        fontSize="9"
                        fontFamily="monospace"
                        fill="#22d3ee"
                      >
                        @{p.handle}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-slate-400">
              Loading profiles…
            </div>
          )}
        </div>

        <div className="text-[10px] font-mono text-center text-slate-500 uppercase tracking-widest">
          You · ~1.5km radius
        </div>
      </div>

      {loadError && (
        <div className="text-xs text-red-300 font-mono">{loadError}</div>
      )}
    </div>
  );
}
