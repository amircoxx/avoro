import { ArrowLeft } from "lucide-react";

type TechProfileEditorHeaderProps = {
  onBack: () => void;
};

export function TechProfileEditorHeader({ onBack }: TechProfileEditorHeaderProps) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to avoro
      </button>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-rose-700">My profile</p>
    </>
  );
}
