import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { sqlite } from "@workspace/db";
import { getConfig } from "./config";

export type AppRequest = Request & { userId?: string; user?: any };

export const USER_COOKIE_NAME = "webz_session";
export const ADMIN_COOKIE_NAME = "webz_admin";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return hash === computedHash;
}

export async function registerUser(email: string, password: string, name: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const config = getConfig();

  // Check if user exists
  const existingUser = sqlite
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizedEmail);

  if (existingUser) {
    throw new Error("An account with that email already exists.");
  }

  // Check if registration is enabled
  if (!config.features.registrationEnabled) {
    throw new Error("Registration is currently disabled.");
  }

  const passwordHash = hashPassword(password);
  const userId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // Create user (unverified if email verification required)
  sqlite
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, is_email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(userId, normalizedEmail, passwordHash, name.trim() || "Creator", config.features.emailVerificationRequired ? 0 : 1, now, now);

  // If email verification required, create verification code
  if (config.features.emailVerificationRequired) {
    await createEmailVerification(normalizedEmail, "register");
  }

  return { id: userId, email: normalizedEmail, name: name.trim() || "Creator", isEmailVerified: !config.features.emailVerificationRequired };
}

export async function loginUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const config = getConfig();

  const user = sqlite
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizedEmail) as any;

  if (!user) {
    throw new Error("Invalid email or password.");
  }

  if (user.is_banned) {
    throw new Error(`Your account has been banned. Reason: ${user.ban_reason || "No reason provided"}`);
  }

  if (!verifyPassword(password, user.password_hash)) {
    throw new Error("Invalid email or password.");
  }

  // Check email verification
  if (config.features.emailVerificationRequired && !user.is_email_verified) {
    throw new Error("Please verify your email address before logging in. Check your inbox for the verification code.");
  }

  // Update last login
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isEmailVerified: Boolean(user.is_email_verified),
    isAdmin: Boolean(user.is_admin),
    isBanned: Boolean(user.is_banned),
    premiumExpiresAt: user.premium_expires_at ? new Date(user.premium_expires_at * 1000) : null,
  };
}

export function createUserCookie(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

  sqlite
    .prepare(
      `INSERT INTO sessions (id, user_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(crypto.randomUUID(), userId, token, expiresAt, Math.floor(Date.now() / 1000));

  return token;
}

export function clearUserCookie(req: Request) {
  const token = req.cookies?.[USER_COOKIE_NAME] as string | undefined;
  if (token) {
    sqlite.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
}

export async function getUser(req: Request) {
  const token = req.cookies?.[USER_COOKIE_NAME] as string | undefined;
  if (!token) return null;

  const session = sqlite
    .prepare(
       `SELECT s.*, u.id, u.email, u.name, u.is_email_verified, u.is_admin, u.is_banned, u.premium_expires_at, u.avatar_url, u.created_at
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > ? AND u.is_banned = 0`
    )
    .get(token, Math.floor(Date.now() / 1000)) as any;

  if (!session) return null;

  return {
    id: session.id,
    email: session.email,
    name: session.name,
    isEmailVerified: Boolean(session.is_email_verified),
    isAdmin: Boolean(session.is_admin),
    isBanned: Boolean(session.is_banned),
    premiumExpiresAt: session.premium_expires_at ? new Date(session.premium_expires_at * 1000) : null,
    avatarUrl: session.avatar_url,
    createdAt: session.created_at ? new Date(session.created_at * 1000) : null,
  };
}

export async function requireUser(req: AppRequest, res: Response, next: NextFunction) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in to use Webz HTML to APK Studio." });
    return;
  }
  req.userId = user.id;
  req.user = user;
  next();
}

export async function requirePremium(req: AppRequest, res: Response, next: NextFunction) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  const isPremium = user.premiumExpiresAt && user.premiumExpiresAt > new Date();
  if (!isPremium && !user.isAdmin) {
    res.status(403).json({ error: "Premium subscription required." });
    return;
  }
  req.userId = user.id;
  req.user = user;
  next();
}

// Email Verification
export async function createEmailVerification(email: string, type: "register" | "reset_password" | "change_email"): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes
  const id = crypto.randomUUID();

  // Delete any existing verification for this email/type
  sqlite.prepare("DELETE FROM email_verifications WHERE email = ? AND type = ?").run(email, type);

  sqlite
    .prepare(
      `INSERT INTO email_verifications (id, email, code, type, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, email, code, type, expiresAt, Math.floor(Date.now() / 1000));

  return code;
}

export async function verifyEmailCode(email: string, code: string, type: "register" | "reset_password" | "change_email"): Promise<boolean> {
  const verification = sqlite
    .prepare(
      `SELECT * FROM email_verifications WHERE email = ? AND type = ? AND expires_at > ?`
    )
    .get(email, type, Math.floor(Date.now() / 1000)) as any;

  if (!verification) {
    return false;
  }

  if (verification.attempts >= 5) {
    sqlite.prepare("DELETE FROM email_verifications WHERE id = ?").run(verification.id);
    return false;
  }

  if (verification.code !== code) {
    sqlite.prepare("UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?").run(verification.id);
    return false;
  }

  // Code is valid
  sqlite.prepare("DELETE FROM email_verifications WHERE id = ?").run(verification.id);
  return true;
}

export async function markEmailVerified(email: string): Promise<void> {
  sqlite.prepare("UPDATE users SET is_email_verified = 1, updated_at = ? WHERE email = ?").run(Math.floor(Date.now() / 1000), email);
}

export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email) as any;
  if (!user) return null; // Don't reveal if email exists

  return createEmailVerification(email, "reset_password");
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<boolean> {
  const valid = await verifyEmailCode(email, code, "reset_password");
  if (!valid) return false;

  const passwordHash = hashPassword(newPassword);
  sqlite.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?").run(passwordHash, Math.floor(Date.now() / 1000), email);
  return true;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const user = sqlite.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as any;
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return false;
  }

  const passwordHash = hashPassword(newPassword);
  sqlite.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash, Math.floor(Date.now() / 1000), userId);
  return true;
}

// Admin functions
function encodeAdminIdentity(email: string): string {
  return Buffer.from(email.toLowerCase(), "utf8").toString("base64url");
}

export function createAdminCookie(adminEmail: string): string {
  const secret = process.env.SESSION_SECRET || "development-session-secret";
  const value = `${encodeAdminIdentity(adminEmail)}.${Date.now()}`;
  const sig = crypto.createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${sig}`;
}

export function isAdminCredentials(username: string, password: string): boolean {
  // Admin credentials are now stored in database
  const admin = sqlite.prepare("SELECT * FROM users WHERE email = ? AND is_admin = 1").get(username) as any;
  if (!admin) return false;
  return verifyPassword(password, admin.password_hash);
}

function adminSecret() {
  return process.env.SESSION_SECRET || "development-session-secret";
}

export function getAdminFromRequest(req: Request): any | null {
  const raw = req.cookies?.[ADMIN_COOKIE_NAME] as string | undefined;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [encodedEmail, timestamp, provided] = parts;
  if (!encodedEmail || !timestamp || !provided) return null;
  let email: string;
  try {
    email = Buffer.from(encodedEmail, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!email) return null;
  const value = `${encodedEmail}.${timestamp}`;
  const expected = crypto.createHmac("sha256", adminSecret()).update(value).digest("hex");
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    valid = false;
  }
  if (!valid) return null;
  const admin = sqlite
    .prepare("SELECT * FROM users WHERE email = ? AND is_admin = 1")
    .get(email.toLowerCase()) as any;
  if (!admin) return null;
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    isAdmin: true,
    isPremium: true,
  };
}

export function isAdmin(req: Request): boolean {
  return getAdminFromRequest(req) !== null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }
  req.userId = admin.id;
  req.user = admin;
  next();
}

// Helper to check if user is premium
export function isPremium(user: any): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  const expiry = user.premiumExpiresAt;
  if (!expiry) return false;
  const date = expiry instanceof Date ? expiry : new Date(expiry);
  return date > new Date();
}

// Cleanup expired sessions (run periodically)
export function cleanupExpiredSessions(): void {
  sqlite.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Math.floor(Date.now() / 1000));
  sqlite.prepare("DELETE FROM email_verifications WHERE expires_at < ?").run(Math.floor(Date.now() / 1000));
}