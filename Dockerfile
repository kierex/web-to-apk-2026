FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    ANDROID_HOME=/opt/android-sdk \
    GRADLE_HOME=/opt/gradle \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    PATH=/opt/gradle/bin:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/android-sdk/build-tools/35.0.0:/usr/lib/jvm/java-17-openjdk-amd64/bin:$PATH \
    GRADLE_USER_HOME=/tmp/gradle \
    NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-17-jdk curl unzip ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p "${ANDROID_SDK_ROOT}/cmdline-tools" \
  && curl -fsSL --retry 4 -o /tmp/android-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
  && unzip -q /tmp/android-tools.zip -d /tmp/android-tools \
  && mv /tmp/android-tools/cmdline-tools "${ANDROID_SDK_ROOT}/cmdline-tools/latest" \
  && rm -rf /tmp/android-tools /tmp/android-tools.zip \
  && yes | sdkmanager --licenses >/dev/null \
  && sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" \
  && curl -fsSL --retry 4 -o /tmp/gradle.zip https://services.gradle.org/distributions/gradle-8.10.2-bin.zip \
  && unzip -q /tmp/gradle.zip -d /opt \
  && mv /opt/gradle-8.10.2 "${GRADLE_HOME}" \
  && rm -f /tmp/gradle.zip \
  && java -version \
  && gradle --version \
  && sdkmanager --version

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/html-to-apk-studio/package.json artifacts/html-to-apk-studio/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate \
  && pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm --filter @workspace/api-spec run codegen \
  && PORT=18644 BASE_PATH=/ pnpm --filter @workspace/html-to-apk-studio run build \
  && pnpm --filter @workspace/api-server run build

EXPOSE 5000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]