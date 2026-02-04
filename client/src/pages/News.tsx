import { Navbar } from "@/components/layout/Navbar";
import { NewsFeed } from "@/components/stock/NewsFeed";

export default function News() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="container mx-auto px-4 py-8 flex-1">
        <h1 className="text-3xl font-bold mb-8">Latest Market News</h1>
        <div className="max-w-4xl mx-auto">
          <NewsFeed symbol="MARKET" />
        </div>
      </main>
    </div>
  );
}
