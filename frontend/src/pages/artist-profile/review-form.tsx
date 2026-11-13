import type { FormEvent } from "react";
import { EditorialButton } from "@/components/ui/editorial-ui";

export function ReviewForm({
  rating,
  comment,
  isSubmitting,
  onRatingChange,
  onCommentChange,
  onSubmit
}: {
  rating: number;
  comment: string;
  isSubmitting: boolean;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="editorial-panel border border-border bg-white p-5">
      <h3 className="editorial-display mb-4 text-3xl text-foreground">Leave a review</h3>
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <label className="text-sm font-medium text-foreground">
          Rating
          <select value={rating} onChange={(event) => onRatingChange(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary/50">
            {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-foreground">
          Comment
          <textarea value={comment} onChange={(event) => onCommentChange(event.target.value)} className="mt-1.5 min-h-24 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary/50" placeholder="Share what stood out about your appointment." />
        </label>
      </div>
      <EditorialButton type="submit" disabled={isSubmitting} className="mt-4 disabled:opacity-60">{isSubmitting ? "Saving..." : "Submit review"}</EditorialButton>
    </form>
  );
}
