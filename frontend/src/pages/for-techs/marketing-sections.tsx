import { ArrowRight } from "lucide-react";

export function MarketingSections({ onJoin }: { onJoin: () => void }) {
  return (
    <section className="editorial-marketing-cta border-t border-border py-24 text-center">
      <div className="mx-auto max-w-2xl px-5">
        <h2
          className="mb-4 text-4xl font-bold text-[#150E12]"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Ready to grow your book?
        </h2>
        <p className="mb-8 leading-relaxed text-muted-foreground">
          Join nail and lash techs already building their reputation on avoro — for free, today.
        </p>
        <button
          type="button"
          onClick={onJoin}
          className="editorial-marketing-cta__button inline-flex items-center gap-2 rounded-xl px-10 py-4 text-base font-bold transition-colors"
        >
          Create your free profile <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
