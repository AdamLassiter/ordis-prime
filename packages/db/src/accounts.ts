import type Database from "better-sqlite3";

export interface LocalAccountSummary {
  id: string;
  username: string;
  email: string;
  role: "admin" | "player";
  createdAt: number;
  activeSessions: number;
}

export function listLocalAccounts(sqlite: Database.Database): LocalAccountSummary[] {
  return sqlite.prepare(`
    select user.id, user.username, user.email, user.role, user.created_at as createdAt,
      count(session.id) as activeSessions
    from users user left join sessions session on session.user_id = user.id and session.expires_at > ?
    group by user.id
    order by case user.role when 'admin' then 0 else 1 end, user.username collate nocase, user.email collate nocase
  `).all(Date.now()) as LocalAccountSummary[];
}

export function setLocalAccountRole(
  sqlite: Database.Database,
  input: { actorUserId: string; targetUserId: string; role: "admin" | "player" },
): void {
  if (input.role !== "admin" && input.role !== "player") throw new Error("Account role is invalid");
  sqlite.transaction(() => {
    const actor = sqlite.prepare("select role from users where id = ?").get(input.actorUserId) as { role: string } | undefined;
    if (actor?.role !== "admin") throw new Error("Administrator access required");
    const target = sqlite.prepare("select role from users where id = ?").get(input.targetUserId) as { role: "admin" | "player" } | undefined;
    if (!target) throw new Error("Account not found");
    if (target.role === input.role) return;
    if (target.role === "admin" && input.role === "player") {
      const admins = sqlite.prepare("select count(*) as count from users where role = 'admin'").get() as { count: number };
      if (admins.count <= 1) throw new Error("The final administrator cannot be demoted");
    }
    sqlite.prepare("update users set role = ?, updated_at = ? where id = ?").run(input.role, Date.now(), input.targetUserId);
    sqlite.prepare("delete from sessions where user_id = ?").run(input.targetUserId);
  }).immediate();
}
