import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

export async function fetchWebsiteContent(url: string): Promise<WebsiteFetchResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const finalUrl = response.url;

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : new URL(finalUrl).hostname;

    // Extract favicon
    let favicon: string | undefined;
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i);
    if (faviconMatch) {
      favicon = new URL(faviconMatch[1], finalUrl).href;
    } else {
      favicon = new URL("/favicon.ico", finalUrl).href;
    }

    // Extract inline CSS and JS
    let css = "";
    let javascript = "";
    
    // Get inline styles
    const styleMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    for (const match of styleMatches) {
      css += match[1] + "\n";
    }
    
    // Get inline scripts
    const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of scriptMatches) {
      if (!match[0].includes("src=")) {
        javascript += match[1] + "\n";
      }
    }

    // Clean HTML - remove head, keep body content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let cleanHtml = bodyMatch ? bodyMatch[1] : html;

    // Convert relative URLs to absolute
    cleanHtml = cleanHtml.replace(/(src|href)=["']([^"']+)["']/gi, (match, attr, value) => {
      try {
        const absoluteUrl = new URL(value, finalUrl).href;
        return `${attr}="${absoluteUrl}"`;
      } catch {
        return match;
      }
    });

    return {
      html: cleanHtml,
      css,
      javascript,
      title,
      favicon,
    };
  } catch (error) {
    return {
      html: "",
      css: "",
      javascript: "",
      title: "",
      error: error instanceof Error ? error.message : "Failed to fetch website",
    };
  }
}

export type ApkBuildInput = {
  name: string;
  packageName: string;
  themeColor: string;
  orientation: "portrait" | "landscape";
  html: string;
  css: string;
  javascript: string;
  iconDataUrl?: string | null;
  splashDataUrl?: string | null;
  splashBackgroundColor?: string;
  splashText?: string;
  splashDelayMs?: number;
  websiteUrl?: string;
  buildMode?: "html" | "website";
};

export type WebsiteFetchResult = {
  html: string;
  css: string;
  javascript: string;
  title: string;
  favicon?: string;
  error?: string;
};

export type ApkBuildStatus = "queued" | "building" | "ready" | "failed";

export type ApkBuildRecord = {
  id: string;
  status: ApkBuildStatus;
  message: string;
  fileName: string | null;
  downloadUrl: string | null;
  filePath: string | null;
};

const buildRoot = path.join(os.tmpdir(), "html-to-apk-builds");
const sdkRoot = path.join(os.tmpdir(), "html-to-apk-android-sdk");
const sdkToolsZip = path.join(os.tmpdir(), "commandlinetools-linux.zip");
const sdkToolsUrl =
  "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip";

let sdkPromise: Promise<string> | null = null;

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function gradleString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

function safeFileName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "web-app"
  );
}

function packagePath(packageName: string) {
  return packageName.split(".").join("/");
}

function dataUrlToFile(dataUrl: string | null | undefined) {
  if (!dataUrl) return null;
  const match =
    /^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) return null;
  const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  return {
    extension,
    bytes: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
  };
}

function buildDocument(input: ApkBuildInput) {
  const splashImage = input.splashDataUrl || input.iconDataUrl;
  const splashBackgroundColor = input.splashBackgroundColor || input.themeColor;
  const splashText = input.splashText || input.name;
  const splashMarkup = `
<div id="apk-splash" role="status" aria-label="Loading ${xmlEscape(input.name)}">
  ${splashImage ? `<img src="${splashImage}" alt="" />` : ""}
  <strong>${xmlEscape(splashText)}</strong>
</div>`;
  const splashStyles = `
#apk-splash {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 18px;
  padding: 32px;
  background: ${splashBackgroundColor};
  color: #ffffff;
  font-family: system-ui, sans-serif;
  text-align: center;
  transition: opacity 220ms ease, visibility 220ms ease;
}
#apk-splash img {
  width: min(42vw, 160px);
  height: min(42vw, 160px);
  object-fit: cover;
  border-radius: 28px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, .22);
}
#apk-splash strong { max-width: 28ch; font-size: 20px; letter-spacing: .01em; }
#apk-splash.is-hidden { opacity: 0; visibility: hidden; pointer-events: none; }
`;
  const splashScript = `
(() => {
  const splash = document.getElementById("apk-splash");
  const delay = ${Math.max(0, Math.min(300000, Math.round(input.splashDelayMs || 0)))};
  if (!splash || delay <= 0) {
    splash?.classList.add("is-hidden");
    return;
  }
  window.setTimeout(() => splash.classList.add("is-hidden"), delay);
})();
`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="${input.themeColor}">
  <title>${xmlEscape(input.name)}</title>
  <style>${splashStyles}${input.css.replaceAll("</style", "<\\\\/style")}</style>
</head>
<body>${splashMarkup}${input.html}<script>${input.javascript.replaceAll("</script", "<\\\\/script")}<\/script><script>${splashScript}<\/script></body>
</html>`;
}

async function command(
  executable: string,
  args: string[],
  options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {},
) {
  try {
    return await execFileAsync(executable, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 240_000,
      maxBuffer: 12 * 1024 * 1024,
      env: {
        ...process.env,
        ...options.env,
        CI: "true",
        JAVA_TOOL_OPTIONS: `${process.env.JAVA_TOOL_OPTIONS ?? ""} -Dfile.encoding=UTF-8`.trim(),
      },
    });
  } catch (error) {
    const details = error as Error & { stderr?: string; stdout?: string };
    const output = [details.stderr, details.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      output ? `${details.message}\n${output.slice(-6000)}` : details.message,
    );
  }
}

type JavaEnvironment = {
  JAVA_HOME: string;
  PATH: string;
};

async function ensureJavaEnvironment(): Promise<JavaEnvironment> {
  const configuredHome = process.env.JAVA_HOME?.trim();
  const javaCommand = configuredHome
    ? path.join(configuredHome, "bin", "java")
    : "java";

  let javaPath = javaCommand;
  try {
    if (configuredHome) {
      await access(javaCommand);
    } else {
      const result = await command("bash", ["-lc", "command -v java"], {
        timeout: 10_000,
      });
      javaPath = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "";
      if (!javaPath) throw new Error("java was not found in PATH");
    }

    const resolvedJavaPath = await realpath(javaPath);
    const javaHome = configuredHome || path.dirname(path.dirname(resolvedJavaPath));
    await access(path.join(javaHome, "bin", "java"));
    return {
      JAVA_HOME: javaHome,
      PATH: `${path.join(javaHome, "bin")}:${process.env.PATH ?? ""}`,
    };
  } catch {
    throw new Error(
      "Java is required to build APKs, but no usable Java runtime was found. Install Java and restart the API server.",
    );
  }
}

async function extractZipArchive(archivePath: string, destination: string) {
  const archive = await readFile(archivePath);
  const endOfCentralDirectory = 0x06054b50;
  const centralDirectoryHeader = 0x02014b50;
  const localFileHeader = 0x04034b50;
  const minimumEndRecordSize = 22;
  const maximumCommentSize = 0xffff;
  const searchStart = Math.max(0, archive.length - minimumEndRecordSize - maximumCommentSize);

  let endOffset = -1;
  for (let offset = archive.length - minimumEndRecordSize; offset >= searchStart; offset -= 1) {
    if (archive.readUInt32LE(offset) === endOfCentralDirectory) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Android command-line tools archive is not a valid ZIP file.");

  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralDirectorySize = archive.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = archive.readUInt32LE(endOffset + 16);
  if (
    centralDirectoryOffset + centralDirectorySize > archive.length ||
    entryCount === 0
  ) {
    throw new Error("Android command-line tools archive has an invalid ZIP directory.");
  }

  const destinationRoot = path.resolve(destination);
  await mkdir(destinationRoot, { recursive: true });
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > archive.length ||
      archive.readUInt32LE(offset) !== centralDirectoryHeader
    ) {
      throw new Error("Android command-line tools archive has a corrupt ZIP entry.");
    }

    const flags = archive.readUInt16LE(offset + 8);
    const versionMadeBy = archive.readUInt16LE(offset + 4);
    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    const fileNameBytes = archive.subarray(offset + 46, offset + 46 + fileNameLength);
    const fileName = fileNameBytes.toString((flags & 0x800) !== 0 ? "utf8" : "latin1");
    offset += 46 + fileNameLength + extraLength + commentLength;

    const normalizedName = path.posix.normalize(fileName.replaceAll("\\", "/"));
    if (
      !normalizedName ||
      normalizedName === "." ||
      normalizedName.startsWith("/") ||
      normalizedName === ".." ||
      normalizedName.startsWith("../")
    ) {
      throw new Error("Android command-line tools archive contains an unsafe file path.");
    }

    const outputPath = path.resolve(destinationRoot, ...normalizedName.split("/"));
    if (outputPath !== destinationRoot && !outputPath.startsWith(`${destinationRoot}${path.sep}`)) {
      throw new Error("Android command-line tools archive contains an unsafe file path.");
    }

    const isDirectory = normalizedName.endsWith("/");
    if (isDirectory) {
      await mkdir(outputPath, { recursive: true });
      continue;
    }

    if (
      localOffset + 30 > archive.length ||
      archive.readUInt32LE(localOffset) !== localFileHeader
    ) {
      throw new Error("Android command-line tools archive has an invalid local file header.");
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) {
      throw new Error("Android command-line tools archive contains truncated file data.");
    }

    const compressedData = archive.subarray(dataStart, dataEnd);
    let fileData: Buffer;
    if (compressionMethod === 0) {
      fileData = compressedData;
    } else if (compressionMethod === 8) {
      fileData = inflateRawSync(compressedData);
    } else {
      throw new Error(`Unsupported ZIP compression method: ${compressionMethod}.`);
    }
    if (fileData.length !== uncompressedSize) {
      throw new Error("Android command-line tools archive contains a file with invalid size.");
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, fileData);
    const unixMode = (versionMadeBy >> 8) === 3 ? (externalAttributes >>> 16) & 0o777 : 0;
    await chmod(outputPath, unixMode || (normalizedName.includes("/bin/") ? 0o755 : 0o644));
  }
}

async function ensureAndroidSdk(javaEnv: JavaEnvironment) {
  const configuredSdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  const candidate = configuredSdk || sdkRoot;
  const requiredJar = path.join(candidate, "platforms", "android-35", "android.jar");
  const requiredAapt = path.join(candidate, "build-tools", "35.0.0", "aapt2");

  try {
    await readFile(requiredJar);
    await readFile(requiredAapt);
    return candidate;
  } catch {
    // The SDK is bootstrapped only when the first APK is requested.
  }

  if (!sdkPromise) {
    sdkPromise = (async () => {
      await mkdir(sdkRoot, { recursive: true });
      const toolsDir = path.join(sdkRoot, "cmdline-tools", "latest");
      const sdkmanager = path.join(toolsDir, "bin", "sdkmanager");

      try {
        await readFile(sdkmanager);
      } catch {
        const archiveDir = path.join(os.tmpdir(), "android-commandline-tools");
        await rm(archiveDir, { recursive: true, force: true });
        await mkdir(archiveDir, { recursive: true });
        await command("curl", ["-fsSL", "--retry", "3", "-o", sdkToolsZip, sdkToolsUrl], {
          timeout: 300_000,
        });
        await extractZipArchive(sdkToolsZip, archiveDir);
        await rm(toolsDir, { recursive: true, force: true });
        await mkdir(path.dirname(toolsDir), { recursive: true });
        await rename(path.join(archiveDir, "cmdline-tools"), toolsDir);
      }

      await command("bash", ["-lc", `yes | "${sdkmanager}" --sdk_root="${sdkRoot}" --licenses >/dev/null 2>&1 || true`], {
        timeout: 180_000,
        env: javaEnv,
      });
      await command(
        sdkmanager,
        ["--sdk_root=" + sdkRoot, "platform-tools", "platforms;android-35", "build-tools;35.0.0"],
        { timeout: 600_000, env: javaEnv },
      );
      return sdkRoot;
    })().catch((error) => {
      sdkPromise = null;
      throw error;
    });
  }

  return sdkPromise;
}

async function writeAndroidProject(projectDir: string, input: ApkBuildInput, sdk: string) {
  const appDir = path.join(projectDir, "app");
  const packageDir = path.join(appDir, "src", "main", "java", packagePath(input.packageName));
  const valuesDir = path.join(appDir, "src", "main", "res", "values");
  const drawableDir = path.join(appDir, "src", "main", "res", "drawable");
  const assetsDir = path.join(appDir, "src", "main", "assets");

  await Promise.all([
    mkdir(packageDir, { recursive: true }),
    mkdir(valuesDir, { recursive: true }),
    mkdir(drawableDir, { recursive: true }),
    mkdir(assetsDir, { recursive: true }),
  ]);

  const icon = dataUrlToFile(input.iconDataUrl);
  const iconName = icon ? `app_icon.${icon.extension}` : null;
  const escapedName = xmlEscape(input.name);
  const escapedGradleName = gradleString(input.name);

  const files: Array<[string, string]> = [
    [
      "settings.gradle",
      `pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "${escapedGradleName}"
include(":app")
`,
    ],
    [
      "build.gradle",
      `plugins {
    id "com.android.application" version "8.6.1" apply false
}
`,
    ],
    [
      "gradle.properties",
      `org.gradle.jvmargs=-Xmx1536m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
`,
    ],
    ["local.properties", `sdk.dir=${sdk.replaceAll("\\", "\\\\")}\n`],
    [
      "app/build.gradle",
      `plugins { id "com.android.application" }

android {
    namespace "${input.packageName}"
    compileSdk 35

    defaultConfig {
        applicationId "${input.packageName}"
        minSdk 23
        targetSdk 35
        versionCode 1
        versionName "1.0"
    }
}
`,
    ],
    [
      "app/src/main/AndroidManifest.xml",
      `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:theme="@style/AppTheme"
        android:label="@string/app_name"
        ${iconName ? `android:icon="@drawable/app_icon"` : ""}
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true">
        <activity
            android:name=".MainActivity"
            android:screenOrientation="${input.orientation}"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
    ],
    [
      `app/src/main/java/${packagePath(input.packageName)}/MainActivity.java`,
      `package ${input.packageName};

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.util.Log;

public class MainActivity extends Activity {
    private static final String TAG = "WebzAPK";
    private WebView webView;
    private boolean isWebsiteMode = ${input.buildMode === "website" ? "true" : "false"};
    private String websiteUrl = "${input.websiteUrl || ""}";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        
        // Enable JavaScript and modern web features
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAppCacheEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.TEXT_AUTOSIZING);
        
        // Set user agent
        settings.setUserAgentString(settings.getUserAgentString() + " WebzAPK/1.0");
        
        // WebViewClient for handling navigation
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Handle external links - open in browser
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    if (isWebsiteMode && url.startsWith(websiteUrl)) {
                        // Stay in app for same-origin navigation
                        return false;
                    }
                    // Open external links in browser
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        return false;
                    }
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView error: " + description + " (" + failingUrl + ")");
                if (isWebsiteMode) {
                    // Show error page but allow retry
                    view.loadUrl("file:///android_asset/error.html");
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Hide splash screen when page loads
                view.loadUrl("javascript:(function() { var splash = document.getElementById('apk-splash'); if (splash) splash.classList.add('is-hidden'); })()");
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                super.onProgressChanged(view, newProgress);
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, "Console: " + consoleMessage.message() + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
                return true;
            }
        });

        if (isWebsiteMode && websiteUrl) {
            // Load website URL
            webView.loadUrl(websiteUrl);
        } else {
            // Load local HTML file
            webView.loadUrl("file:///android_asset/index.html");
        }
        
        setContentView(webView);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
`,
    ],
    [
      "app/src/main/res/values/strings.xml",
      `<resources><string name="app_name">${escapedName}</string></resources>\n`,
    ],
    [
      "app/src/main/res/values/colors.xml",
      `<resources><color name="theme_color">${input.themeColor}</color></resources>\n`,
    ],
    [
      "app/src/main/res/values/styles.xml",
      `<resources>
    <style name="AppTheme" parent="@android:style/Theme.Material.Light.NoActionBar">
        <item name="android:fontFamily">sans</item>
        <item name="android:colorAccent">@color/theme_color</item>
        <item name="android:navigationBarColor">@color/theme_color</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:statusBarColor">@android:color/white</item>
    </style>
</resources>
`,
    ],
    ["app/src/main/assets/index.html", buildDocument(input)],
    [
      "app/src/main/assets/error.html",
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connection Error</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 40px 20px; text-align: center; background: #f5f5f5; }
    .container { max-width: 400px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { color: #1a1a1a; margin-bottom: 12px; font-size: 24px; }
    p { color: #666; margin-bottom: 24px; line-height: 1.5; }
    button { background: #3b82f6; color: white; border: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
    button:active { background: #2563eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📡</div>
    <h1>Unable to Load Website</h1>
    <p>We couldn't connect to the website. Please check your internet connection and try again.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>`,
    ],
  ];

  await Promise.all(
    files.map(([file, content]) => writeFile(path.join(projectDir, file), content, "utf8")),
  );
  if (icon) {
    await writeFile(path.join(drawableDir, iconName!), icon.bytes);
  } else {
    await writeFile(
      path.join(drawableDir, "app_icon.xml"),
      `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="96dp" android:height="96dp" android:viewportWidth="96" android:viewportHeight="96"><path android:fillColor="${input.themeColor}" android:pathData="M0,0h96v96h-96z"/><path android:fillColor="#ffffff" android:pathData="M26,26h44v44h-44z"/></vector>`,
      "utf8",
    );
  }
}

export async function buildApk(record: ApkBuildRecord, input: ApkBuildInput) {
  const jobDir = path.join(buildRoot, record.id);
  const projectDir = path.join(jobDir, "project");
  try {
    record.status = "building";
    record.message = "Preparing the Android build environment…";
    await mkdir(jobDir, { recursive: true });
    const javaEnv = await ensureJavaEnvironment();
    const sdk = await ensureAndroidSdk(javaEnv);
    record.message = "Compiling your APK…";
    await writeAndroidProject(projectDir, input, sdk);
    await command("gradle", ["--no-daemon", "--stacktrace", "--console=plain", "assembleDebug"], {
      cwd: projectDir,
      timeout: 600_000,
      env: javaEnv,
    });
    const builtApk = path.join(
      projectDir,
      "app",
      "build",
      "outputs",
      "apk",
      "debug",
      "app-debug.apk",
    );
    const fileName = `${safeFileName(input.name)}-debug.apk`;
    const finalPath = path.join(jobDir, fileName);
    await rename(builtApk, finalPath);
    record.status = "ready";
    record.fileName = fileName;
    record.filePath = finalPath;
    record.downloadUrl = `/api/apk/build/${record.id}/download`;
    record.message = "APK built successfully. It is ready to install.";
    logger.info({ buildId: record.id, fileName }, "APK build completed");
  } catch (error) {
    record.status = "failed";
    record.message =
      error instanceof Error
        ? `Build failed: ${error.message.slice(0, 4000)}`
        : "Build failed. Please check your project and try again.";
    logger.error({ buildId: record.id, err: error }, "APK build failed");
  } finally {
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function createApkBuild(_input: ApkBuildInput) {
  await mkdir(buildRoot, { recursive: true });
  return {
    id: randomUUID(),
    status: "queued" as const,
    message: "Build queued. Your APK will appear here when ready.",
    fileName: null,
    downloadUrl: null,
    filePath: null,
  } satisfies ApkBuildRecord;
}