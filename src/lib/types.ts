export interface User {
  id: string;
  handle: string;
  createdAt: number;
  faceEmbedding?: number[];
  trustScore: number;
  vouchesReceived: string[];
  vouchesGiven: string[];
  skills: Skill[];
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  level: SkillLevel;
  verifiedBy: string[];
  testedAt?: number;
  evidenceUrl?: string;
}

export type SkillLevel = 'novice' | 'apprentice' | 'practitioner' | 'expert';

export interface Vouch {
  id: string;
  fromUserId: string;
  toUserId: string;
  message?: string;
  videoUrl?: string;
  createdAt: number;
  weight: number;
}

export interface CoSignRequest {
  id: string;
  requesterId: string;
  cosignerId?: string;
  status: CoSignStatus;
  context?: string;
  createdAt: number;
  completedAt?: number;
}

export type CoSignStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface SkillTestResult {
  id: string;
  userId: string;
  skillId: string;
  prompt: string;
  response: string;
  score: number;
  feedback: string;
  createdAt: number;
}

export interface TrustGraphNode {
  id: string;
  handle: string;
  trustScore: number;
}

export interface TrustGraphLink {
  source: string;
  target: string;
  weight: number;
}

export interface TrustGraph {
  nodes: TrustGraphNode[];
  links: TrustGraphLink[];
}
