import { SearchPromptCard } from "./components/SearchPromptCard";
import { PortfolioList } from "./components/PortfolioList";
import { NewsSection } from "./components/NewsSection";
import { CalendarSection } from "./components/CalendarSection";
import { KeywordsCard } from "./components/KeywordsCard";
import { WorldMapCard } from "./components/WorldMapCard";

export default function MainPage() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        {/* Search prompt — full width */}
        <SearchPromptCard />

        {/* Keywords trend — full width */}
        <KeywordsCard />

        {/* Main content grid */}
        <div className="grid grid-cols-3 gap-4 items-start">
          {/* Left col-span-2: World map + Portfolio stacked */}
          <div className="col-span-2 flex flex-col gap-4">
            <WorldMapCard />
            <PortfolioList />
          </div>

          {/* Right column: Calendar + News stacked */}
          <div className="col-span-1 flex flex-col gap-4">
            <CalendarSection />
            <NewsSection />
          </div>
        </div>
      </div>
    </div>
  );
}
