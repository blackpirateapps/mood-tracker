// This file centralizes the Turso database connection.
import { createClient } from "@libsql/client";

const tursoConfig = {
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
};

if (!tursoConfig.url || !tursoConfig.authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN from environment variables.");
}

export function getTursoClient() {
  if (!tursoConfig.url) {
    throw new Error("TURSO_DATABASE_URL is not set.");
  }

  if (!tursoConfig.authToken) {
    throw new Error("TURSO_AUTH_TOKEN is not set.");
  }

  // Create and return a new client
  return createClient(tursoConfig);
}