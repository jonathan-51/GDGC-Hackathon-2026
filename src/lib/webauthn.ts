// Native-platform biometric (Touch ID, Windows Hello, Android fingerprint,
// iOS Face ID) via WebAuthn. The browser proves the user is present and
// authenticates with the device's secure enclave; we never see the biometric
// data itself — just an attested credential ID we can hash and treat as a
// stable anchor.

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
