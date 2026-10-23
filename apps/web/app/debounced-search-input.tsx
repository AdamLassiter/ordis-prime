"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function DebouncedSearchInput({
  label,
  parameter,
  value = "",
  placeholder,
  delay = 300,
}: {
  label: string;
  parameter: string;
  value?: string;
  placeholder?: string;
  delay?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(value);
  const [pending, startTransition] = useTransition();
  const firstRender = useRef(true);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = query.trim();
      if (trimmed) next.set(parameter, trimmed);
      else next.delete(parameter);
      startTransition(() =>
        router.replace(`${pathname}?${next.toString()}`, { scroll: false }),
      );
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [delay, parameter, pathname, query, router, searchParams]);

  return (
    <label className="debounced-search">
      {label}
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        onChange={(event) => setQuery(event.target.value)}
      />
      <span aria-live="polite" className="field-status">
        {pending ? "Updating results…" : "Results update as you type"}
      </span>
    </label>
  );
}
