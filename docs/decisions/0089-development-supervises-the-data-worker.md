# 0089: Development supervises the data worker

Status: accepted

## Context

Refresh actions enqueue durable leased jobs. Starting only the Next.js process
leaves those jobs correctly queued but gives a developer no consumer, which
looks like a broken queue. Production already runs web and worker as sibling
services.

## Decision

Make the root `pnpm dev` command start the web application and ingestion worker
in parallel. Retain `pnpm dev:web` and `pnpm data:worker` for intentional
single-process operation.

On the administrator provenance screen, infer an inactive worker only when at
least one queued job is more than 15 seconds overdue and no recent job has an
unexpired worker lease. Show the commands that restore processing. Do not add a
heartbeat table solely for this diagnostic.

Present one card per logical job kind and source. Choose a running run first,
then queued, failed, and succeeded runs, so the overview exposes work requiring
attention instead of duplicating a task for every retained execution. A
task-specific history view remains available from each card.

## Consequences

The default local workflow now matches the production process topology and
queued refreshes are consumed without a second remembered command. Developers
can still isolate either process.

The warning is intentionally a queue-health inference. With no due work it
cannot prove that a worker exists, and a crashed worker remains apparently live
until its last lease expires.

The overview is not a chronological audit. Operators deliberately enter a
single task's history when they need prior executions.
