"use client";

import { useState } from "react";

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
}

export default function KnowledgeBaseSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <>
      <form onSubmit={handleSearch} className="mx-auto mt-8 flex max-w-md gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs…"
          aria-label="Search documentation"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Search
        </button>
      </form>

      <div className="mx-auto mt-8 max-w-2xl">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {!loading && searched && results.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">No results found.</p>
        )}
        {!loading && results.length > 0 && (
          <div className="grid gap-4">
            {results.map((r) => (
              <div key={r.id} className="rounded-lg border p-4">
                <h3 className="font-medium">{r.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{r.snippet}</p>
                <div className="mt-2 flex gap-2">
                  {r.tags.map((t) => (
                    <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
