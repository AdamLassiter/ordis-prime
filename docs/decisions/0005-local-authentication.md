# ADR 0005: Keep authentication local and roles server-owned

Status: accepted

Ordis Prime uses local email/password accounts and database-backed sessions in
the same SQLite database as player state. This keeps a self-hosted installation
independent of an external identity provider and lets exports remain an escape
hatch rather than an account prerequisite.

Registration is closed unless the operator explicitly enables it. A long-lived
application secret protects sessions, while a separate setup token may create
only the first user and assigns that user the administrator role. All later
public registrations are players; client input cannot set roles. Routes that
mutate player data must derive the owning user from a validated server session.
