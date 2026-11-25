import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">We’ll email you a link to set a new one.</p>
      </div>
      <ForgotPasswordForm />
    </>
  );
}
