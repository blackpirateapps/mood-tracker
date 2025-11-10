import { createClient } from "@libsql/client";

let cachedClient = null;

export function getDb() {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  }

  cachedClient = createClient({ url, authToken });
  return cachedClient;
}