import * as faceapi from 'face-api.js';

// face-api.js model weights hosted by the library author. Using a CDN
// avoids shipping ~13 MB of model files in /public.
const MODEL_URL =
  'https://justadudewhohacks.github.io/face-api.js/models';

let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  })();
  return loadPromise;
}

export async function getFaceEmbedding(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<Float32Array | null> {
  await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(source, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection?.descriptor ?? null;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Euclidean distance — face-api.js convention. Distances below ~0.6 typically
// indicate the same person.
export function euclideanDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Convert a 128-d embedding into a short, stable ID by quantizing to int8 and
// SHA-256 hashing. Two embeddings of the same face yield similar — but not
// identical — hashes; we rely on the raw embedding + euclideanDistance for
// matching. The hash is for display / QR-code identification only.
export async function hashEmbedding(embedding: Float32Array): Promise<string> {
  const quantized = new Int8Array(embedding.length);
  for (let i = 0; i < embedding.length; i++) {
    quantized[i] = Math.max(-128, Math.min(127, Math.round(embedding[i] * 127)));
  }
  const buf = await crypto.subtle.digest('SHA-256', quantized);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- local storage of the user's vouch passport ---

const STORAGE_KEY = 'vouch.passport.v1';

export type PassportSource = 'face' | 'platform';

export interface StoredPassport {
  // Supabase profile UUID — set once the profile is created server-side.
  profileId?: string;
  source: PassportSource;
  handle: string;
  hash: string;
  // Empty array for platform (WebAuthn) source; face embedding for camera source.
  embedding: number[];
  createdAt: number;
}

export function savePassport(passport: StoredPassport): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(passport));
}

export function loadPassport(): StoredPassport | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredPassport;
  } catch {
    return null;
  }
}

export function clearPassport(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export const MATCH_THRESHOLD = 0.6;
