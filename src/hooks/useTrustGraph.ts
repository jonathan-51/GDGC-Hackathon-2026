import { useState } from 'react';
import type { TrustGraph } from '../lib/types';

export function useTrustGraph() {
  const [graph] = useState<TrustGraph>({ nodes: [], links: [] });
  const [loading] = useState(false);

  return { graph, loading };
}
