import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  return (
    <SignInForm next={typeof sp.next === "string" ? sp.next : undefined} notice={typeof sp.error === "string" ? sp.error : undefined} />
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="text-3xl font-semibold">Sign in</h1>
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}
