# Authentication and account setup

Ordis Prime uses local email/password accounts and database-backed sessions.
Authentication records share the application SQLite database, while player
inventory and progress continue to reference the stable local user ID.

Registration is closed by default. The first account must be created through
the normal email sign-up endpoint with `ORDIS_SETUP_TOKEN` supplied in the
`x-ordis-setup-token` request header. A setup token shorter than 24 characters
is rejected. That first account becomes an administrator; a setup token cannot
create further accounts. Set `ORDIS_ALLOW_REGISTRATION=true` to allow later
sign-ups, which always receive the player role.

`ORDIS_AUTH_SECRET` is required to start the web application and should be a
random value of at least 32 characters. `ORDIS_BASE_URL` defaults to
`http://localhost:3000` and must be the public origin in deployments reached at
another URL.

Next.js evaluates server modules during its production build, so automated
builds provide a clearly named, non-runtime placeholder. The container runtime
does not inherit it: deployment still fails closed unless the operator supplies
`ORDIS_AUTH_SECRET`.

The raw API is wired at `/api/auth/*`. `/setup` collects the operator token only
for the first account, and `/sign-in` establishes returning sessions. The
administrator-only `/admin/accounts` page lists local users and can promote or
demote roles. The database rejects non-admin actors and refuses to demote the
final administrator. A role change deletes the target account's sessions so it
takes effect at the next sign-in.

Player-state mutations scope their database writes by authenticated user ID.
Password recovery and account deletion remain gaps.
