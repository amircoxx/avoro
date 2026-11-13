import type { Artist } from "@/services/api";

export type ProfileTab = "overview" | "services" | "reviews";

export function ProfileTabs({
  activeTab,
  artist,
  onTabChange
}: {
  activeTab: ProfileTab;
  artist: Artist;
  onTabChange: (tab: ProfileTab) => void;
}) {
  const tabs = [
    ["overview", "Overview"],
    ["services", "Services & Pricing"],
    ["reviews", `Reviews (${artist.reviewCount})`]
  ] as const;

  return (
    <div role="tablist" className="editorial-tabs mb-6">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={activeTab === key}
          onClick={() => onTabChange(key)}
          className={activeTab === key ? "is-active" : ""}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
