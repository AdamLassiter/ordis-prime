import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiCircuitAdapter,
  type Snapshot,
} from "../src/index.ts";

test("Circuit adapter imports complete normal and Steel Path weekly schedules", async () => {
  const observations = await collect(
    new WarframeWikiCircuitAdapter(),
    circuitSnapshot(),
  );
  const schedules = observations.filter(
    (observation) => observation.type === "cyclic-reward-schedule",
  );
  const choices = observations.filter(
    (observation) => observation.type === "cyclic-reward-choice",
  );

  assert.deepEqual(
    schedules.map(({ key, epoch, phaseCount, choicesPerPhase }) => ({
      key,
      epoch,
      phaseCount,
      choicesPerPhase,
    })),
    [
      {
        key: "circuit-normal",
        epoch: "2023-04-24T00:00:00.000Z",
        phaseCount: 11,
        choicesPerPhase: 3,
      },
      {
        key: "circuit-steel-path",
        epoch: "2026-04-20T00:00:00.000Z",
        phaseCount: 9,
        choicesPerPhase: 5,
      },
    ],
  );
  assert.equal(choices.length, 78);
  assert.deepEqual(choices[0], {
    type: "cyclic-reward-choice",
    scheduleKey: "circuit-normal",
    phaseIndex: 1,
    phaseLabel: "Week 1",
    position: 0,
    primary: { label: "Frame 1-1" },
    acquisitionMode: "path",
    includedRewards: [{ label: "Augment 1-1", tier: 7 }],
    evidence: choices[0]!.evidence,
  });
  assert.equal(choices.at(-1)?.type, "cyclic-reward-choice");
  if (choices.at(-1)?.type === "cyclic-reward-choice")
    assert.equal(choices.at(-1)?.primary.label, "Genesis 9-5");
});

function circuitSnapshot(): Snapshot {
  const normalRows = [...Array(11).keys()]
    .map((index) => {
      const week = index + 1;
      const phase = week % 11;
      const cells = [...Array(3).keys()]
        .map(
          (position) =>
            `<td>{{WF|Frame ${week}-${position + 1}}}<br/>({{M|Augment ${week}-${position + 1}}})</td>`,
        )
        .join("\n");
      return `<tr {{#ifeq: {{#var:RotatingRewardsIndexNormal}} | ${phase} | class="tableRow-active"}}><th>Week ${week}</th>${cells}</tr>`;
    })
    .join("\n");
  const steelRows = [...Array(9).keys()]
    .map((index) => {
      const week = index + 1;
      const phase = week % 9;
      const rotation = String.fromCharCode(65 + index);
      const rewards = [...Array(5).keys()]
        .map(
          (position) =>
            `*{{Resource|Genesis ${week}-${position + 1}}} ({{Weapon|Weapon}})`,
        )
        .join("\n");
      return `|-\n! {{#ifeq: {{#var:RotatingRewardsIndexHard}} | ${phase} | class="tableRow-active"}} |Week ${week} (${rotation})\n| {{#ifeq: {{#var:RotatingRewardsIndexHard}} | ${phase} | class="tableRow-active"}} |\n${rewards}`;
    })
    .join("\n");
  const source = `
{{#vardefine:RotatingRewardsIndexNormal|{{#expr: floor ((({{#time: U | now }} - {{#time: U | 2023-4-24 }}) mod (604800 * 11)) / 604800)}}}}
<table><caption>Normal Circuit Warframe Rotation</caption>${normalRows}</table>
{{#vardefine:RotatingRewardsIndexHard|{{#expr: floor ((({{#time: U | now }} - {{#time: U | 2026-4-20 00:00:00 }}) mod (604800 * 9)) / 604800)}}}}
{|\n|+The Steel Path Incarnon Genesis Reward Rotation
${steelRows}
|-\n! Week 10+
|}`;
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      query: {
        pages: [
          {
            title: "The Circuit",
            revisions: [{ revid: 123, slots: { main: { content: source } } }],
          },
        ],
      },
    }),
  );
  return {
    sourceId: "warframe-wiki-circuit",
    version: "fixture",
    retrievedAt: "2026-10-19T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}
