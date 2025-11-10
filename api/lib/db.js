// This file centralizes the Turso database connection.
import { createClient } from "@libsql/client";
import "dotenv/config"; // Make sure .env variables are loaded

// Vercel Edge functions don't support process.env.
// We must check for VERCEL_ENV and use the new Vercel-provided env() helper if available.
// For local, we still use process.env.
const isVercel = !!process.env.VERCEL_ENV;

const getEnv = (key) => {
  if (isVercel && typeof process.env[key] === 'undefined') {
    // This is a simplified check. In a real Vercel Edge env,
    // you might need to use the `env` helper if `process.env` isn't populated.
    // For now, Vercel populates process.env in Serverless Functions.
    return process.env[key];
  }
  return process.env[key];
}

const tursoConfig = {
  url: getEnv("TURSO_DATABASE_URL"),
  authToken: getEnv("TURSO_AUTH_TOKEN"),
};

if (!tursoConfig.url || !tursoConfig.authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
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