export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-12">
      <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Recipes</p>
      {children}
    </main>
  );
}
