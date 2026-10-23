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
        <p className="eyebrow">Administrator setup · complete</p>
        <h1>Setup is complete.</h1>
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
      <p className="eyebrow">Administrator setup · first run</p>
      <h1>Create the first administrator.</h1>
      <p className="lede">
        Use the configured bootstrap token. It is accepted only while no
        accounts exist.
      </p>
      <SetupForm />
    </>
  );
}
