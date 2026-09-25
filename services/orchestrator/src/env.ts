import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function loadRootEnv(importMetaUrl: string) {
  const here = dirname(fileURLToPath(importMetaUrl));
  const rootEnv = join(here, "..", "..", "..", ".env");
  if (!existsSync(rootEnv)) return;
  const text = readFileSync(rootEnv, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function requireAccessToken() {
  const token = process.env.SAM_ACCESS_TOKEN?.trim() ?? "";
  if (token.length < 16 || token.startsWith("replace-with")) {
    throw new Error(
      "Set SAM_ACCESS_TOKEN in .env to a random string of at least 16 characters.",
    );
  }
  return token;
}
