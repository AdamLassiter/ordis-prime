import { timingSafeEqual } from "node:crypto";
import type { openSqliteDatabase } from "@ordis-prime/db";
import { APIError, betterAuth } from "better-auth";
import { verifyPassword } from "better-auth/crypto";

type SqliteDatabase = ReturnType<typeof openSqliteDatabase>;

export interface AuthConfiguration {
  baseURL: string;
  secret: string;
  allowRegistration?: boolean;
  setupToken?: string;
}

const fields = {
  user: { name: "username", emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
  session: { userId: "user_id", expiresAt: "expires_at", ipAddress: "ip_address", userAgent: "user_agent", createdAt: "created_at", updatedAt: "updated_at" },
  account: { userId: "user_id", accountId: "account_id", providerId: "provider_id", accessToken: "access_token", refreshToken: "refresh_token", idToken: "id_token", accessTokenExpiresAt: "access_token_expires_at", refreshTokenExpiresAt: "refresh_token_expires_at", createdAt: "created_at", updatedAt: "updated_at" },
  verification: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
} as const;

export function createAuth(database: SqliteDatabase, configuration: AuthConfiguration) {
  return betterAuth({
    appName: "Ordis Prime",
    baseURL: configuration.baseURL,
    secret: configuration.secret,
    database,
    emailAndPassword: { enabled: true },
    user: {
      modelName: "users",
      fields: fields.user,
      additionalFields: {
        role: { type: "string", required: true, defaultValue: "player", input: false },
      },
    },
    session: { modelName: "sessions", fields: fields.session },
    account: { modelName: "accounts", fields: fields.account },
    verification: { modelName: "verifications", fields: fields.verification },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const userCount = database.prepare("select count(*) as count from users").get() as { count: number };
            if (userCount.count === 0 && tokensMatch(context?.getHeader("x-ordis-setup-token"), configuration.setupToken)) {
              return { data: { ...user, role: "admin" } };
            }
            if (configuration.allowRegistration) return { data: { ...user, role: "player" } };
            throw new APIError("FORBIDDEN", { message: userCount.count === 0 ? "A valid setup token is required" : "Registration is closed" });
          },
        },
      },
    },
    telemetry: { enabled: false },
  });
}

export async function verifyLocalPassword(database: SqliteDatabase, userId: string, password: string): Promise<boolean> {
  if (!password || password.length > 128) return false;
  const credential = database.prepare("select password from accounts where user_id = ? and provider_id = 'credential' limit 1")
    .get(userId) as { password: string | null } | undefined;
  if (!credential?.password) return false;
  return verifyPassword({ hash: credential.password, password });
}

function tokensMatch(received: string | null | undefined, expected: string | undefined): boolean {
  if (!received || !expected || expected.length < 24) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}
