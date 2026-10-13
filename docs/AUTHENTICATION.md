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

The raw API is wired at `/api/auth/*`. A first-run setup screen, sign-in screen,
account administration, and authorization checks on player-state mutations are
still gaps; the setup header is an implementation interface until that UI is
available.
