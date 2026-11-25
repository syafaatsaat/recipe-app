"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Search text lives in the URL (?q=), so it survives refresh and back. */
export function SearchField() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(v: string) {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (v.trim()) next.set("q", v.trim());
      else next.delete("q");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 250);
  }

  return (
    <label className="flex h-11 items-center gap-2.5 rounded-full border border-input bg-card px-4">
      <Search className="size-[18px] text-muted-foreground" strokeWidth={1.6} aria-hidden />
      <input
        type="search"
        aria-label="Search recipes"
        placeholder="Search recipes"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-[15px]"
      />
    </label>
  );
}
