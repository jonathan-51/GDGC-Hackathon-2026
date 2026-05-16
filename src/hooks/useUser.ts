import { useCallback, useEffect, useState } from 'react';
import { loadPassport, savePassport, type StoredPassport } from '../lib/biometric';
import { getProfileByUserId, listCredentialsFor, listVouchesFor } from '../lib/db';
import type { Credential, Profile, VouchWithVoucher } from '../lib/types';
import { useAuth } from './useAuth';

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
  const { session, loading: authLoading } = useAuth();
  const [passport, setPassport] = useState<StoredPassport | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vouches, setVouches] = useState<VouchWithVoucher[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    if (authLoading) {
      setLoading(true);
      return;
    }

    // No session = no identity. The local passport alone isn't enough — it
    // belongs to *some* account, and without a sign-in we don't know which.
    if (!session) {
      setPassport(null);
      setProfile(null);
      setVouches([]);
      setCredentials([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const prof = await getProfileByUserId(session.user.id);
      if (!prof) {
        // Signed-in account hasn't registered a card yet.
        setPassport(null);
        setProfile(null);
        setVouches([]);
        setCredentials([]);
        return;
      }

      // Reconcile the local passport with the signed-in account. If the
      // cached passport points at a different profile, throw it away — it
      // belongs to another account that was previously signed in here.
      const cached = loadPassport();
      const cachedMatches = cached?.profileId === prof.id;
      const livePassport: StoredPassport = cachedMatches
        ? (cached as StoredPassport)
        : {
            profileId: prof.id,
            source: 'face',
            handle: prof.handle,
            hash: prof.face_hash,
            embedding: prof.face_embedding,
            photo: prof.photo ?? undefined,
            createdAt: new Date(prof.created_at).getTime(),
          };
      if (!cachedMatches) savePassport(livePassport);
      setPassport(livePassport);

      const [v, c] = await Promise.all([
        listVouchesFor(prof.id),
        listCredentialsFor(prof.id),
      ]);
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
  }, [authLoading, session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { passport, profile, vouches, credentials, loading, error, refresh };
}
