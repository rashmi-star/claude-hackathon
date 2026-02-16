import { NextRequest, NextResponse } from "next/server";

// TODO(agent): add caching headers
// TODO(agent): add rate limit
// TODO(agent): normalize and validate q

const DATASET = [
  { id: "1", title: "Getting Started with Next.js", snippet: "Learn how to build modern web apps with the App Router.", tags: ["nextjs", "tutorial"] },
  { id: "2", title: "API Routes in Next.js", snippet: "Create serverless API endpoints with route handlers.", tags: ["api", "backend"] },
  { id: "3", title: "Tailwind CSS Setup", snippet: "Configure Tailwind for your Next.js project.", tags: ["tailwind", "styling"] },
  { id: "4", title: "TypeScript Best Practices", snippet: "Type-safe development with TypeScript.", tags: ["typescript", "dev"] },
  { id: "5", title: "shadcn/ui Components", snippet: "Beautiful, accessible components for your app.", tags: ["ui", "components"] },
  { id: "6", title: "Deployment on Vercel", snippet: "Deploy your Next.js app in minutes.", tags: ["deploy", "vercel"] },
  { id: "7", title: "Server Components", snippet: "Use React Server Components for better performance.", tags: ["rsc", "nextjs"] },
  { id: "8", title: "Middleware in Next.js", snippet: "Run code before requests complete.", tags: ["middleware", "auth"] },
  { id: "9", title: "Environment Variables", snippet: "Manage secrets and config with .env files.", tags: ["config", "env"] },
  { id: "10", title: "Image Optimization", snippet: "Automatic image optimization with next/image.", tags: ["images", "performance"] },
];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const lower = q.toLowerCase().trim();

  const results = lower
    ? DATASET.filter(
        (item) =>
          item.title.toLowerCase().includes(lower) ||
          item.snippet.toLowerCase().includes(lower) ||
          item.tags.some((t) => t.toLowerCase().includes(lower))
      )
    : DATASET;

  return NextResponse.json({ results });
}
