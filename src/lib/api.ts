import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed');
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed');
  return data as T;
}

export function apiGenerateRegistrationOptions(username: string) {
  return post<{ options: PublicKeyCredentialCreationOptionsJSON; userId: string }>(
    '/generate-registration-options',
    { username },
  );
}

export function apiVerifyRegistration(userId: string, response: RegistrationResponseJSON) {
  return post<{ verified: boolean; aaguid: string | null }>(
    '/verify-registration',
    { userId, response },
  );
}

export function apiGenerateAuthenticationOptions(username?: string) {
  return post<{ options: PublicKeyCredentialRequestOptionsJSON; sessionId: string }>(
    '/generate-authentication-options',
    { username },
  );
}

export function apiGetSession(sessionId: string) {
  return get<{ options: PublicKeyCredentialRequestOptionsJSON }>(
    `/session/${sessionId}`,
  );
}

export function apiVerifyAuthentication(sessionId: string, response: AuthenticationResponseJSON) {
  return post<{ verified: boolean; userId: string; username: string; aaguid: string | null }>(
    '/verify-authentication',
    { sessionId, response },
  );
}
