// Face embedding utilities backed by face-api.js.
// Implementation pending — models must be loaded from /public/models.

export const MODEL_URL = '/models';

export async function loadFaceModels(): Promise<void> {
  // TODO: load face-api.js models (tinyFaceDetector, faceLandmark68Net, faceRecognitionNet)
}

export async function getFaceEmbedding(_video: HTMLVideoElement): Promise<number[] | null> {
  // TODO: detect face and compute 128-d descriptor
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
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
