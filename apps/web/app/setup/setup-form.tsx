"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ordis-setup-token": String(form.get("setupToken") ?? ""),
      },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    if (response.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setError(
      body.message ?? "Setup failed. Check the token and account details.",
    );
    setPending(false);
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        Display name
        <input name="name" required maxLength={80} autoComplete="name" />
      </label>
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      <label>
        Setup token
        <input
          name="setupToken"
          type="password"
          required
          minLength={24}
          autoComplete="off"
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Creating account…" : "Create administrator"}
      </button>
    </form>
  );
}
