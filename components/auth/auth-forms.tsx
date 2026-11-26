"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import {
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
  type AuthState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Ids come from useId: Next keeps recently visited pages mounted (hidden), so a
// fixed id="email" on /signup would capture the /login label's htmlFor.
function Field(props: { name: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  const { name, label, hint, ...input } = props;
  const id = `${useId()}${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px] font-normal text-muted-foreground">
        {label}
      </Label>
      <Input id={id} name={name} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function Status({ state }: { state: AuthState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="text-sm">
        {state.message}
      </p>
    );
  return null;
}

const NOTICES: Record<string, string> = {
  link: "That link is invalid or has expired.",
  gone: "That account no longer exists. Sign in with another, or create one.",
};

/** `notice`: the ?error= code a redirect brought ("link", "gone"). */
export function SignInForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, {
    error: notice && Object.hasOwn(NOTICES, notice) ? NOTICES[notice] : undefined,
  });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field name="email" label="Email" type="email" autoComplete="email" required defaultValue={state.fields?.email} />
      <Field name="password" label="Password" type="password" autoComplete="current-password" required />
      <Status state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between text-sm">
        <Link href="/signup" className="text-primary underline underline-offset-3">
          Create an account
        </Link>
        <Link href="/forgot-password" className="text-muted-foreground underline underline-offset-3">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, {});
  if (state.message) return <Status state={state} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field name="email" label="Email" type="email" autoComplete="email" required defaultValue={state.fields?.email} />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="At least 8 characters."
      />
      <Status state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-sm">
        Already have one?{" "}
        <Link href="/login" className="text-primary underline underline-offset-3">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field name="email" label="Email" type="email" autoComplete="email" required />
      <Status state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/login" className="text-sm text-primary underline underline-offset-3">
        Back to sign in
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="At least 8 characters."
      />
      <Status state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
