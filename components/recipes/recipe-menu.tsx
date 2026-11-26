"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeRecipe } from "@/app/(app)/recipes/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function RecipeMenu({ id, title, versionCount }: { id: string; title: string; versionCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  // the URL carries the scale and units (doc §3.5), so the link opens this exact view
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn’t copy. Copy the address bar instead.");
    }
  }

  function onDelete() {
    startTransition(async () => {
      const r = await removeRecipe(id);
      if (r?.error) toast.error(r.error);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Recipe options">
            <Ellipsis className="size-5" strokeWidth={1.5} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 p-1.5">
          <DropdownMenuItem asChild className="py-2 text-[15px]">
            <Link href={`/recipes/${id}/edit`}>Edit recipe</Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="py-2 text-[15px]" onSelect={copyLink}>
            Copy link to this view
          </DropdownMenuItem>
          {/* Version history changes data, so it lives here, away from Reset (doc §2, §8) */}
          <DropdownMenuItem disabled className="flex-col items-start gap-0 py-2">
            <span className="text-[15px]">Version history</span>
            <span className="text-xs text-muted-foreground">
              {versionCount} {versionCount === 1 ? "version" : "versions"} · restoring comes later
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="py-2 text-[15px]"
            onSelect={(e) => {
              e.preventDefault();
              setConfirming(true);
            }}
          >
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the recipe and all {versionCount === 1 ? "its history" : `${versionCount} saved versions`}. It
              can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={(e) => { e.preventDefault(); onDelete(); }}>
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
