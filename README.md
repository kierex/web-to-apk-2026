# HTML to APK Studio

Turn HTML, CSS, and JavaScript into a real installable Android APK from the browser.

## Deploy on Railway

Create a Railway service from this repository. `railway.json` selects the Dockerfile and `/api/healthz` health check automatically. No database, Clerk account, Java install, Gradle install, Android SDK install, or frontend environment variables are required.

The container installs Java 17, Gradle 8.10.2, Android platform 35, and Android build tools 35.0.0 during image creation. The deployed service serves the studio and `/api` from the same URL and compiles a real installable debug APK for every build.

SMTP is optional and is only needed for support-email delivery. You can enter the SMTP username and app password in **Admin → Configuration** after deployment. The host defaults to Gmail and the port defaults to 587, so those are the only two SMTP values normally needed:

```text
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_APP_PASSWORD=your-app-password
```

The built-in admin console is at `/admin`. Admin credentials are automatic and require no environment variables: `admin` / `change-me-now`.

## Local run

```bash
pnpm install
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/html-to-apk-studio run build
PORT=5000 NODE_ENV=production pnpm --filter @workspace/api-server run build
PORT=5000 NODE_ENV=production pnpm --filter @workspace/api-server run start
```

Open `http://localhost:5000`.