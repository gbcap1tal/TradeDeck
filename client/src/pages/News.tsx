import { Navbar } from "@/components/layout/Navbar";
import { NewsFeed } from "@/components/stock/NewsFeed";

export default function News() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[800px] mx-auto px-6 py-8">
          <h1 className="text-2xl font-bold tracking-tight text-white mb-6">Latest Market News</h1>
          <NewsFeed symbol="MARKET" />
        </div>
      </main>
    </div>
  );
}
