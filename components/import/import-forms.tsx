"use client";

// The two ways into an import (doc §1): a link the server reads, or pasted text.
// Both end on the review screen (/recipes/import/[jobId]).
import { useSearchParams } from "next/navigation";
import { useActionState, useId } from "react";
import { importFromText, importFromUrl, type ImportState } from "@/app/(app)/recipes/import/actions";
import { Segmented } from "@/components/recipes/view/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MODES = [
  { value: "link", label: "Link" },
  { value: "paste", label: "Paste text" },
] as const;

function FormError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-sm leading-snug text-destructive">
      {message}
    </p>
  ) : null;
}

export function LinkForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importFromUrl, {});
  const id = useId();
  return (
    <form action={action} className="flex flex-col gap-3">
      <Label htmlFor={`${id}url`} className="text-[13px] font-normal text-muted-foreground">
        Recipe link
      </Label>
      <Input
        id={`${id}url`}
        name="url"
        inputMode="url"
        autoComplete="url"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="example.com/lemon-cake"
        defaultValue={state.value}
        key={state.value}
        aria-invalid={!!state.error}
        aria-describedby={state.error ? `${id}error` : undefined}
        required
      />
      <FormError id={`${id}error`} message={state.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Reading the page…" : "Read recipe"}
      </Button>
      <p className="text-[13px] leading-snug text-muted-foreground">
        Works with most recipe sites. If a site won’t let us read it, you can paste the text instead.
      </p>
    </form>
  );
}

/** `fromJob`: the failed link import this replaces, so the recipe keeps its source link. */
export function PasteForm({ fromJob, label = "Recipe text" }: { fromJob?: string; label?: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importFromText, {});
  const id = useId();
  return (
    <form action={action} className="flex flex-col gap-3">
      <Label htmlFor={`${id}text`} className="text-[13px] font-normal text-muted-foreground">
        {label}
      </Label>
      <Textarea
        id={`${id}text`}
        name="text"
        rows={10}
        placeholder={"Lemon cake\n\nIngredients\n1 cup flour\n2 eggs\n\nMethod\nHeat the oven to 350°F…"}
        defaultValue={state.value}
        key={state.value}
        aria-invalid={!!state.error}
        aria-describedby={state.error ? `${id}error` : undefined}
        className="min-h-48 [field-sizing:fixed] text-[15px] leading-normal"
        required
      />
      {fromJob && <input type="hidden" name="fromJob" value={fromJob} />}
      <FormError id={`${id}error`} message={state.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Reading…" : "Read pasted text"}
      </Button>
    </form>
  );
}

export function ImportStart() {
  const params = useSearchParams();
  const mode = params.get("paste") === "1" ? "paste" : "link";
  const setMode = (m: (typeof MODES)[number]["value"]) => {
    const url = new URL(window.location.href);
    if (m === "paste") url.searchParams.set("paste", "1");
    else url.searchParams.delete("paste");
    window.history.replaceState(null, "", url);
  };
  return (
    <div className="flex flex-col gap-6">
      <Segmented label="Import from" options={MODES} value={mode} onChange={setMode} />
      {mode === "link" ? <LinkForm /> : <PasteForm />}
    </div>
  );
}
