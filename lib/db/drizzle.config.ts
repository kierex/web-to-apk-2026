import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || path.join(__dirname, "../../../data/webz.db"),
  },
  migrations: {
    prefix: "timestamp",
  },
});