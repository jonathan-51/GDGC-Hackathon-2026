import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { listProfiles } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import type { Profile } from '../lib/types';

type ProfileHit = Pick<Profile, 'id' | 'handle' | 'photo'>;

function hash32(s: string, salt = 0): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Spread users across Auckland CBD and surrounding suburbs
const BASE_LAT = -36.8485;
const BASE_LNG = 174.7633;
const SPREAD = 0.18; // ~20km spread

interface NodeInfo {
  id: string;
  handle: string;
  lat: number;
  lng: number;
  isMe: boolean;
}

function buildNodes(profiles: ProfileHit[], myId: string, myLat: number, myLng: number): NodeInfo[] {
  const others = profiles
    .filter(p => p.id !== myId)
    .map(p => {
      const hx = hash32(p.id, 1) / 4294967296;
      const hy = hash32(p.id, 2) / 4294967296;
      return {
        id: p.id,
        handle: p.handle,
        lat: BASE_LAT + (hx - 0.5) * SPREAD * 2,
        lng: BASE_LNG + (hy - 0.5) * SPREAD * 2,
        isMe: false,
      };
    });
  return [{ id: myId, handle: 'YOU', lat: myLat, lng: myLng, isMe: true }, ...others];
}

// Canvas overlay that draws glow halos + connection lines + node markers
class GlowOverlay extends L.Layer {
  private _nodes: NodeInfo[] = [];
  private _canvas: HTMLCanvasElement | null = null;
  private _frame = 0;
  private _pulseT = 0;

  setNodes(nodes: NodeInfo[]) {
    this._nodes = nodes;
  }

  onAdd(map: L.Map): this {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '400';
    // Attach to the map container directly so it doesn't move with pane transforms
    map.getContainer().appendChild(canvas);
    this._canvas = canvas;

    const resize = () => {
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    };

    map.on('zoom move resize zoomanim', () => this._draw(map));
    map.on('resize', resize);
    resize();
    this._startLoop(map);
    return this;
  }

  onRemove(map: L.Map): this {
    cancelAnimationFrame(this._frame);
    map.off('zoom move resize zoomanim');
    if (this._canvas) this._canvas.remove();
    return this;
  }

  private _startLoop(map: L.Map) {
    const loop = () => {
      this._pulseT += 0.02;
      this._draw(map);
      this._frame = requestAnimationFrame(loop);
    };
    this._frame = requestAnimationFrame(loop);
  }

  private _draw(map: L.Map) {
    const canvas = this._canvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    const toPixel = (lat: number, lng: number) => {
      const pt = map.latLngToContainerPoint([lat, lng]);
      return { x: pt.x * dpr, y: pt.y * dpr };
    };

    const screenNodes = this._nodes.map(n => ({ ...n, ...toPixel(n.lat, n.lng) }));

    // Area glow — large radial gradient per node to light up surrounding area
    for (const n of screenNodes) {
      const r = dpr * (n.isMe ? 200 : 160);
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
      if (n.isMe) {
        grad.addColorStop(0, 'rgba(208,208,208,0.20)');
        grad.addColorStop(0.35, 'rgba(208,208,208,0.07)');
        grad.addColorStop(1, 'rgba(208,208,208,0)');
      } else {
        grad.addColorStop(0, 'rgba(251,191,36,0.22)');
        grad.addColorStop(0.35, 'rgba(251,191,36,0.08)');
        grad.addColorStop(1, 'rgba(251,191,36,0)');
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Connection lines between nearby nodes (within ~6km)
    const CONNECT_PX = dpr * 300;
    for (let i = 0; i < screenNodes.length; i++) {
      for (let j = i + 1; j < screenNodes.length; j++) {
        const a = screenNodes[i], b = screenNodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > CONNECT_PX) continue;
        const alpha = (1 - dist / CONNECT_PX) * 0.6;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(251,191,36,${alpha})`;
        ctx.lineWidth = 1.5 * dpr;
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 6 * dpr;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Node markers
    const pulse = 0.5 + 0.5 * Math.sin(this._pulseT);
    for (const n of screenNodes) {
      const r = dpr * (n.isMe ? 9 : 7);
      const [cr, cg, cb] = n.isMe ? [208, 208, 208] : [251, 191, 36];
      const color = `rgb(${cr},${cg},${cb})`;

      // Pulsing outer ring
      const pRad = r + dpr * (n.isMe ? 6 + pulse * 8 : 4 + pulse * 6);
      ctx.beginPath();
      ctx.arc(n.x, n.y, pRad, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.15 + pulse * 0.1})`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();

      // Inner glow ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.2)`;
      ctx.fill();
      ctx.restore();

      // Main dot
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20 * dpr;
      ctx.fill();
      ctx.restore();

      // White core
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();

      // Label
      const zoom = map.getZoom();
      if (n.isMe || zoom >= 13) {
        const label = n.isMe ? '[YOU]' : `@${n.handle}`;
        const fs = dpr * Math.max(9, Math.min(13, zoom - 1));
        ctx.save();
        ctx.font = `bold ${fs}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8 * dpr;
        ctx.fillText(label, n.x, n.y - r - 5 * dpr);
        ctx.restore();
      }
    }
  }
}

export default function MapNearby() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<GlowOverlay | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<ProfileHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myCoords, setMyCoords] = useState<[number, number]>([BASE_LAT, BASE_LNG]);

  const myId = (session?.user?.id ?? '') as string;

  // Attempt to get real location
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      pos => setMyCoords([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    listProfiles(80)
      .then(setProfiles)
      .catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const nodes = useMemo(
    () => buildNodes(profiles, myId, myCoords[0], myCoords[1]),
    [profiles, myId, myCoords],
  );

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: myCoords,
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: true,
      fadeAnimation: true,
    });

    // Make unloaded tile areas black
    map.getContainer().style.background = '#06090f';

    // CartoDB Dark Matter — no API key needed
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      keepBuffer: 6,
      updateWhenZooming: false,
    }).addTo(map);

    // Smooth resize via ResizeObserver
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: true }));
    ro.observe(containerRef.current!);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const overlay = new GlowOverlay();
    overlay.addTo(map);

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current]);

  // Update overlay nodes whenever nodes change
  useEffect(() => {
    overlayRef.current?.setNodes(nodes);
  }, [nodes]);

  // Click on map — find nearest node and navigate
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: L.LeafletMouseEvent) => {
      const clickPt = map.latLngToContainerPoint(e.latlng);
      let best: NodeInfo | null = null;
      let bestDist = 20; // px threshold
      for (const n of nodes) {
        const pt = map.latLngToContainerPoint([n.lat, n.lng]);
        const d = Math.hypot(pt.x - clickPt.x, pt.y - clickPt.y);
        if (d < bestDist) { bestDist = d; best = n; }
      }
      if (best && !best.isMe) navigate(`/p/${encodeURIComponent(best.handle)}`);
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [nodes, navigate]);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 72px)', background: '#06090f' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-amber-500/20 bg-[#06090f] z-10">
        <span className="font-mono text-xs text-amber-400 uppercase tracking-widest">
          SILICON WITNESS · GRID
        </span>
        <div className="flex items-center gap-4 font-mono text-[10px] text-slate-500 uppercase tracking-widest">
          <span><span className="text-amber-400">{nodes.length - 1}</span> witnesses</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D0D0D0] shadow-[0_0_6px_#D0D0D0]" />
            <span>You</span>
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
            <span>Witness</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
            <span className="font-mono text-xs text-amber-400/60 animate-pulse uppercase tracking-widest bg-black/60 px-3 py-1 rounded">
              Loading grid…
            </span>
          </div>
        )}
        {loadError && (
          <div className="absolute bottom-14 left-4 text-xs font-mono text-red-400 bg-black/70 px-2 py-1 rounded z-50">
            {loadError}
          </div>
        )}
      </div>
    </div>
  );
}
