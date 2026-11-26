"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function Item({ title, hint, href }: { title: string; hint: string; href?: string }) {
  const body = (
    <span className="flex flex-col">
      <span className="text-[15px] font-medium">{title}</span>
      <span className="text-[13px] text-muted-foreground">{hint}</span>
    </span>
  );
  return href ? (
    <DropdownMenuItem asChild className="py-2">
      <Link href={href}>{body}</Link>
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem disabled className="py-2">
      {body}
    </DropdownMenuItem>
  );
}

export function NewRecipeMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" strokeWidth={1.8} />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <Item title="Import from a link" hint="Coming soon" />
        <Item title="Paste recipe text" hint="Coming soon" />
        <Item title="Write from scratch" hint="Type it line by line" href="/recipes/new" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
