# ADR 0024: Require password reverification for account deletion

## Decision

Self-service account deletion requires the current local password in addition
to an authenticated session and the exact `DELETE` confirmation phrase. The web
authentication boundary reads the user's credential account and verifies its
hash with Better Auth's password verifier before calling the database deletion
operation.

The database package remains responsible for the transactional deletion,
share revocation and final-administrator guard. It does not receive or verify
plaintext credentials.

## Rationale

An unattended but authenticated browser session should not be sufficient to
perform an irreversible account deletion. Reusing the authentication library's
verifier keeps password-hash handling consistent with sign-in while preserving
the boundary between authentication concerns and application persistence.

## Consequences

- A missing or incorrect password produces the same generic rejection.
- Accounts without a local credential cannot use this deletion path. Ordis
  Prime currently creates only local email/password accounts.
- Password recovery remains unavailable, so a player who has lost their
  password cannot delete their account through self-service.
