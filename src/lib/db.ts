import { supabase } from './supabase';
import type {
  Credential,
  CredentialPhoto,
  Profile,
  SkillReview,
  SkillReviewWithReviewer,
  SkillTest,
  SkillTestStatus,
  SkillTestWithCandidate,
  Vouch,
  VouchWithVoucher,
} from './types';
import { APPROVAL_THRESHOLD } from './types';

export async function updateProfilePhoto(id: string, photo: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ photo })
    .eq('id', id);
  if (error) throw error;
}

export async function createProfile(input: {
  handle: string;
  face_hash: string;
  face_embedding: number[];
}): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function getProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function getProfileByUserId(user_id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user_id)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('handle', handle)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function searchProfilesByHandle(
  query: string,
  limit = 8,
): Promise<Pick<Profile, 'id' | 'handle' | 'photo'>[]> {
  const q = query.trim().replace(/^@/, '');
  if (!q) return [];
  const escaped = q.replace(/[%_]/g, '\\$&');
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, photo')
    .ilike('handle', `%${escaped}%`)
    .order('handle', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Pick<Profile, 'id' | 'handle' | 'photo'>[];
}

export async function listProfiles(
  limit = 24,
): Promise<Pick<Profile, 'id' | 'handle' | 'photo'>[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, photo')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Pick<Profile, 'id' | 'handle' | 'photo'>[];
}

export async function getProfileByHash(hash: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('face_hash', hash)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function listVouchesFor(vouchee_id: string): Promise<VouchWithVoucher[]> {
  const { data, error } = await supabase
    .from('vouches')
    .select('*, voucher:voucher_id (id, handle, face_hash)')
    .eq('vouchee_id', vouchee_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VouchWithVoucher[];
}

export async function createVouch(input: {
  voucher_id: string;
  vouchee_id: string;
  context?: string;
  match_distance?: number;
}): Promise<Vouch> {
  const { data, error } = await supabase
    .from('vouches')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Vouch;
}

export async function createSkillTest(input: {
  candidate_id: string;
  skill: string;
  question: string;
  answer: string;
  duration_seconds: number;
  video_url?: string;
  ai_score?: number;
  ai_verdict?: 'approve' | 'reject' | 'borderline';
  ai_rationale?: string;
}): Promise<SkillTest> {
  const { data, error } = await supabase
    .from('skill_tests')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as SkillTest;
}

export async function listAllPendingTests(
  excludeCandidateId?: string,
): Promise<SkillTestWithCandidate[]> {
  let q = supabase
    .from('skill_tests')
    .select('*, candidate:candidate_id (id, handle)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (excludeCandidateId) q = q.neq('candidate_id', excludeCandidateId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SkillTestWithCandidate[];
}

export async function listPendingTestsForSkill(
  skill: string,
  excludeCandidateId?: string,
): Promise<SkillTestWithCandidate[]> {
  let q = supabase
    .from('skill_tests')
    .select('*, candidate:candidate_id (id, handle)')
    .eq('skill', skill)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (excludeCandidateId) q = q.neq('candidate_id', excludeCandidateId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SkillTestWithCandidate[];
}

export async function listTestsForCandidate(candidate_id: string): Promise<SkillTest[]> {
  const { data, error } = await supabase
    .from('skill_tests')
    .select('*')
    .eq('candidate_id', candidate_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SkillTest[];
}

export async function listReviewsForTests(
  test_ids: string[],
): Promise<SkillReviewWithReviewer[]> {
  if (test_ids.length === 0) return [];
  const { data, error } = await supabase
    .from('skill_reviews')
    .select('*, reviewer:reviewer_id (id, handle)')
    .in('test_id', test_ids)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SkillReviewWithReviewer[];
}

export async function listReviewsForTest(test_id: string): Promise<SkillReview[]> {
  const { data, error } = await supabase
    .from('skill_reviews')
    .select('*')
    .eq('test_id', test_id);
  if (error) throw error;
  return (data ?? []) as SkillReview[];
}

export async function submitReview(input: {
  test_id: string;
  reviewer_id: string;
  verdict: 'approve' | 'reject';
  notes?: string;
}): Promise<SkillReview> {
  const { data, error } = await supabase
    .from('skill_reviews')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as SkillReview;
}

export async function setTestStatus(test_id: string, status: SkillTestStatus): Promise<void> {
  const { error } = await supabase
    .from('skill_tests')
    .update({ status })
    .eq('id', test_id);
  if (error) throw error;
}

export async function listCredentialPhotos(profile_id: string): Promise<CredentialPhoto[]> {
  const { data, error } = await supabase
    .from('credential_photos')
    .select('*')
    .eq('profile_id', profile_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CredentialPhoto[];
}

export async function uploadCredentialPhoto(
  profile_id: string,
  file: File,
  label?: string,
): Promise<CredentialPhoto> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${profile_id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('credential-photos')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (upErr) throw upErr;
  const { data: urlData } = supabase.storage.from('credential-photos').getPublicUrl(path);
  const { data, error } = await supabase
    .from('credential_photos')
    .insert({ profile_id, photo_url: urlData.publicUrl, label: label?.trim() || null })
    .select()
    .single();
  if (error) throw error;
  return data as CredentialPhoto;
}

export async function deleteCredentialPhoto(photo: CredentialPhoto): Promise<void> {
  const { error } = await supabase.from('credential_photos').delete().eq('id', photo.id);
  if (error) throw error;
  try {
    const url = new URL(photo.photo_url);
    const marker = '/credential-photos/';
    const idx = url.pathname.indexOf(marker);
    if (idx >= 0) {
      const storagePath = url.pathname.slice(idx + marker.length);
      await supabase.storage.from('credential-photos').remove([storagePath]);
    }
  } catch (e) {
    console.warn('failed to remove storage object for credential photo', e);
  }
}

export async function listCredentialsFor(holder_id: string): Promise<Credential[]> {
  const { data, error } = await supabase
    .from('credentials')
    .select('*')
    .eq('holder_id', holder_id)
    .order('issued_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Credential[];
}

export async function issueCredential(input: {
  holder_id: string;
  skill: string;
  test_id: string;
  expires_at?: string;
}): Promise<Credential> {
  const { data, error } = await supabase
    .from('credentials')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Credential;
}

// After a review is submitted, count verdicts and (atomically enough for a
// demo) close out the test + issue a credential if it crossed the threshold.
// The AI verdict counts as one weighted vote alongside the peers.
export async function maybeFinalizeTest(test_id: string, candidate_id: string, skill: string) {
  const [reviews, { data: testRow }] = await Promise.all([
    listReviewsForTest(test_id),
    supabase.from('skill_tests').select('ai_verdict').eq('id', test_id).maybeSingle(),
  ]);
  const aiVerdict = (testRow?.ai_verdict ?? null) as 'approve' | 'reject' | 'borderline' | null;
  let approves = reviews.filter((r) => r.verdict === 'approve').length;
  let rejects = reviews.filter((r) => r.verdict === 'reject').length;
  if (aiVerdict === 'approve') approves += 1;
  if (aiVerdict === 'reject') rejects += 1;
  if (approves >= APPROVAL_THRESHOLD) {
    await setTestStatus(test_id, 'approved');
    // 30-day temporary credential
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    await issueCredential({
      holder_id: candidate_id,
      skill,
      test_id,
      expires_at: expires.toISOString(),
    });
    return { finalized: true, outcome: 'approved' as const };
  }
  if (rejects >= APPROVAL_THRESHOLD) {
    await setTestStatus(test_id, 'rejected');
    return { finalized: true, outcome: 'rejected' as const };
  }
  return { finalized: false };
}
