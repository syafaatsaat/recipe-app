import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";

// Signed-in area. proxy.ts redirects signed-out visitors; each page still checks
// the user itself (lib/auth.ts) because the proxy is not a security boundary.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
      <header className="flex h-16 items-center justify-between px-4">
        <Link href="/recipes" className="px-2 text-xs tracking-[0.12em] text-muted-foreground uppercase no-underline">
          Recipes
        </Link>
        <Suspense fallback={<div className="size-11" />}>
          <AccountMenu />
        </Suspense>
      </header>
      {children}
    </div>
  );
}
