import { EditorialButton } from "@/components/ui/editorial-ui";

type TechProfileEmptyStateProps = {
  onCreate: () => void;
};

export function TechProfileEmptyState({ onCreate }: TechProfileEmptyStateProps) {
  return (
    <main className="editorial-page editorial-tech-profile min-h-[calc(100vh-4rem)] px-5 py-10 sm:py-14">
      <section className="editorial-empty-state mx-auto max-w-xl border border-border bg-white p-8 text-center">
        <p className="editorial-kicker">My profile</p>
        <h1 className="mt-3 text-5xl text-foreground">Create your profile</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Create your profile to start getting discovered.</p>
        <EditorialButton type="button" onClick={onCreate} className="mt-6">Create profile</EditorialButton>
      </section>
    </main>
  );
}
