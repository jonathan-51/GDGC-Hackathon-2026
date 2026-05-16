import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { listProfiles } from '../lib/db';
import { useUser } from '../hooks/useUser';
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

// Map center default (Auckland CBD)
const BASE_LAT = -36.8485;
const BASE_LNG = 174.7633;

// Curated Auckland-area land anchors. Profiles are deterministically assigned
// to one of these and jittered slightly so nobody lands in the harbor.
const LAND_ANCHORS: Array<[number, number]> = [
  [-36.8485, 174.7633], // CBD
  [-36.8585, 174.7700], // Parnell
  [-36.8696, 174.7766], // Newmarket
  [-36.8770, 174.7700], // Epsom
  [-36.8806, 174.7560], // Mt Eden
  [-36.8930, 174.7720], // Remuera
  [-36.8550, 174.7430], // Ponsonby
  [-36.8650, 174.7380], // Grey Lynn
  [-36.8730, 174.7320], // Kingsland
  [-36.8820, 174.7180], // Mt Albert
  [-36.9030, 174.7150], // Mt Roskill
  [-36.9230, 174.7820], // Onehunga
  [-36.9450, 174.8110], // Otahuhu
  [-36.9660, 174.8480], // Manukau (East Tamaki edge)
  [-36.9580, 174.7820], // Mangere Bridge
  [-36.8740, 174.8210], // Glen Innes
  [-36.8580, 174.8460], // St Heliers
  [-36.8720, 174.8780], // Howick (inland)
  [-36.7860, 174.7560], // Takapuna
  [-36.8290, 174.7950], // Devonport
  [-36.7780, 174.7220], // Glenfield
  [-36.7280, 174.7000], // Albany
  [-36.8780, 174.6300], // Henderson
  [-36.9070, 174.6630], // New Lynn
  [-36.9320, 174.7220], // Hillsborough
];

const JITTER = 0.004; // ~400m — keeps nodes within their suburb

interface NodeInfo {
  id: string;
  handle: string;
  photo: string | null;
  lat: number;
  lng: number;
  isMe: boolean;
}

function buildNodes(
  profiles: ProfileHit[],
  myId: string,
  myPhoto: string | null,
  myLat: number,
  myLng: number,
): NodeInfo[] {
  const others = profiles
    .filter(p => p.id !== myId)
    .map(p => {
      const anchorIdx = hash32(p.id, 0) % LAND_ANCHORS.length;
      const [aLat, aLng] = LAND_ANCHORS[anchorIdx];
      const jx = hash32(p.id, 1) / 4294967296;
      const jy = hash32(p.id, 2) / 4294967296;
      return {
        id: p.id,
        handle: p.handle,
        photo: p.photo ?? null,
        lat: aLat + (jx - 0.5) * JITTER * 2,
        lng: aLng + (jy - 0.5) * JITTER * 2,
        isMe: false,
      };
    });
  return [{ id: myId, handle: 'YOU', photo: myPhoto, lat: myLat, lng: myLng, isMe: true }, ...others];
}

// Canvas overlay that draws glow halos + connection lines + node markers
class GlowOverlay extends L.Layer {
  private _nodes: NodeInfo[] = [];
  private _canvas: HTMLCanvasElement | null = null;
  private _frame = 0;
  private _pulseT = 0;
  private _images = new Map<string, HTMLImageElement>();

  setNodes(nodes: NodeInfo[]) {
    this._nodes = nodes;
    for (const n of nodes) {
      if (n.photo && !this._images.has(n.photo)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = n.photo;
        this._images.set(n.photo, img);
      }
    }
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
    // Soft "lit area" glow — additive so overlapping nodes brighten the map
    // without each one being a giant blob.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const n of screenNodes) {
      const r = dpr * (n.isMe ? 240 : 200);
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
      if (n.isMe) {
        grad.addColorStop(0, 'rgba(220,220,230,0.32)');
        grad.addColorStop(0.35, 'rgba(200,200,215,0.10)');
        grad.addColorStop(1, 'rgba(200,200,215,0)');
      } else {
        grad.addColorStop(0, 'rgba(251,191,36,0.36)');
        grad.addColorStop(0.35, 'rgba(245,158,11,0.12)');
        grad.addColorStop(1, 'rgba(245,158,11,0)');
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();

    // Connection lines between nodes — fade with distance but keep visible
    // across the viewport.
    const CONNECT_PX = dpr * 1200;
    for (let i = 0; i < screenNodes.length; i++) {
      for (let j = i + 1; j < screenNodes.length; j++) {
        const a = screenNodes[i], b = screenNodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > CONNECT_PX) continue;
        const alpha = 0.15 + (1 - dist / CONNECT_PX) * 0.55;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(251,191,36,${alpha})`;
        ctx.lineWidth = 1.25 * dpr;
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 5 * dpr;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Node markers
    const pulse = 0.5 + 0.5 * Math.sin(this._pulseT);
    for (const n of screenNodes) {
      const r = dpr * (n.isMe ? 10 : 8);
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
      ctx.arc(n.x, n.y, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.2)`;
      ctx.fill();
      ctx.restore();

      // Colored dot marker — photos are intentionally hidden until hover.
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.shadowColor = color;
      ctx.shadowBlur = 18 * dpr;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      // White core
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();

      // Crisp colored border on top of photo
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

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
  const { profile } = useUser();
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<GlowOverlay | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<ProfileHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myCoords, setMyCoords] = useState<[number, number]>([BASE_LAT, BASE_LNG]);

  const myId = profile?.id ?? '';
  const myPhoto = profile?.photo ?? null;
  const [hover, setHover] = useState<{ node: NodeInfo; x: number; y: number } | null>(null);

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
    () => buildNodes(profiles, myId, myPhoto, myCoords[0], myCoords[1]),
    [profiles, myId, myPhoto, myCoords],
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

  // Hover detection — find node under cursor and show preview card
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best: NodeInfo | null = null;
      let bestDist = 22;
      for (const n of nodes) {
        const pt = map.latLngToContainerPoint([n.lat, n.lng]);
        const d = Math.hypot(pt.x - mx, pt.y - my);
        if (d < bestDist) { bestDist = d; best = n; }
      }
      if (best) {
        container.style.cursor = 'pointer';
        setHover({ node: best, x: mx, y: my });
      } else {
        container.style.cursor = '';
        setHover(null);
      }
    };
    const onLeave = () => { container.style.cursor = ''; setHover(null); };
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [nodes]);

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

        {hover && (
          <div
            className="absolute pointer-events-none z-[1000] min-w-[180px] rounded-lg border border-amber-400/40 bg-[#06090f]/95 backdrop-blur shadow-[0_0_20px_rgba(245,158,11,0.25)] p-3 flex items-center gap-3"
            style={{
              left: hover.x + 16,
              top: hover.y + 16,
              transform:
                hover.x > (containerRef.current?.clientWidth ?? 0) - 220
                  ? 'translateX(-100%) translateX(-32px)'
                  : undefined,
            }}
          >
            <div className="w-12 h-12 rounded-full overflow-hidden border border-amber-400/50 shrink-0 bg-[#0c1118] flex items-center justify-center">
              {hover.node.photo ? (
                <img src={hover.node.photo} alt={hover.node.handle} className="w-full h-full object-cover" />
              ) : (
                <span className="font-mono text-sm text-amber-400">
                  {hover.node.handle.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-xs uppercase tracking-widest text-amber-400/70">
                {hover.node.isMe ? 'You' : 'Witness'}
              </span>
              <span className="font-mono text-sm text-slate-100">
                @{hover.node.handle}
              </span>
              {!hover.node.isMe && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mt-1">
                  Click to view profile
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
