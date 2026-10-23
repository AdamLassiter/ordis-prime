"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";

export function AutoSaveForm({
  action,
  children,
  className,
  delay = 600,
}: {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const [savedRevision, setSavedRevision] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function scheduleSave() {
    window.clearTimeout(timeoutRef.current);
    const revision = ++revisionRef.current;
    timeoutRef.current = window.setTimeout(() => {
      save(revision);
    }, delay);
  }

  function save(revision = revisionRef.current) {
    const form = formRef.current;
    if (!form?.reportValidity()) return;
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    savingRef.current = true;
    setError(undefined);
    const data = new FormData(form);
    startTransition(async () => {
      try {
        await action(data);
        setSavedRevision(revision);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Save failed");
      } finally {
        savingRef.current = false;
        if (queuedRef.current || revisionRef.current > revision) {
          queuedRef.current = false;
          save();
        }
      }
    });
  }

  return (
    <form
      ref={formRef}
      className={className}
      onChange={scheduleSave}
      onInput={scheduleSave}
      onSubmit={(event) => {
        event.preventDefault();
        window.clearTimeout(timeoutRef.current);
        save();
      }}
    >
      {children}
      <span className="field-status" aria-live="polite">
        {error
          ? error
          : pending
            ? "Saving…"
            : savedRevision === revisionRef.current && savedRevision > 0
              ? "Saved"
              : "Changes save automatically"}
      </span>
    </form>
  );
}
