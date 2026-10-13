import { createAuth } from "./auth-factory";
import { getDatabase } from "./database";

const secret = process.env.ORDIS_AUTH_SECRET;
if (!secret) throw new Error("ORDIS_AUTH_SECRET must be set");

export const auth = createAuth(getDatabase(), {
  baseURL: process.env.ORDIS_BASE_URL ?? "http://localhost:3000",
  secret,
  setupToken: process.env.ORDIS_SETUP_TOKEN,
  allowRegistration: process.env.ORDIS_ALLOW_REGISTRATION === "true",
});
