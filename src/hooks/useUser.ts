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
  refresh: () => Promise<void>;
}

export function useUser(): UserState {
  const [passport, setPassport] = useState<StoredPassport | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vouches, setVouches] = useState<VouchWithVoucher[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const p = loadPassport();
    setPassport(p);
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
      // If Supabase is unavailable, fall back to a local profile built from
      // the passport so the rest of the app doesn't treat the user as unregistered.
      setProfile(prof ?? {
        id: p.profileId,
        handle: p.handle,
        face_hash: p.hash,
        face_embedding: p.embedding,
        photo: p.photo ?? null,
        created_at: new Date(p.createdAt).toISOString(),
      });
      setVouches(v);
      setCredentials(c);
    } catch (e) {
      console.error('useUser refresh failed', e);
      // Still surface a local profile on total failure
      if (p) {
        setProfile({
          id: p.profileId,
          handle: p.handle,
          face_hash: p.hash,
          face_embedding: p.embedding,
          photo: p.photo ?? null,
          created_at: new Date(p.createdAt).toISOString(),
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { passport, profile, vouches, credentials, loading, refresh };
}
