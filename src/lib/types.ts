export interface Profile {
  id: string;
  handle: string;
  face_hash: string;
  face_embedding: number[];
  photo: string | null;
  created_at: string;
}

export interface Vouch {
  id: string;
  voucher_id: string;
  vouchee_id: string;
  context: string | null;
  match_distance: number | null;
  created_at: string;
}

export interface VouchWithVoucher extends Vouch {
  voucher: Pick<Profile, 'id' | 'handle' | 'face_hash'>;
}

export type SkillTestStatus = 'pending' | 'approved' | 'rejected';

export type AiVerdict = 'approve' | 'reject' | 'borderline';

export interface SkillTest {
  id: string;
  candidate_id: string;
  skill: string;
  question: string;
  answer: string;
  duration_seconds: number | null;
  status: SkillTestStatus;
  ai_score: number | null;
  ai_verdict: AiVerdict | null;
  ai_rationale: string | null;
  created_at: string;
}

export interface SkillTestWithCandidate extends SkillTest {
  candidate: Pick<Profile, 'id' | 'handle'>;
}

export interface SkillReview {
  id: string;
  test_id: string;
  reviewer_id: string;
  verdict: 'approve' | 'reject';
  notes: string | null;
  created_at: string;
}

export interface Credential {
  id: string;
  holder_id: string;
  skill: string;
  test_id: string | null;
  issued_at: string;
  expires_at: string | null;
  revoked: boolean;
}

export const VOUCH_SKILLS = [
  'Medicine',
  'Surgery',
  'Engineering',
  'Electrical',
  'Plumbing',
  'Agriculture',
  'Defense',
  'Teaching',
  'Pharmacy',
  'Construction',
] as const;

export type VouchSkill = (typeof VOUCH_SKILLS)[number];

// Minimum peer approvals before a credential is auto-issued.
export const APPROVAL_THRESHOLD = 2;
// Time limit for live skill-test answers.
export const SKILL_TEST_SECONDS = 120;
