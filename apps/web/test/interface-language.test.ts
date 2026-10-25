import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("primary feature labels use direct current terminology", async () => {
  const [home, alerts, build] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/todos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/builds/[id]/page.tsx", import.meta.url), "utf8"),
  ]);

  for (const label of ["STAR CHART", "CYCLES", "BUILDS", "PROGRESSION"]) {
    assert.match(home, new RegExp(`code: "${label}"`, "u"));
  }
  assert.doesNotMatch(
    home,
    /code: "(?:NAVIGATION|SYSTEM PULSE|ARSENAL|ARCHIVES)"/u,
  );
  assert.match(alerts, /<h2>Alarms<\/h2>/u);
  assert.match(build, /<button className="button">Publish<\/button>/u);
  assert.doesNotMatch(build, /Publish immutable snapshot/u);
});

test("account navigation ends with the requested operations group", async () => {
  const [sessionNavigation, signOutButton] = await Promise.all([
    readFile(new URL("../app/session-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sign-out-button.tsx", import.meta.url), "utf8"),
  ]);

  const labels = ["Provenance", "Crew", "Operator"];
  let previousPosition = -1;
  for (const label of labels) {
    const position = sessionNavigation.indexOf(label);
    assert.ok(
      position > previousPosition,
      `${label} should follow the prior tab`,
    );
    previousPosition = position;
  }
  assert.match(signOutButton, /"Sign Out"/u);
});

test("Progression uses lozenges as its only kind picker", async () => {
  const progression = await readFile(
    new URL("../app/discovery/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(progression, /<select name="kind"/u);
  assert.match(
    progression,
    /<input name="kind" type="hidden" value=\{selectedKind\}/u,
  );
  assert.match(progression, /aria-current=\{selectedKind === entry/u);
});

test("Codex search follows its launch cards and precedes results", async () => {
  const codex = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const launch = codex.indexOf('className="launch-grid"');
  const search = codex.indexOf('className="search-console"');
  const results = codex.indexOf('className="search-results"');

  assert.ok(launch >= 0);
  assert.ok(search > launch);
  assert.ok(results > search);
});

test("Market freshness is quiet explanatory copy", async () => {
  const market = await readFile(
    new URL("../app/index/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    market,
    /<p className="muted market-status">\{marketStatus\(status\)\}<\/p>/u,
  );
  assert.doesNotMatch(market, /notice index-status/u);
});

test("Planner renders outstanding requirements as a semantic table", async () => {
  const planner = await readFile(
    new URL("../app/planner/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    planner,
    /<table className="index-table planner-requirements">/u,
  );
  assert.match(planner, /<th>Quantity required<\/th>/u);
  assert.match(planner, /<th scope="row">/u);
  assert.doesNotMatch(planner, /requirement-list/u);
});

test("catalog locations are promoted above generic related discoveries", async () => {
  const catalog = await readFile(
    new URL("../app/catalog/[kind]/[slug]/page.tsx", import.meta.url),
    "utf8",
  );
  const locations = catalog.indexOf('className="catalog-locations"');
  const relations = catalog.indexOf("<dt>Related discoveries</dt>");

  assert.ok(locations >= 0);
  assert.ok(relations > locations);
  assert.match(catalog, /relation\.kind === "occurs-at"/u);
  assert.match(catalog, /relation\.subject\.kind === "node"/u);
  assert.match(catalog, /relatedDiscoveries\.map/u);
});

test("bulk progress controls distinguish chart completion modes", async () => {
  const [progression, starChart, nodeForm] = await Promise.all([
    readFile(new URL("../app/discovery/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/star-chart/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/nodes/completion-form.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(progression, /action=\{completeAllDiscoveryProgress\}/u);
  assert.match(progression, />Mark all complete</u);
  assert.match(starChart, /<NodeScopeActions \/>/u);
  assert.match(starChart, /<NodeScopeActions planet=\{planet\} \/>/u);
  assert.match(starChart, /value="normal"/u);
  assert.match(starChart, /value="steel-path"/u);
  assert.match(starChart, /name="normal-completed"/u);
  assert.match(starChart, /name="steel-path-completed"/u);
  assert.match(nodeForm, /name="normalState"/u);
  assert.match(nodeForm, /name="steelPathState"/u);
});

test("detail-page account controls share a compact responsive grid", async () => {
  const [catalog, node, inventoryForm, css] = await Promise.all([
    readFile(
      new URL("../app/catalog/[kind]/[slug]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/nodes/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/catalog/[kind]/[slug]/inventory-form.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(catalog, /className="detail-account-grid"/u);
  assert.match(node, /className="detail-account-grid"/u);
  assert.match(inventoryForm, /id="your-inventory"/u);
  assert.match(inventoryForm, /<CollectionStateIndicators/u);
  assert.match(
    css,
    /\.detail-account-grid \{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(17rem, 1fr\)\)/u,
  );
  assert.match(css, /\.detail-account-grid > \.card \{[\s\S]*margin-top: 0/u);
});
