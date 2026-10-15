import { getDatabase } from "@/lib/database";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const result = getDatabase()
    .prepare("select count(*) as count from users")
    .get() as { count: number };
  return (
    <>
      <p className="eyebrow">Player account</p>
      <h1>Resume your inventory.</h1>
      <p className="lede">
        Your collection and plans belong to this installation and can be
        exported for portability.
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
