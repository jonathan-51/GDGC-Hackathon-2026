import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface TrustGraphNode {
  id: string;
  handle: string;
}

export interface TrustGraphLink {
  source: string;
  target: string;
}

export interface TrustGraph {
  nodes: TrustGraphNode[];
  links: TrustGraphLink[];
}

export function useTrustGraph() {
  const [graph, setGraph] = useState<TrustGraph>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: profiles }, { data: vouches }] = await Promise.all([
          supabase.from('profiles').select('id, handle'),
          supabase.from('vouches').select('voucher_id, vouchee_id'),
        ]);
        if (cancelled) return;
        setGraph({
          nodes: (profiles ?? []).map((p: { id: string; handle: string }) => ({
            id: p.id,
            handle: p.handle,
          })),
          links: (vouches ?? []).map((v: { voucher_id: string; vouchee_id: string }) => ({
            source: v.voucher_id,
            target: v.vouchee_id,
          })),
        });
      } catch (e) {
        console.error('useTrustGraph', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { graph, loading };
}
