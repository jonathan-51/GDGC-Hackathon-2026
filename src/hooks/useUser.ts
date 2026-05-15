import { useState } from 'react';
import type { User } from '../lib/types';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading] = useState(false);

  return { user, setUser, loading };
}
