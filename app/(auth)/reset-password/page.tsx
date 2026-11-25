import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "New password" };

// Reached from the reset email via /auth/confirm, which signs the user in first.
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Choose a new password</h1>
      <ResetPasswordForm />
    </>
  );
}
