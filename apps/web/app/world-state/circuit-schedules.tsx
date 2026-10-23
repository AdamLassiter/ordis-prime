import Link from "next/link";
import type { CyclicRewardChoice, CyclicRewardSchedule } from "@ordis-prime/db";

export function CircuitSchedules({
  schedules,
}: {
  schedules: CyclicRewardSchedule[];
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
                <ChoiceList choices={phaseChoices(schedule, phaseIndex)} />
              </section>
            )),
          )}
        </div>
      </details>
    </section>
  );
}

function ChoiceList({ choices }: { choices: CyclicRewardChoice[] }) {
  return (
    <ul className="circuit-choice-list">
      {choices.map((choice) => (
        <li key={`${choice.phaseIndex}:${choice.position}`}>
          <EntityLink subject={choice.primary} />
          {choice.includedRewards.map((reward) => (
            <span className="muted" key={`${reward.label}:${reward.tier}`}>
              {" "}
              · tier {reward.tier}: <EntityLink subject={reward} />
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

function EntityLink({ subject }: { subject: CyclicRewardChoice["primary"] }) {
  return subject.entity ? (
    <Link href={`/catalog/${subject.entity.kind}/${subject.entity.slug}`}>
      {subject.label}
    </Link>
  ) : (
    subject.label
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
