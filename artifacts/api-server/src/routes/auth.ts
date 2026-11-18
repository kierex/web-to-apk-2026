import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import {
  clearUserCookie,
  createUserCookie,
  getUser,
  loginUser,
  registerUser,
  USER_COOKIE_NAME,
  createEmailVerification,
  verifyEmailCode,
  markEmailVerified,
  requestPasswordReset,
  resetPassword,
  changePassword,
  isPremium,
  cleanupExpiredSessions,
} from "../lib/auth";
import { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from "../lib/mailer";
import { getConfig, isSmtpConfigured } from "../lib/config";

const router: IRouter = Router();

const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
  name: z.string().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
});

const verifyEmailSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().length(6),
});

const resendVerificationSchema = z.object({
  email: z.string().email().max(200),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(200),
});

const resetPasswordSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().length(6),
  password: z.string().min(6).max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(200),
  newPassword: z.string().min(6).max(200),
});

function publicUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isEmailVerified: user.isEmailVerified,
    isAdmin: user.isAdmin,
    isPremium: isPremium(user),
    premiumExpiresAt: user.premiumExpiresAt,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt ? (user.createdAt instanceof Date ? user.createdAt.getTime() : Number(user.createdAt)) : null,
  };
}

function setSession(res: Response, userId: string) {
  res.cookie(USER_COOKIE_NAME, createUserCookie(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: "/",
  });
}

// Cleanup expired sessions periodically
setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // Every hour

// Get current session
router.get("/auth/session", async (req, res) => {
  const user = await getUser(req);
  res.json({ authenticated: Boolean(user), user: user ? publicUser(user) : null });
});

// Register
router.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a valid email and a password with at least 6 characters." });
    return;
  }

  const config = getConfig();
  if (!config.features.registrationEnabled) {
    res.status(403).json({ error: "Registration is currently disabled." });
    return;
  }

  try {
    const user = await registerUser(parsed.data.email, parsed.data.password, parsed.data.name || "Creator");
    setSession(res, user.id);

    let devCode: string | null = null;
    if (config.features.emailVerificationRequired && !user.isEmailVerified) {
      const code = await createEmailVerification(user.email, "register");
      if (isSmtpConfigured()) {
        await sendVerificationEmail(user.email, code, user.name);
      } else {
        // Dev mode: SMTP not configured — auto-verify and expose the code for testing
        devCode = code;
        await markEmailVerified(user.email);
        await sendWelcomeEmail(user.email, user.name);
      }
    } else {
      // Send welcome email
      await sendWelcomeEmail(user.email, user.name);
    }

    const fresh = await getUser(req);
    res.status(201).json({
      user: fresh ? publicUser(fresh) : user,
      requiresVerification: config.features.emailVerificationRequired && !user.isEmailVerified && !devCode,
      devVerificationCode: devCode,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not create the account." });
  }
});

// Login
router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your email and password." });
    return;
  }

  try {
    const user = await loginUser(parsed.data.email, parsed.data.password);
    setSession(res, user.id);
    const config = getConfig();
    const requiresVerification = config.features.emailVerificationRequired && !user.isEmailVerified;
    res.json({ user: publicUser(user), requiresVerification });
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "Could not sign in." });
  }
});

// Logout
router.post("/auth/logout", (req, res) => {
  clearUserCookie(req);
  res.clearCookie(USER_COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

// Verify email
router.post("/auth/verify-email", async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email or verification code." });
    return;
  }

  const { email, code } = parsed.data;
  const valid = await verifyEmailCode(email, code, "register");

  if (!valid) {
    res.status(400).json({ error: "Invalid or expired verification code." });
    return;
  }

  await markEmailVerified(email);

  const user = await getUser(req);
  if (user) {
    // Update session with verified status
    setSession(res, user.id);
  }

  // Send welcome email
  const userData = sqlite.prepare("SELECT name FROM users WHERE email = ?").get(email) as any;
  if (userData) {
    await sendWelcomeEmail(email, userData.name);
  }

  res.json({ success: true, message: "Email verified successfully!" });
});

// Resend verification email
router.post("/auth/resend-verification", async (req, res) => {
  const parsed = resendVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email address." });
    return;
  }

  const { email } = parsed.data;
  const config = getConfig();

  if (!config.features.emailVerificationRequired) {
    res.status(400).json({ error: "Email verification is not required." });
    return;
  }

  const user = sqlite.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!user) {
    // Don't reveal if email exists
    res.json({ success: true, message: "If the email exists, a verification code has been sent." });
    return;
  }

  if (user.is_email_verified) {
    res.status(400).json({ error: "Email is already verified." });
    return;
  }

  const code = await createEmailVerification(email, "register");
  await sendVerificationEmail(email, code, user.name);

  res.json({ success: true, message: "Verification code sent!" });
});

// Forgot password
router.post("/auth/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email address." });
    return;
  }

  const { email } = parsed.data;
  const code = await requestPasswordReset(email);

  if (code) {
    const user = sqlite.prepare("SELECT name FROM users WHERE email = ?").get(email) as any;
    if (user) {
      await sendPasswordResetEmail(email, code, user.name);
    }
  }

  // Always return success to prevent email enumeration
  res.json({ success: true, message: "If the email exists, a password reset code has been sent." });
});

// Reset password
router.post("/auth/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email, code, or password." });
    return;
  }

  const { email, code, password } = parsed.data;
  const success = await resetPassword(email, code, password);

  if (!success) {
    res.status(400).json({ error: "Invalid or expired reset code." });
    return;
  }

  res.json({ success: true, message: "Password reset successfully!" });
});

// Change password (authenticated)
router.post("/auth/change-password", async (req, res) => {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid current or new password." });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;
  const success = await changePassword(user.id, currentPassword, newPassword);

  if (!success) {
    res.status(400).json({ error: "Current password is incorrect." });
    return;
  }

  // Invalidate all other sessions
  sqlite.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(user.id, req.cookies?.[USER_COOKIE_NAME]);

  res.json({ success: true, message: "Password changed successfully!" });
});

// Need to import sqlite for email routes
import { sqlite } from "@workspace/db";

export default router;