import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { serviceCategories } from "@/components/services/marketing-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, Sparkles } from "lucide-react";

export const Route = createFileRoute("/services/$slug")({
  loader: ({ params }) => {
    const category = serviceCategories.find((c) => c.slug === params.slug);
    if (!category) throw notFound();
    return { category };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Service not found" }, { name: "robots", content: "noindex" }] };
    const { category } = loaderData;
    const title = `${category.title} — IMT Solutions`;
    return {
      meta: [
        { title },
        { name: "description", content: category.blurb },
        { property: "og:title", content: title },
        { property: "og:description", content: category.blurb },
      ],
    };
  },
  component: ServiceDetail,
  notFoundComponent: () => (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-24 text-center">
      <h1 className="font-display text-3xl font-bold">Service not found</h1>
      <p className="mt-2 text-muted-foreground">The service you're looking for doesn't exist.</p>
      <Button asChild className="mt-6"><Link to="/services">Back to all services</Link></Button>
    </div>
  ),
});

function ServiceDetail() {
  const { category } = Route.useLoaderData();
  const others = serviceCategories.filter((c) => c.slug !== category.slug);

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 opacity-[0.07]" style={{ background: "var(--gradient-solar)" }} />
        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <Link to="/services" className="text-sm text-muted-foreground hover:text-foreground">← All services</Link>
          <p className="mt-4 text-xs uppercase tracking-[3px] text-solar font-semibold">{category.tagline}</p>
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight mt-2 max-w-3xl">{category.title}</h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl">{category.blurb}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/auth">Get a Quote <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#packages">View packages</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 md:px-8 py-14 grid gap-10 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <h2 className="font-display text-2xl font-bold">Overview</h2>
          <p className="text-muted-foreground leading-relaxed">{category.overview}</p>
          <h3 className="font-display text-lg font-bold pt-4">What's included</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {category.features.map((f) => (
              <li key={f} className="flex items-start gap-2 p-3 rounded-lg border border-border bg-card">
                <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <span className="text-sm">{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <aside className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-display font-bold">Typical use cases</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {category.useCases.map((u) => (
                  <li key={u} className="flex gap-2"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /><span>{u}</span></li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-display font-bold">Talk to an engineer</h3>
              <p className="text-sm text-muted-foreground mt-2">Scoped quote usually within one working day.</p>
              <Button asChild className="w-full mt-4 text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Link to="/auth">Request a Quote</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </section>

      <section id="packages" className="bg-muted/40 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-16">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[3px] text-solar font-semibold">Packages</p>
            <h2 className="font-display text-3xl font-bold mt-2">Simple pricing, transparent scope</h2>
            <p className="text-muted-foreground mt-2">Every package can be tailored — talk to us for combined bundles across services.</p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {category.packages.map((p) => (
              <div key={p.name} className={`relative rounded-xl border bg-card p-6 flex flex-col ${p.highlight ? "border-solar shadow-lg" : "border-border"}`}>
                {p.highlight && (
                  <span className="absolute -top-3 left-6 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                    <Sparkles className="h-3 w-3" /> Most popular
                  </span>
                )}
                <h3 className="font-display text-xl font-bold">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.summary}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.cadence}</span>
                </div>
                <ul className="mt-5 space-y-2 text-sm flex-1">
                  {p.includes.map((i) => (
                    <li key={i} className="flex gap-2"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /><span>{i}</span></li>
                  ))}
                </ul>
                <Button asChild className={`w-full mt-6 ${p.highlight ? "text-solar-foreground" : ""}`} style={p.highlight ? { background: "var(--gradient-solar)" } : undefined} variant={p.highlight ? "default" : "outline"}>
                  <Link to="/auth">Choose {p.name}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 md:px-8 py-16">
        <h2 className="font-display text-2xl font-bold">Frequently asked</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {category.faqs.map((f) => (
            <div key={f.q} className="rounded-lg border border-border bg-card p-5">
              <p className="font-semibold">{f.q}</p>
              <p className="text-sm text-muted-foreground mt-2">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/40 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-14">
          <h2 className="font-display text-2xl font-bold mb-6">Other services</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {others.map((c) => (
              <Link key={c.slug} to={`/services/${c.slug}` as any} className="block rounded-lg border border-border bg-card p-5 hover:border-solar/50 transition">
                <p className="text-[10px] tracking-[2px] text-solar font-semibold uppercase">{c.tagline}</p>
                <h3 className="font-display font-bold mt-1">{c.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{c.blurb}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
