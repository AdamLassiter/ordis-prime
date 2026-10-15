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
        <p className="eyebrow">Setup complete</p>
        <h1>This installation already has an account.</h1>
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
      <p className="eyebrow">First-run setup</p>
      <h1>Create the administrator.</h1>
      <p className="lede">
        Use the setup token configured by the operator. It is accepted only
        while this installation has no accounts.
      </p>
      <SetupForm />
    </>
  );
}
