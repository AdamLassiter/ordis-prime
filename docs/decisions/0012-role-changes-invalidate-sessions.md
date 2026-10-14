# ADR 0012: Invalidate sessions after local role changes

Status: accepted

Administrative roles affect source operations, conflict review, and account
management. Allowing an existing session to retain a prior role would make the
effective authorization state depend on authentication-library caching details.

Role changes are therefore database transactions that verify the acting user is
currently an administrator, preserve at least one administrator, update the
target role, and delete every target session. The target signs in again to
receive the new authority. This also applies when an administrator changes
their own role.

The web action repeats the administrator check for a clear boundary failure,
but the database invariant is authoritative. Account deletion and password
recovery require separate lifecycle decisions.
