import Link from "next/link";
import { getDatabase } from "@/lib/database";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const result = getDatabase()
    .prepare("select count(*) as count from users")
    .get() as { count: number };
  if (result.count > 0)
    return (
      <>
        <p className="eyebrow">Orbiter commissioning // complete</p>
        <h1>
          This Orbiter already has an <u>Operator.</u>
        </h1>
        <p className="lede">
          The bootstrap token cannot create additional administrators.
        </p>
        <Link className="button" href="/sign-in">
          Sign in
        </Link>
      </>
    );
  return (
    <>
      <p className="eyebrow">Orbiter commissioning // first run</p>
      <h1>
        Assign the first <u>Operator.</u>
      </h1>
      <p className="lede">
        Create the installation administrator with the configured bootstrap
        token. The token is accepted only while no accounts exist.
      </p>
      <SetupForm />
    </>
  );
}
