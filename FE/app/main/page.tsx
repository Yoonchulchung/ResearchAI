import { Suspense } from "react";
import { SearchPromptCard } from "./components/SearchPromptCard";
import { NewsSection } from "./components/NewsSection";
import { CalendarSection } from "./components/CalendarSection";
import { SummaryCard } from "./components/SummaryCard";
import { WorldMapCard } from "./components/WorldMapCard";
import { MarketCard } from "./components/MarketCard";
import { WeatherCard } from "./components/WeatherCard";
import { EmailCard } from "./components/EmailCard";

export default function MainPage() {
  return (
    <div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
        <SearchPromptCard />
        <MarketCard />
        <SummaryCard />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div className="md:col-span-2 flex flex-col gap-4">
            <WorldMapCard />
            <Suspense>
              <EmailCard />
            </Suspense>
          </div>
          <div className="md:col-span-1 flex flex-col gap-4">
            <WeatherCard />
            <CalendarSection />
            <NewsSection />
          </div>
        </div>
      </div>
    </div>
  );
}
