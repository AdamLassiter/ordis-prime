"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type {
  AlecaFrameImportPreview,
  PlayerImportPairingStatus,
  PlayerImportDevice,
} from "@ordis-prime/db";

const providers = [
  {
    id: "alecaframe",
    label: "AlecaFrame",
    accept: ".dat,application/octet-stream",
  },
  {
    id: "warframe-api-helper",
    label: "Ordis Prime Updater",
    accept: "",
  },
] as const;

interface ApplyResult extends AlecaFrameImportPreview {
  applied: true;
  buildId?: string;
}

interface Pairing {
  id: string;
  status: PlayerImportPairingStatus;
  expiresAt: number;
  pairingCode?: string;
  result?: ApplyResult;
  error?: string;
}

export function PlayerDataImport() {
  const router = useRouter();
  const [provider, setProvider] =
    useState<(typeof providers)[number]["id"]>("alecaframe");
  const [snapshot, setSnapshot] = useState<File>();
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [includeInventory, setIncludeInventory] = useState(true);
  const [includeProgression, setIncludeProgression] = useState(true);
  const [createBuild, setCreateBuild] = useState(false);
  const [buildTitle, setBuildTitle] = useState("");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [preview, setPreview] = useState<AlecaFrameImportPreview>();
  const [result, setResult] = useState<ApplyResult>();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"preview" | "apply">();
  const [pairing, setPairing] = useState<Pairing>();
  const [pairingPending, setPairingPending] = useState(false);
  const [devices, setDevices] = useState<PlayerImportDevice[]>([]);

  const loadDevices = useCallback(async () => {
    const response = await fetch(
      "/api/account/import/warframe-api-helper/devices",
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const body = (await response.json()) as { devices: PlayerImportDevice[] };
    setDevices(body.devices);
  }, []);

  useEffect(() => {
    if (provider === "warframe-api-helper") void loadDevices();
  }, [provider, loadDevices]);

  useEffect(() => {
    if (!pairing || !["pending", "running"].includes(pairing.status)) return;
    let disposed = false;
    const poll = async () => {
      const response = await fetch(
        `/api/account/import/warframe-api-helper/pairings/${pairing.id}`,
        { cache: "no-store" },
      );
      if (!response.ok || disposed) return;
      const next = (await response.json()) as Pairing;
      if (disposed) return;
      setPairing((current) => ({
        ...current,
        ...next,
        ...(next.status === "pending" ? {} : { pairingCode: undefined }),
      }));
      if (next.status === "succeeded" && next.result) {
        setPreview(next.result);
        setResult(next.result);
        setMessage(
          `Imported ${next.result.inventory.changedItems} collection changes.`,
        );
        router.refresh();
        void loadDevices();
      } else if (next.status === "succeeded") {
        setMessage(
          "Updater device paired. It will synchronize when Warframe is next running.",
        );
        void loadDevices();
      } else if (next.status === "failed" || next.status === "cancelled") {
        setMessage(next.error ?? "Updater pairing ended without an import.");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [pairing?.id, pairing?.status, router, loadDevices]);

  async function revokeDevice(id: string) {
    const response = await fetch(
      `/api/account/import/warframe-api-helper/devices/${id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setMessage("The updater device could not be revoked.");
      return;
    }
    await loadDevices();
  }

  function invalidate() {
    setPreview(undefined);
    setResult(undefined);
    setMessage("");
  }

  async function startPairing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPairingPending(true);
    invalidate();
    const response = await fetch(
      "/api/account/import/warframe-api-helper/pairings",
      { method: "POST" },
    );
    const body = (await response.json().catch(() => ({}))) as
      Pairing | { message?: string };
    if (!response.ok) {
      setMessage(
        "message" in body && body.message
          ? body.message
          : "Could not create an updater pairing.",
      );
    } else {
      setPairing(body as Pairing);
    }
    setPairingPending(false);
  }

  async function cancelPairing() {
    if (!pairing) return;
    await fetch(
      `/api/account/import/warframe-api-helper/pairings/${pairing.id}`,
      { method: "DELETE" },
    );
    setPairing({ ...pairing, status: "cancelled", pairingCode: undefined });
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setSnapshot(event.currentTarget.files?.[0]);
    invalidate();
  }

  async function request(
    action: "preview" | "apply",
    event?: FormEvent<HTMLFormElement>,
  ) {
    event?.preventDefault();
    if (!snapshot) {
      setMessage("Choose AlecaFrame's lastData.dat file.");
      return;
    }
    if (!includeInventory && !includeProgression && !createBuild) {
      setMessage("Select at least one category to import.");
      return;
    }
    if (action === "apply" && mode === "replace" && !replaceConfirmed) {
      setMessage(
        "Confirm that replacement may lower or clear recorded collection data.",
      );
      return;
    }
    setPending(action);
    if (action === "apply") setResult(undefined);
    setMessage("");
    const form = new FormData();
    form.set("snapshot", snapshot);
    form.set("mode", mode);
    form.set("includeInventory", String(includeInventory));
    form.set("includeProgression", String(includeProgression));
    form.set("createBuild", String(createBuild));
    if (buildTitle.trim()) form.set("buildTitle", buildTitle.trim());
    if (action === "apply" && preview)
      form.set("expectedHash", preview.snapshotHash);
    const response = await fetch(`/api/account/import/${provider}/${action}`, {
      method: "POST",
      body: form,
    });
    const body = (await response.json().catch(() => ({}))) as
      AlecaFrameImportPreview | ApplyResult | { message?: string };
    if (!response.ok) {
      setMessage(
        "message" in body && body.message
          ? body.message
          : "AlecaFrame import failed.",
      );
      setPending(undefined);
      return;
    }
    if (action === "preview") {
      const next = body as AlecaFrameImportPreview;
      setPreview(next);
      setResult(undefined);
      if (!buildTitle && next.sourceTimestamp)
        setBuildTitle(
          `AlecaFrame loadout — ${next.sourceTimestamp.replace("T", " ").slice(0, 16)} UTC`,
        );
    } else {
      const applied = body as ApplyResult;
      setResult(applied);
      setPreview(applied);
      setMessage(
        `Imported ${applied.inventory.changedItems} collection changes${applied.buildId ? " and created a build draft" : ""}.`,
      );
      router.refresh();
    }
    setPending(undefined);
  }

  return (
    <section className="card form-stack player-data-import">
      <h2>Import Warframe data</h2>
      <p className="muted">
        Import from a supported companion. Source data is parsed in memory and
        never retained. Changes use exact game item paths; names are never
        guessed.
      </p>
      <form
        className="form-stack compact-form"
        onSubmit={(event) =>
          provider === "alecaframe"
            ? request("preview", event)
            : startPairing(event)
        }
      >
        <label>
          Import source
          <select
            value={provider}
            disabled={pending !== undefined || pairingPending}
            onChange={(event) => {
              setProvider(
                event.currentTarget.value as (typeof providers)[number]["id"],
              );
              setSnapshot(undefined);
              setPairing(undefined);
              invalidate();
            }}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        {provider === "alecaframe" ? (
          <>
            <details>
              <summary>Where is the AlecaFrame file?</summary>
              <ol>
                <li>
                  Let AlecaFrame refresh after logging in or passing through a
                  loading screen.
                </li>
                <li>
                  Open <code>%LOCALAPPDATA%\AlecaFrame</code> on the PC where
                  AlecaFrame runs.
                </li>
                <li>
                  Select <code>lastData.dat</code>. Do not upload{" "}
                  <code>deltas.dat</code>, logs, credentials, or a network
                  archive.
                </li>
              </ol>
            </details>
            <label>
              AlecaFrame snapshot
              <input
                type="file"
                name="snapshot"
                accept={providers.find(({ id }) => id === provider)?.accept}
                required
                onChange={chooseFile}
                disabled={pending !== undefined}
              />
            </label>
            <label>
              Import behavior
              <select
                value={mode}
                disabled={pending !== undefined}
                onChange={(event) => {
                  setMode(
                    event.currentTarget.value === "replace"
                      ? "replace"
                      : "merge",
                  );
                  setReplaceConfirmed(false);
                  invalidate();
                }}
              >
                <option value="merge">
                  Merge without lowering recorded values
                </option>
                <option value="replace">
                  Replace supported collection values
                </option>
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeInventory}
                onChange={(event) => {
                  setIncludeInventory(event.currentTarget.checked);
                  invalidate();
                }}
              />
              Inventory, equipment, mastery and Helminth state
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeProgression}
                onChange={(event) => {
                  setIncludeProgression(event.currentTarget.checked);
                  invalidate();
                }}
              />
              Verified account progression
            </label>
            <button className="button" disabled={pending !== undefined}>
              {pending === "preview" ? "Reading snapshot…" : "Preview import"}
            </button>
          </>
        ) : (
          <>
            <div className="notice">
              <p>
                The Windows updater reads temporary credentials from the running
                game, fetches your current inventory, and sends only that
                inventory to this Ordis Prime instance.
              </p>
              <p>
                Imports only increase supported inventory and progression. They
                never remove data or create a build.
              </p>
              <p>
                After pairing, you can optionally keep the updater in the system
                tray and choose whether it launches at Windows sign-in.
              </p>
            </div>
            <p>
              <a
                className="nav-button"
                href="/downloads/ordis-prime-updater-windows-x64.exe"
              >
                Download Windows updater
              </a>
            </p>
            <p className="muted">
              The first release is unsigned and Windows may show a SmartScreen
              warning. Review the source and its{" "}
              <a href="/downloads/ordis-prime-updater-windows-x64.exe.sha256">
                SHA-256 checksum
              </a>{" "}
              before running it. After pairing, the updater waits in the system
              tray and detects Warframe whenever you next run it.
            </p>
            {!pairing ? (
              <button className="button" disabled={pairingPending}>
                {pairingPending ? "Creating pairing…" : "Create pairing code"}
              </button>
            ) : (
              <div className="form-stack compact-form">
                {pairing.status === "pending" && pairing.pairingCode && (
                  <>
                    <label>
                      Pairing code
                      <textarea readOnly rows={4} value={pairing.pairingCode} />
                    </label>
                    <p className="muted">
                      Paste this code into the updater before{" "}
                      {new Date(pairing.expiresAt).toLocaleTimeString()}. It can
                      be used once to register this Windows device.
                    </p>
                  </>
                )}
                <p>
                  <span className="tag">{pairing.status}</span>
                </p>
                {pairing.status === "pending" && (
                  <button
                    type="button"
                    className="nav-button"
                    onClick={() => void cancelPairing()}
                  >
                    Cancel pairing
                  </button>
                )}
              </div>
            )}
            <section
              className="updater-devices"
              aria-labelledby="updater-devices-title"
            >
              <h3 id="updater-devices-title">Paired updater devices</h3>
              {devices.length ? (
                <ul className="plain-list">
                  {devices.map((device) => (
                    <li className="notice" key={device.id}>
                      <strong>{device.name}</strong>{" "}
                      <span className="tag">{device.status}</span>
                      <span className="muted">
                        Created {new Date(device.createdAt).toLocaleString()}
                        {device.lastUsedAt
                          ? ` · last used ${new Date(device.lastUsedAt).toLocaleString()}`
                          : " · never used"}
                        {device.lastSuccessAt
                          ? ` · last success ${new Date(device.lastSuccessAt).toLocaleString()}`
                          : ""}
                      </span>
                      {device.lastError && (
                        <span className="error">
                          Last error: {device.lastError}
                        </span>
                      )}
                      {device.status === "active" && (
                        <button
                          type="button"
                          className="nav-button"
                          onClick={() => void revokeDevice(device.id)}
                        >
                          Revoke device
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No updater devices are paired.</p>
              )}
            </section>
          </>
        )}
      </form>

      {preview && (
        <div className="import-preview">
          <div>
            <span className="tag">{result ? "Imported" : "Preview"}</span>
            <h3>
              {provider === "alecaframe"
                ? "AlecaFrame snapshot"
                : "Updater synchronization"}
            </h3>
            <p className="muted">
              {preview.sourceTimestamp
                ? `Last synchronized ${new Date(preview.sourceTimestamp).toLocaleString()}`
                : "No valid source synchronization time was present."}
            </p>
          </div>
          <div className="count-grid">
            <p>
              <strong>{preview.inventory.resolvedItems}</strong>
              <br />
              matched items
            </p>
            <p>
              <strong>{preview.inventory.changedItems}</strong>
              <br />
              collection changes
            </p>
            <p>
              <strong>{preview.inventory.decreasedItems}</strong>
              <br />
              decreases or clears
            </p>
          </div>
          {(preview.progression.masteryRank ||
            preview.progression.highestWarframeRank) && (
            <div>
              <h3>Progression</h3>
              <ul>
                {preview.progression.masteryRank && (
                  <li>
                    Combined Mastery Rank:{" "}
                    {preview.progression.masteryRank.before ?? "unknown"} →{" "}
                    {preview.progression.masteryRank.after}
                  </li>
                )}
                {preview.progression.highestWarframeRank && (
                  <li>
                    Highest available Warframe rank:{" "}
                    {preview.progression.highestWarframeRank.before ??
                      "unknown"}{" "}
                    → {preview.progression.highestWarframeRank.after}
                  </li>
                )}
              </ul>
            </div>
          )}
          {preview.inventory.changes.length > 0 && (
            <details>
              <summary>Review collection changes</summary>
              <ul className="compact-list">
                {preview.inventory.changes.map((change) => (
                  <li key={`${change.kind}:${change.slug}`}>
                    <strong>{change.name}</strong> · owned {change.owned.before}{" "}
                    → {change.owned.after} · built {change.built.before} →{" "}
                    {change.built.after}
                    {change.mastered.before !== change.mastered.after
                      ? ` · mastered ${stateLabel(change.mastered.before)} → ${stateLabel(change.mastered.after)}`
                      : ""}
                    {change.subsumed.before !== change.subsumed.after
                      ? ` · subsumed ${stateLabel(change.subsumed.before)} → ${stateLabel(change.subsumed.after)}`
                      : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {provider === "alecaframe" &&
            preview.loadout.equipment.length > 0 && (
              <div className="form-stack compact-form">
                <h3>Equipped loadout</h3>
                <ul className="compact-list">
                  {preview.loadout.equipment.map((equipment) => (
                    <li key={equipment.slot}>
                      <strong>{equipment.slot}</strong>: {equipment.name}
                      {equipment.configuration
                        ? ` · config ${equipment.configuration}`
                        : ""}{" "}
                      · {equipment.mods} mods · {equipment.enhancements} arcanes
                    </li>
                  ))}
                </ul>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={createBuild}
                    onChange={(event) =>
                      setCreateBuild(event.currentTarget.checked)
                    }
                  />
                  Create a new build draft from this loadout
                </label>
                {createBuild && (
                  <label>
                    Build title
                    <input
                      value={buildTitle}
                      maxLength={120}
                      required
                      onChange={(event) =>
                        setBuildTitle(event.currentTarget.value)
                      }
                    />
                  </label>
                )}
              </div>
            )}
          {(preview.inventory.unresolvedCount > 0 ||
            preview.loadout.unresolvedCount > 0) && (
            <details>
              <summary>
                Unresolved data (
                {preview.inventory.unresolvedCount +
                  preview.loadout.unresolvedCount}
                )
              </summary>
              <ul className="compact-list">
                {preview.inventory.unresolvedItemTypes.map((value) => (
                  <li key={`inventory:${value}`}>{value}</li>
                ))}
                {preview.loadout.unresolved.map((value) => (
                  <li key={`loadout:${value}`}>{value}</li>
                ))}
              </ul>
            </details>
          )}
          {preview.warnings.length > 0 && (
            <details>
              <summary>Known limitations</summary>
              <ul className="compact-list">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          {provider === "alecaframe" && mode === "replace" && (
            <label className="checkbox-label notice">
              <input
                type="checkbox"
                checked={replaceConfirmed}
                onChange={(event) =>
                  setReplaceConfirmed(event.currentTarget.checked)
                }
              />
              I understand that replacement can lower or clear manually recorded
              owned, built, mastered, and subsumed values. Wanted counts and
              notes are preserved.
            </label>
          )}
          {provider === "alecaframe" && (
            <button
              type="button"
              className="button"
              disabled={
                pending !== undefined ||
                result !== undefined ||
                (mode === "replace" && !replaceConfirmed)
              }
              onClick={() => request("apply")}
            >
              {pending === "apply"
                ? "Applying import…"
                : result
                  ? "Import applied"
                  : mode === "replace"
                    ? "Replace and import"
                    : "Apply import"}
            </button>
          )}
        </div>
      )}
      {message && (
        <p className={result ? "success" : "error"} role="status">
          {message}
          {result?.buildId && (
            <>
              {" "}
              <Link href={`/builds/${result.buildId}`}>Open build</Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}

function stateLabel(value: boolean | undefined) {
  return value === undefined ? "unknown" : value ? "yes" : "no";
}
