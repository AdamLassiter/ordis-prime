import Link from "next/link";
import type {
  CyclicRewardChoice,
  CyclicRewardSchedule,
  PlayerInventoryEntry,
} from "@ordis-prime/db";
import { deriveCollectionState } from "@ordis-prime/domain";
import { CollectionStateIndicators } from "@/app/collection-state-indicators";

export function CircuitSchedules({
  schedules,
  inventory,
}: {
  schedules: CyclicRewardSchedule[];
  inventory?: PlayerInventoryEntry[];
}) {
  if (!schedules.length) return null;
  return (
    <section className="circuit-schedules">
      <p className="eyebrow">Static schedule · weekly reset</p>
      <h2>The Circuit</h2>
      <div className="grid circuit-current-grid">
        {schedules.map((schedule) => (
          <article className="card" key={schedule.key}>
            <p className="eyebrow">
              Current · {phaseLabel(schedule, schedule.currentPhaseIndex)}
            </p>
            <h3>{schedule.label}</h3>
            <ChoiceList
              choices={phaseChoices(schedule, schedule.currentPhaseIndex)}
              inventory={inventory}
            />
            <p>{schedule.instructions}</p>
            <p className="countdown">
              Resets {formatInstant(schedule.currentEndsAt)}
            </p>
            <div className="circuit-next">
              <strong>
                Next · {phaseLabel(schedule, schedule.nextPhaseIndex)}
              </strong>
              <ChoiceList
                choices={phaseChoices(schedule, schedule.nextPhaseIndex)}
                inventory={inventory}
              />
            </div>
          </article>
        ))}
      </div>
      <details className="card circuit-full-schedule">
        <summary>Show complete Circuit rotations</summary>
        <div className="grid circuit-phase-grid">
          {schedules.flatMap((schedule) =>
            [...Array(schedule.phaseCount).keys()].map((phaseIndex) => (
              <section key={`${schedule.key}:${phaseIndex}`}>
                <h3>
                  {schedule.label} · {phaseLabel(schedule, phaseIndex)}
                </h3>
                <ChoiceList
                  choices={phaseChoices(schedule, phaseIndex)}
                  inventory={inventory}
                />
              </section>
            )),
          )}
        </div>
      </details>
    </section>
  );
}

function ChoiceList({
  choices,
  inventory,
}: {
  choices: CyclicRewardChoice[];
  inventory?: PlayerInventoryEntry[];
}) {
  return (
    <ul className="circuit-choice-list">
      {choices.map((choice) => (
        <li key={`${choice.phaseIndex}:${choice.position}`}>
          <EntityLink subject={choice.primary} inventory={inventory} />
          {choice.includedRewards.map((reward) => (
            <span className="muted" key={`${reward.label}:${reward.tier}`}>
              {" "}
              · tier {reward.tier}:{" "}
              <EntityLink subject={reward} inventory={inventory} />
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

function EntityLink({
  subject,
  inventory,
}: {
  subject: CyclicRewardChoice["primary"];
  inventory?: PlayerInventoryEntry[];
}) {
  if (!subject.entity) return subject.label;
  const recorded = inventory?.find(
    (entry) => entry.entityId === subject.entity?.id,
  );
  const values = recorded ?? {
    kind: subject.entity.kind,
    ownedCount: 0,
    builtCount: 0,
    wantedCount: 0,
  };
  return (
    <>
      <Link href={`/catalog/${subject.entity.kind}/${subject.entity.slug}`}>
        {subject.label}
      </Link>{" "}
      {inventory && (
        <CollectionStateIndicators
          {...deriveCollectionState(values)}
          mastered={recorded?.mastered}
          ownedCount={recorded?.ownedCount}
          builtCount={recorded?.builtCount}
          wantedCount={recorded?.wantedCount}
          compact
        />
      )}
    </>
  );
}

function phaseChoices(schedule: CyclicRewardSchedule, phaseIndex: number) {
  return schedule.choices.filter((choice) => choice.phaseIndex === phaseIndex);
}

function phaseLabel(schedule: CyclicRewardSchedule, phaseIndex: number) {
  return (
    phaseChoices(schedule, phaseIndex)[0]?.phaseLabel ??
    `Phase ${phaseIndex + 1}`
  );
}

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
