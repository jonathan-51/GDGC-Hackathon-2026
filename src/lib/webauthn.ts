// Native-platform biometric (Touch ID, Windows Hello, Android fingerprint,
// iOS Face ID) via WebAuthn. The browser proves the user is present and
// authenticates with the device's secure enclave; we never see the biometric
// data itself — just an attested credential ID we can hash and treat as a
// stable anchor.

export type HardwareWitnessIcon = 'fingerprint' | 'faceid' | 'generic';

export interface HardwareWitness {
  icon: HardwareWitnessIcon;
  label: string;
  credentialId?: string;
}

export function identifyHardwareWitness(credentialId?: string): HardwareWitness {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) {
    return { icon: 'faceid', label: 'Verified via iPhone Face ID', credentialId };
  }
  if (/Macintosh|MacIntel/.test(ua)) {
    return { icon: 'fingerprint', label: 'Verified via MacBook Secure Enclave (Fingerprint)', credentialId };
  }
  if (/Android/.test(ua)) {
    return { icon: 'fingerprint', label: 'Verified via Android Biometric', credentialId };
  }
  if (/Windows/.test(ua)) {
    return { icon: 'generic', label: 'Verified via Windows Hello', credentialId };
  }
  return { icon: 'generic', label: 'Verified via Device Biometric', credentialId };
}

export function webAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    !!navigator.credentials?.create
  );
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!webAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function registerPlatformBiometric(handle: string): Promise<{
  credentialId: string;
  hash: string;
} | null> {
  if (!webAuthnSupported()) return null;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Vouch' },
      user: {
        id: userId,
        name: handle,
        displayName: handle,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!cred) return null;
  const rawId = cred.rawId;
  const credentialId = bufToHex(rawId);
  const hashBuf = await crypto.subtle.digest('SHA-256', rawId);
  return { credentialId, hash: bufToHex(hashBuf) };
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

export async function authenticatePlatformBiometric(credentialId: string): Promise<boolean> {
  if (!webAuthnSupported()) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: hexToBuf(credentialId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
