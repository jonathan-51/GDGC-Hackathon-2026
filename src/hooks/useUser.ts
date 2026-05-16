import { useCallback, useEffect, useState } from 'react';
import { loadPassport, type StoredPassport } from '../lib/biometric';
import { getProfile, listCredentialsFor, listVouchesFor } from '../lib/db';
import type { Credential, Profile, VouchWithVoucher } from '../lib/types';

interface UserState {
  passport: StoredPassport | null;
  profile: Profile | null;
  vouches: VouchWithVoucher[];
  credentials: Credential[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUser(): UserState {
  const [passport, setPassport] = useState<StoredPassport | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vouches, setVouches] = useState<VouchWithVoucher[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const p = loadPassport();
    setPassport(p);
    setError(null);
    if (!p?.profileId) {
      setProfile(null);
      setVouches([]);
      setCredentials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [prof, v, c] = await Promise.all([
        getProfile(p.profileId),
        listVouchesFor(p.profileId),
        listCredentialsFor(p.profileId),
      ]);
      if (!prof) {
        setError(
          `Profile ${p.profileId} not found in Supabase. Either the schema isn't applied, RLS is blocking reads, or this profile was created against a different project.`,
        );
      }
      setProfile(prof);
      setVouches(v);
      setCredentials(c);
    } catch (e) {
      console.error('useUser refresh failed', e);
      const obj = e as { message?: string; code?: string; details?: string };
      setError(
        `Supabase error${obj.code ? ` [${obj.code}]` : ''}: ${obj.message ?? String(e)}${obj.details ? ` — ${obj.details}` : ''}`,
      );
      setProfile(null);
      setVouches([]);
      setCredentials([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { passport, profile, vouches, credentials, loading, error, refresh };
}
