"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface ImportResult {
  parsedRecords: number;
  resolvedItems: number;
  changedItems: number;
  unresolvedCount: number;
  unresolvedItemTypes: string[];
  message?: string;
}

export function GameInventoryImport() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError(false);
    const file = new FormData(event.currentTarget).get("inventory");
    if (!(file instanceof File) || !file.size) {
      setError(true);
      setMessage("Choose a raw inventory JSON file.");
      setPending(false);
      return;
    }
    const response = await fetch("/api/inventory/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: file,
    });
    const result = (await response.json().catch(() => ({}))) as ImportResult;
    if (!response.ok) {
      setError(true);
      setMessage(result.message ?? "Inventory import failed.");
      setPending(false);
      return;
    }
    setMessage(
      `Updated ${result.changedItems} items from ${result.resolvedItems} matched catalog entries.${result.unresolvedCount ? ` ${result.unresolvedCount} item paths were not matched${result.unresolvedItemTypes.length ? `: ${result.unresolvedItemTypes.join(", ")}` : ""}.` : ""}`,
    );
    setPending(false);
    router.refresh();
  }

  return (
    <section className="card form-stack">
      <h2>Import a Warframe inventory snapshot</h2>
      <p className="muted">
        Upload raw inventory JSON obtained from your own game session. The file
        is parsed in memory and is not retained. Stable item paths are matched
        to the catalog; confirmed counts and Helminth subsumes can increase
        recorded values, but this merge will not reduce manual counts or infer
        mastery.
      </p>
      <details>
        <summary>What file does this accept?</summary>
        <ol>
          <li>
            Export or capture the raw inventory response from a tool you already
            trust. Ordis Prime never asks for your Warframe email, password,
            two-factor code, or session token.
          </li>
          <li>
            Save the response body as JSON. It must be the inventory object
            itself, with arrays such as <code>Suits</code>,{" "}
            <code>LongGuns</code>,<code>Pistols</code>, <code>Melee</code>,{" "}
            <code>RawUpgrades</code>, or
            <code>MiscItems</code>. Each owned record uses its stable
            <code> ItemType</code> path and may include <code>ItemCount</code>.
          </li>
          <li>
            Upload that JSON below. Review the matched and unresolved counts;
            unresolved paths are never guessed by display name.
          </li>
        </ol>
        <p className="notice">
          Do not upload a network archive, launcher log, credentials, or the
          portable Ordis Prime profile export here. If your exporter wraps the
          inventory in another object, extract the inventory object first.
        </p>
        <pre>{`{
  "Suits": [
    { "ItemType": "/Lotus/Powersuits/Excalibur/Excalibur", "ItemCount": 1 }
  ],
  "RawUpgrades": []
}`}</pre>
      </details>
      <form className="form-stack compact-form" onSubmit={submit}>
        <label>
          Raw inventory JSON
          <input
            name="inventory"
            type="file"
            accept="application/json,.json"
            required
          />
        </label>
        <button className="button" disabled={pending}>
          {pending ? "Importing…" : "Merge inventory snapshot"}
        </button>
        {message && (
          <p className={error ? "error" : "success"} role="status">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
