import { getDatabase } from "@/lib/database";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const result = getDatabase()
    .prepare("select count(*) as count from users")
    .get() as { count: number };
  return (
    <>
      <p className="eyebrow">Transference link // secure</p>
      <h1>
        Welcome back, <u>Operator.</u>
      </h1>
      <p className="lede">
        Reconnect to your private manifest, directives, builds and Foundry plan.
        Your profile remains exportable and under your control.
      </p>
      {result.count === 0 ? (
        <p className="notice">
          No account exists yet. The operator must complete{" "}
          <a href="/setup">first-run setup</a>.
        </p>
      ) : (
        <SignInForm />
      )}
    </>
  );
}
