"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type MarkerKind = "planet" | "node" | "junction" | "arc-control";
interface Marker {
  id: string;
  scope: string;
  kind: MarkerKind;
  label: string;
  x: number;
  y: number;
  radius?: number;
}

export default function StarChartLayoutPage() {
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageInfo, setImageInfo] = useState<{
    name: string;
    width: number;
    height: number;
  }>();
  const [scope, setScope] = useState("overview");
  const [planet, setPlanet] = useState("Venus");
  const [kind, setKind] = useState<MarkerKind>("planet");
  const [label, setLabel] = useState("Venus");
  const [radius, setRadius] = useState(0.045);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const imageRef = useRef<HTMLDivElement>(null);
  const activeScope = scope === "overview" ? "overview" : planet.trim();
  const visibleMarkers = markers.filter(
    (marker) => marker.scope === activeScope,
  );
  const exportDocument = useMemo(
    () => buildExport(markers, imageInfo),
    [markers, imageInfo],
  );

  return (
    <>
      <p className="eyebrow">Navigation cartography // local tool</p>
      <h1>Trace the in-game Star Chart.</h1>
      <p className="lede">
        Load a screenshot, name each body or node, and click its centre. All
        coordinates are exported as normalized values so layouts remain stable
        at any display size. The image remains in your browser and is not
        uploaded.
      </p>
      <p>
        <Link className="nav-button" href="/star-chart">
          ← Return to Navigation
        </Link>
      </p>
      <section className="card form-stack">
        <label>
          Screenshot
          <input
            accept="image/*"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              const image = new Image();
              image.onload = () => {
                setImageInfo({
                  name: file.name,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                });
                setImageUrl(url);
              };
              image.src = url;
            }}
          />
        </label>
        <label>
          View being traced
          <select
            value={scope}
            onChange={(event) => {
              const next = event.target.value;
              setScope(next);
              setKind(next === "overview" ? "planet" : "node");
            }}
          >
            <option value="overview">Zoomed-out Origin System</option>
            <option value="planet">Zoomed-in planet</option>
          </select>
        </label>
        {scope === "planet" && (
          <label>
            Planet name
            <input
              value={planet}
              onChange={(event) => setPlanet(event.target.value)}
            />
          </label>
        )}
        <label>
          Marker type
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as MarkerKind)}
          >
            {scope === "overview" ? (
              <>
                <option value="planet">Planet circle</option>
                <option value="arc-control">Junction arc control point</option>
              </>
            ) : (
              <>
                <option value="node">Mission node</option>
                <option value="junction">Planet junction</option>
              </>
            )}
          </select>
        </label>
        <label>
          {kind === "arc-control"
            ? "Arc endpoints (for example Earth -> Venus)"
            : "Exact catalog label or slug"}
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        {kind === "planet" && (
          <label>
            Circle radius ({Math.round(radius * 1000) / 10}% of image width)
            <input
              max="0.2"
              min="0.005"
              step="0.005"
              type="range"
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
            />
          </label>
        )}
      </section>
      {imageUrl ? (
        <div
          aria-label="Click the screenshot to add the selected marker"
          className="layout-annotator"
          onClick={(event) => {
            if (!label.trim() || !imageRef.current) return;
            const bounds = imageRef.current.getBoundingClientRect();
            setMarkers((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                scope: activeScope,
                kind,
                label: label.trim(),
                x: clamp((event.clientX - bounds.left) / bounds.width),
                y: clamp((event.clientY - bounds.top) / bounds.height),
                ...(kind === "planet" ? { radius } : {}),
              },
            ]);
          }}
          ref={imageRef}
          role="button"
          style={{ backgroundImage: `url(${imageUrl})` }}
          tabIndex={0}
        >
          {visibleMarkers.map((marker) => (
            <span
              className={`layout-marker layout-marker-${marker.kind}`}
              key={marker.id}
              style={{
                left: `${marker.x * 100}%`,
                top: `${marker.y * 100}%`,
                ...(marker.radius
                  ? {
                      width: `${marker.radius * 200}%`,
                      aspectRatio: "1",
                    }
                  : {}),
              }}
              title={marker.label}
            >
              {marker.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="notice">Choose a screenshot to begin tracing.</p>
      )}
      <section className="card">
        <h2>Annotations in this view</h2>
        {visibleMarkers.length ? (
          <ul>
            {visibleMarkers.map((marker) => (
              <li key={marker.id}>
                {marker.kind}: {marker.label} ({marker.x.toFixed(4)},{" "}
                {marker.y.toFixed(4)}){" "}
                <button
                  className="text-button"
                  onClick={() =>
                    setMarkers((current) =>
                      current.filter((entry) => entry.id !== marker.id),
                    )
                  }
                  type="button"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No markers in this view yet.</p>
        )}
      </section>
      <section className="card form-stack">
        <h2>Import or export layout data</h2>
        <p className="muted">
          Save the exported file as{" "}
          <code>data/manual/star-chart-layout.json</code>. Navigation reads that
          file on its next request and falls back to a derived layout for
          anything not yet traced.
        </p>
        <button
          className="button"
          disabled={!markers.length}
          onClick={() => downloadLayout(exportDocument)}
          type="button"
        >
          Download layout JSON
        </button>
        <label>
          Continue from an existing layout JSON
          <input
            accept="application/json,.json"
            type="file"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setMarkers(importMarkers(JSON.parse(await file.text())));
            }}
          />
        </label>
        <pre className="layout-json-preview">
          {JSON.stringify(exportDocument, null, 2)}
        </pre>
      </section>
    </>
  );
}

function buildExport(
  markers: Marker[],
  image?: { name: string; width: number; height: number },
) {
  const planets: Record<string, { x: number; y: number; radius: number }> = {};
  const arcs = new Map<string, Array<{ x: number; y: number }>>();
  const planetLayouts: Record<
    string,
    {
      nodes: Record<string, { x: number; y: number }>;
      junctions: Record<string, { x: number; y: number }>;
    }
  > = {};
  for (const marker of markers) {
    if (marker.scope === "overview" && marker.kind === "planet")
      planets[marker.label] = {
        x: marker.x,
        y: marker.y,
        radius: marker.radius ?? 0.045,
      };
    else if (marker.scope === "overview" && marker.kind === "arc-control")
      arcs.set(marker.label, [
        ...(arcs.get(marker.label) ?? []),
        { x: marker.x, y: marker.y },
      ]);
    else if (marker.scope !== "overview") {
      const layout = (planetLayouts[marker.scope] ??= {
        nodes: {},
        junctions: {},
      });
      const target =
        marker.kind === "junction" ? layout.junctions : layout.nodes;
      target[slug(marker.label)] = { x: marker.x, y: marker.y };
    }
  }
  return {
    schemaVersion: 1,
    ...(image ? { sourceImages: { current: image } } : {}),
    overview: {
      planets,
      arcs: [...arcs.entries()].flatMap(([label, controls]) => {
        const [from, to] = label.split(/\s*->\s*/, 2);
        return from && to ? [{ from, to, controls }] : [];
      }),
    },
    planets: planetLayouts,
  };
}

function importMarkers(value: any): Marker[] {
  const result: Marker[] = [];
  for (const [label, circle] of Object.entries(value.overview?.planets ?? {})) {
    const point = circle as { x: number; y: number; radius: number };
    result.push({
      id: crypto.randomUUID(),
      scope: "overview",
      kind: "planet",
      label,
      ...point,
    });
  }
  for (const arc of value.overview?.arcs ?? [])
    for (const point of arc.controls ?? [])
      result.push({
        id: crypto.randomUUID(),
        scope: "overview",
        kind: "arc-control",
        label: `${arc.from} -> ${arc.to}`,
        x: point.x,
        y: point.y,
      });
  for (const [planet, layoutValue] of Object.entries(value.planets ?? {})) {
    const layout = layoutValue as {
      nodes?: Record<string, { x: number; y: number }>;
      junctions?: Record<string, { x: number; y: number }>;
    };
    for (const [label, point] of Object.entries(layout.nodes ?? {}))
      result.push({
        id: crypto.randomUUID(),
        scope: planet,
        kind: "node",
        label,
        ...point,
      });
    for (const [label, point] of Object.entries(layout.junctions ?? {}))
      result.push({
        id: crypto.randomUUID(),
        scope: planet,
        kind: "junction",
        label,
        ...point,
      });
  }
  return result;
}

function downloadLayout(value: unknown): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([`${JSON.stringify(value, null, 2)}\n`], {
      type: "application/json",
    }),
  );
  link.download = "star-chart-layout.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function slug(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
