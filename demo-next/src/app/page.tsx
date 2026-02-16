import KnowledgeBaseSearch from "@/components/knowledge-base-search";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* ─── Nav ─── */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold tracking-tight">Nextera</span>
            <div className="hidden gap-6 md:flex">
              <a href="#product" className="text-sm text-muted-foreground hover:text-foreground">Product</a>
              <a href="#solutions" className="text-sm text-muted-foreground hover:text-foreground">Solutions</a>
              <a href="#resources" className="text-sm text-muted-foreground hover:text-foreground">Resources</a>
              <a href="#company" className="text-sm text-muted-foreground hover:text-foreground">Company</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href="#signin" className="text-sm text-muted-foreground hover:text-foreground">Sign in</a>
            <a
              href="#get-started"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Get started
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="container mx-auto px-4 py-24 text-center md:py-32">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Build faster with <span className="text-primary">Nextera</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          The modern platform for building, deploying, and scaling web applications.
          Ship features faster with our developer-first tools.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="#trial"
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </a>
          <a
            href="#demo"
            className="inline-flex h-11 items-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Schedule a demo
          </a>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto grid grid-cols-2 gap-8 px-4 py-16 md:grid-cols-4">
          {[
            { label: "Developers", value: "50K+" },
            { label: "Companies", value: "2,000+" },
            { label: "Uptime", value: "99.99%" },
            { label: "Support", value: "24/7" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold">{stat.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="product" className="container mx-auto px-4 py-24">
        <h2 className="text-center text-2xl font-bold md:text-3xl">Everything you need</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
          A complete toolkit for modern web development.
        </p>
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Edge Deployment", desc: "Deploy globally with zero-config edge functions." },
            { title: "Real-time Analytics", desc: "Monitor performance with built-in observability." },
            { title: "Team Collaboration", desc: "Git-based workflows with preview deployments." },
            { title: "Auto Scaling", desc: "Scale from zero to millions without intervention." },
            { title: "Security First", desc: "Enterprise-grade security with SOC 2 compliance." },
            { title: "Developer Tools", desc: "CLI, SDK, and integrations with your favorite tools." },
          ].map((feature) => (
            <div key={feature.title} className="rounded-lg border p-6">
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-24">
          <h2 className="text-center text-2xl font-bold md:text-3xl">What our customers say</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
            Trusted by engineering teams around the world.
          </p>
          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                quote: "Nextera cut our deployment time from hours to seconds. The developer experience is unmatched.",
                name: "Sarah Chen",
                role: "CTO",
                company: "Streamline",
              },
              {
                quote: "We migrated our entire platform in a weekend. The edge functions alone saved us $20K a month.",
                name: "Marcus Rodriguez",
                role: "Lead Engineer",
                company: "Payflow",
              },
              {
                quote: "The real-time analytics and team collaboration features transformed how we ship software.",
                name: "Amira Patel",
                role: "VP of Engineering",
                company: "Boldstart",
              },
            ].map((testimonial) => (
              <figure key={testimonial.name} className="rounded-lg border p-6">
                <blockquote>
                  <p className="text-sm text-muted-foreground">&ldquo;{testimonial.quote}&rdquo;</p>
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium"
                  >
                    {testimonial.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <cite className="not-italic text-sm font-semibold">{testimonial.name}</cite>
                    <p className="text-sm text-muted-foreground">{testimonial.role}, {testimonial.company}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Knowledge Base ─── */}
      <section id="resources" className="border-t bg-muted/20">
        <div className="container mx-auto px-4 py-24">
          <h2 className="text-center text-2xl font-bold md:text-3xl">Knowledge Base</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
            Search our documentation and guides.
          </p>
          <KnowledgeBaseSearch />
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-muted/30 p-12 text-center md:p-16">
          <h2 className="text-2xl font-bold md:text-3xl">
            Ready to get started?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Join thousands of companies already building with Nextera.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="#trial"
              className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start free trial
            </a>
            <a
              href="#contact"
              className="inline-flex h-11 items-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Contact sales
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t">
        <div className="container mx-auto px-4 py-12">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <p className="text-lg font-bold">Nextera</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Building the future of web development.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Product</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Features</a></li>
                <li><a href="#" className="hover:text-foreground">Pricing</a></li>
                <li><a href="#" className="hover:text-foreground">Integrations</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium">Company</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">About</a></li>
                <li><a href="#" className="hover:text-foreground">Blog</a></li>
                <li><a href="#" className="hover:text-foreground">Careers</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium">Legal</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t pt-8 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Nextera. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
