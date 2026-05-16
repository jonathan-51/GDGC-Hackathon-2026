import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db } from './db.js';

const app = express();
const httpServer = createServer(app);

const RP_NAME = 'Silicon Witness';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5174';
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());

const io = new Server(httpServer, {
  cors: { origin: ORIGIN, methods: ['GET', 'POST'] },
});

// Verifier devices join a session room to receive the auth:success event.
io.on('connection', (socket) => {
  socket.on('join:session', (sessionId) => {
    socket.join(sessionId);
  });
});

// In-memory store for pending challenges keyed by userId (registration)
// or sessionId (authentication). Entries are short-lived (< 5 min).
const challenges = new Map();

// Clean up stale challenges every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, val] of challenges) {
    if (val.createdAt < cutoff) challenges.delete(key);
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * POST /generate-registration-options
 * Body: { username: string }
 * Returns WebAuthn registration options configured for platform authenticators
 * (Touch ID, Face ID, Android biometrics).
 */
app.post('/generate-registration-options', async (req, res) => {
  const { username } = req.body;
  if (!username?.trim()) {
    return res.status(400).json({ error: 'username is required' });
  }

  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(id, username);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  const existingCredentials = db
    .prepare('SELECT * FROM credentials WHERE user_id = ?')
    .all(user.id);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(user.id),
    userName: username,
    userDisplayName: username,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      requireResidentKey: false,
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credential_id,
      transports: JSON.parse(c.transports),
    })),
  });

  challenges.set(user.id, { challenge: options.challenge, createdAt: Date.now() });

  res.json({ options, userId: user.id });
});

/**
 * POST /verify-registration
 * Body: { userId: string, response: RegistrationResponseJSON }
 * Verifies the authenticator response and persists the credential + aaguid.
 */
app.post('/verify-registration', async (req, res) => {
  const { userId, response } = req.body;
  if (!userId || !response) {
    return res.status(400).json({ error: 'userId and response are required' });
  }

  const stored = challenges.get(userId);
  if (!stored) {
    return res.status(400).json({ error: 'No pending challenge for this user' });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  challenges.delete(userId);

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: 'Registration verification failed' });
  }

  const { credential, aaguid } = verification.registrationInfo;

  // credential.id is a Uint8Array — encode to base64url for storage
  const credentialId = Buffer.from(credential.id).toString('base64url');
  const publicKey = Buffer.from(credential.publicKey).toString('base64url');

  db.prepare(`
    INSERT INTO credentials (id, user_id, credential_id, public_key, counter, aaguid, transports)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(credential_id) DO UPDATE SET
      public_key = excluded.public_key,
      counter    = excluded.counter,
      aaguid     = excluded.aaguid,
      transports = excluded.transports
  `).run(
    uuidv4(),
    userId,
    credentialId,
    publicKey,
    credential.counter,
    aaguid ?? null,
    JSON.stringify(credential.transports ?? []),
  );

  res.json({ verified: true, aaguid: aaguid ?? null });
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * POST /generate-authentication-options
 * Body: { username?: string }
 * Returns a signed challenge + sessionId. The sessionId is embedded in the
 * QR code so the verifier device can subscribe to the auth:success event.
 */
app.post('/generate-authentication-options', async (req, res) => {
  const { username } = req.body ?? {};

  let allowCredentials = [];
  if (username) {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (user) {
      const creds = db
        .prepare('SELECT * FROM credentials WHERE user_id = ?')
        .all(user.id);
      allowCredentials = creds.map((c) => ({
        id: c.credential_id,
        transports: JSON.parse(c.transports),
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials,
  });

  const sessionId = uuidv4();
  challenges.set(sessionId, {
    challenge: options.challenge,
    options,                    // stored so Device B can retrieve via GET /session/:id
    username: username ?? null,
    createdAt: Date.now(),
  });

  res.json({ options, sessionId });
});

/**
 * POST /verify-authentication
 * Body: { sessionId: string, response: AuthenticationResponseJSON }
 * Verifies the biometric signature. On success, emits auth:success to
 * the verifier device that joined the sessionId socket room.
 */
app.post('/verify-authentication', async (req, res) => {
  const { sessionId, response } = req.body;
  if (!sessionId || !response) {
    return res.status(400).json({ error: 'sessionId and response are required' });
  }

  const stored = challenges.get(sessionId);
  if (!stored) {
    return res.status(400).json({ error: 'No pending challenge for this session' });
  }

  // Look up the credential by the ID the authenticator sent back
  const credRow = db
    .prepare('SELECT * FROM credentials WHERE credential_id = ?')
    .get(response.id);
  if (!credRow) {
    return res.status(400).json({ error: 'Credential not found' });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: credRow.credential_id,
        publicKey: Buffer.from(credRow.public_key, 'base64url'),
        counter: credRow.counter,
        transports: JSON.parse(credRow.transports),
      },
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!verification.verified) {
    return res.status(400).json({ error: 'Authentication failed' });
  }

  // Update the signature counter to guard against cloned authenticators
  db.prepare('UPDATE credentials SET counter = ? WHERE credential_id = ?').run(
    verification.authenticationInfo.newCounter,
    credRow.credential_id,
  );

  challenges.delete(sessionId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(credRow.user_id);

  const payload = {
    sessionId,
    userId: user.id,
    username: user.username,
    aaguid: credRow.aaguid ?? null,
  };

  // Notify the verifier device (QR code displayer) that auth succeeded
  io.to(sessionId).emit('auth:success', payload);

  res.json({ verified: true, ...payload });
});

// ---------------------------------------------------------------------------
// Session lookup — Device B uses this after scanning the QR code to
// retrieve the authentication options for the active session.
// ---------------------------------------------------------------------------
app.get('/session/:sessionId', (req, res) => {
  const stored = challenges.get(req.params.sessionId);
  if (!stored?.options) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }
  res.json({ options: stored.options });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true }));

httpServer.listen(PORT, () => {
  console.log(`Silicon Witness backend  →  http://localhost:${PORT}`);
  console.log(`  RP_ID  : ${RP_ID}`);
  console.log(`  ORIGIN : ${ORIGIN}`);
});
