import { SearchPromptCard } from "./components/SearchPromptCard";
import { NewsSection } from "./components/NewsSection";
import { CalendarSection } from "./components/CalendarSection";
import { KeywordsCard } from "./components/KeywordsCard";
import { WorldMapCard } from "./components/WorldMapCard";

export default function MainPage() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <SearchPromptCard />
        <KeywordsCard />

        <div className="grid grid-cols-3 gap-4 items-start">
          <div className="col-span-2">
            <WorldMapCard />
          </div>
          <div className="col-span-1 flex flex-col gap-4">
            <CalendarSection />
            <NewsSection />
          </div>
        </div>
      </div>
    </div>
  );
}
