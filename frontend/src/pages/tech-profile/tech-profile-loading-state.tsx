type TechProfileLoadingStateProps = {
  error: string | null;
  onRetry: () => void;
};

export function TechProfileLoadingState({ error, onRetry }: TechProfileLoadingStateProps) {
  if (error) {
    return (
      <main className="editorial-page editorial-tech-profile min-h-[calc(100vh-4rem)] px-5 py-10 sm:py-14">
        <section className="editorial-empty-state mx-auto max-w-xl border border-border bg-white p-8 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <EditorialButton type="button" onClick={onRetry} className="mt-6">Retry</EditorialButton>
        </section>
      </main>
    );
  }

  return (
    <main className="editorial-page editorial-tech-profile min-h-[calc(100vh-4rem)] px-5 py-10 sm:py-14">
      <p className="mx-auto max-w-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">Loading profile...</p>
    </main>
  );
}
import { EditorialButton } from "@/components/ui/editorial-ui";
