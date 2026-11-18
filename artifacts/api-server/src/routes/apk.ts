import { Router, type IRouter } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { sqlite } from "@workspace/db";
import { requireUser, type AppRequest } from "../lib/auth";
import { buildApk, fetchWebsiteContent, type ApkBuildInput } from "../lib/apk-builder";
import { getConfig } from "../lib/config";
import { sendBuildCompletedEmail, sendBuildFailedEmail } from "../lib/mailer";

const router: IRouter = Router();

const createBuildSchema = z.object({
  name: z.string().min(1).max(80),
  packageName: z.string().min(3).max(128),
  themeColor: z.string().max(20).optional().default("#0ea5e9"),
  orientation: z.enum(["portrait", "landscape"]).optional().default("portrait"),
  buildMode: z.enum(["html", "website"]).optional().default("html"),
  websiteUrl: z.string().url().max(2048).optional().or(z.literal("")),
  html: z.string().max(2_000_000).optional().default(""),
  css: z.string().max(2_000_000).optional().default(""),
  javascript: z.string().max(2_000_000).optional().default(""),
  iconDataUrl: z.string().max(4_000_000).optional().or(z.null()),
  splashDataUrl: z.string().max(4_000_000).optional().or(z.null()),
  splashBackgroundColor: z.string().max(20).optional(),
  splashText: z.string().max(120).optional(),
  splashDelayMs: z.number().int().min(0).max(300_000).optional().default(1200),
});

function isPremiumActive(user: any): boolean {
  return user.isAdmin || (user.premiumExpiresAt instanceof Date && user.premiumExpiresAt > new Date());
}

function buildsUsedToday(userId: string): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const row = sqlite
    .prepare("SELECT COUNT(*) AS count FROM apk_builds WHERE user_id = ? AND created_at >= ?")
    .get(userId, Math.floor(startOfDay.getTime() / 1000)) as { count: number };
  return row.count;
}

function activeBuildCount(userId: string): number {
  const row = sqlite
    .prepare("SELECT COUNT(*) AS count FROM apk_builds WHERE user_id = ? AND status IN ('queued','building')")
    .get(userId) as { count: number };
  return row.count;
}

router.post("/apk/build", requireUser, async (req: AppRequest, res) => {
  const parsed = createBuildSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    res.status(400).json({ error: "Please check the app details and source code before building." });
    return;
  }

  const config = getConfig();
  if (config.features.maintenanceMode) {
    res.status(503).json({ error: "Webz is under maintenance right now. Please try again later." });
    return;
  }

  const user = req.user;
  const premium = isPremiumActive(user);
  const limit = premium ? config.limits.premiumDailyBuilds : config.limits.freeDailyBuilds;
  const used = buildsUsedToday(user.id);

  if (used >= limit) {
    res.status(402).json({
      error: premium
        ? "You have reached today's build limit. Please try again tomorrow."
        : `You have used all ${limit} free builds for today. Contact the developer to purchase premium and get a key.`,
      limitReached: true,
      freeLimit: limit,
      usedToday: used,
      contactUrl: config.contactDeveloperUrl,
      upgradeUrl: "/premium",
    });
    return;
  }

  const maxConcurrent = premium ? 3 : 1;
  if (activeBuildCount(user.id) >= maxConcurrent) {
    res.status(429).json({
      error: premium
        ? "You already have 3 builds in progress. Please wait for one to finish."
        : "You already have a build in progress. Please wait for it to finish before starting another.",
    });
    return;
  }

  // Validate package name
  const packageName = parsed.data.packageName;
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName)) {
    res.status(400).json({ error: "Package name must look like com.example.app (lowercase letters, digits, dots, underscores)." });
    return;
  }

  let input: ApkBuildInput;
  const buildMode = parsed.data.buildMode || "html";

  if (buildMode === "website") {
    if (!parsed.data.websiteUrl) {
      res.status(400).json({ error: "Paste the website URL to convert it into an APK." });
      return;
    }
    const fetchResult = await fetchWebsiteContent(parsed.data.websiteUrl);
    if (fetchResult.error) {
      res.status(400).json({ error: `Could not fetch the website: ${fetchResult.error}` });
      return;
    }
    input = {
      name: parsed.data.name,
      packageName,
      themeColor: parsed.data.themeColor,
      orientation: parsed.data.orientation,
      html: fetchResult.html,
      css: fetchResult.css,
      javascript: fetchResult.javascript,
      iconDataUrl: parsed.data.iconDataUrl ?? null,
      splashDataUrl: parsed.data.splashDataUrl ?? null,
      splashBackgroundColor: parsed.data.splashBackgroundColor,
      splashText: parsed.data.splashText,
      splashDelayMs: parsed.data.splashDelayMs,
      websiteUrl: parsed.data.websiteUrl,
      buildMode: "website",
    };
  } else {
    if (!parsed.data.html.trim()) {
      res.status(400).json({ error: "Add your HTML content (or upload a ZIP / paste a website URL) before building." });
      return;
    }
    input = {
      name: parsed.data.name,
      packageName,
      themeColor: parsed.data.themeColor,
      orientation: parsed.data.orientation,
      html: parsed.data.html,
      css: parsed.data.css,
      javascript: parsed.data.javascript,
      iconDataUrl: parsed.data.iconDataUrl ?? null,
      splashDataUrl: parsed.data.splashDataUrl ?? null,
      splashBackgroundColor: parsed.data.splashBackgroundColor,
      splashText: parsed.data.splashText,
      splashDelayMs: parsed.data.splashDelayMs,
      buildMode: "html",
    };
  }

  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO apk_builds (id, user_id, name, package_name, source_type, source_url, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`
    )
    .run(id, user.id, parsed.data.name, packageName, buildMode === "website" ? "url" : "upload", buildMode === "website" ? parsed.data.websiteUrl : null, now, now);

  // Kick off the build in the background
  const record = {
    id,
    status: "queued" as const,
    message: "Build queued. Your APK will appear here when ready.",
    fileName: null,
    downloadUrl: null,
    filePath: null,
  };

  void (async () => {
    const startedAt = Date.now();
    try {
      await buildApk(record, input);
      const duration = Date.now() - startedAt;
      let apkSize: number | null = null;
      if (record.status === "ready" && record.filePath) {
        try {
          const { statSync } = await import("node:fs");
          apkSize = statSync(record.filePath).size;
        } catch {
          apkSize = null;
        }
      }
      sqlite
        .prepare(
          `UPDATE apk_builds
           SET status = ?, progress = ?, log_output = ?, apk_path = ?, apk_size = ?, error_message = ?, build_duration_ms = ?, updated_at = ?, completed_at = ?
           WHERE id = ?`
        )
        .run(
          record.status,
          record.status === "ready" ? 100 : 0,
          record.message,
          record.filePath,
          apkSize,
          record.status === "failed" ? record.message : null,
          duration,
          Math.floor(Date.now() / 1000),
          record.status === "ready" || record.status === "failed" ? Math.floor(Date.now() / 1000) : null,
          id,
        );

      // Notify the user by email
      if (record.status === "ready") {
        void sendBuildCompletedEmail(user.email, user.name, parsed.data.name, `/api/apk/build/${id}/download`);
      } else if (record.status === "failed") {
        void sendBuildFailedEmail(user.email, user.name, parsed.data.name, record.message);
      }
    } catch (error) {
      sqlite
        .prepare("UPDATE apk_builds SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?")
        .run(error instanceof Error ? error.message.slice(0, 4000) : "Build crashed", Math.floor(Date.now() / 1000), id);
    }
  })();

  res.status(202).json({ id, status: "queued", message: "Build queued. Your APK will appear here when ready." });
});

router.get("/apk/build/:id", requireUser, async (req: AppRequest, res) => {
  const build = sqlite
    .prepare("SELECT * FROM apk_builds WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId) as any;
  if (!build) {
    res.status(404).json({ error: "Build not found." });
    return;
  }
  res.json({
    id: build.id,
    name: build.name,
    status: build.status,
    progress: build.progress,
    message: build.log_output || "Build in progress…",
    fileName: build.status === "ready" ? `${build.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "web-app"}-debug.apk` : null,
    downloadUrl: build.status === "ready" ? `/api/apk/build/${build.id}/download` : null,
    errorMessage: build.error_message,
    createdAt: build.created_at * 1000,
    buildDurationMs: build.build_duration_ms,
  });
});

router.get("/apk/build/:id/download", requireUser, async (req: AppRequest, res) => {
  const build = sqlite
    .prepare("SELECT * FROM apk_builds WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId) as any;
  if (!build || build.status !== "ready" || !build.apk_path) {
    res.status(404).json({ error: "This APK is not ready to download yet." });
    return;
  }
  const fileName = `${build.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "web-app"}-debug.apk`;
  res.download(build.apk_path, fileName, { headers: { "Content-Type": "application/vnd.android.package-archive" } });
});

export default router;
