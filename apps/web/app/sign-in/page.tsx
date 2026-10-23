import { getDatabase } from "@/lib/database";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const result = getDatabase()
    .prepare("select count(*) as count from users")
    .get() as { count: number };
  return (
    <>
      <p className="eyebrow">Secure account access</p>
      <h1>Sign in.</h1>
      <p className="lede">
        Access your private inventory, tasks, builds, and acquisition plan.
      </p>
      {result.count === 0 ? (
        <p className="notice">
          No account exists yet. Complete <a href="/setup">first-run setup</a>.
        </p>
      ) : (
        <SignInForm />
      )}
    </>
  );
}
