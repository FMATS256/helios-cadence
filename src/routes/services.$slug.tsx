import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { serviceCategories } from "@/components/services/marketing-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check } from "lucide-react";

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
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 md:px-8 py-16 grid gap-10 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <h2 className="font-display text-2xl font-bold">What's included</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {category.features.map((f) => (
              <li key={f} className="flex items-start gap-2 p-4 rounded-lg border border-border bg-card">
                <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <span className="text-sm">{f}</span>
              </li>
            ))}
          </ul>

          <h2 className="font-display text-2xl font-bold pt-6">Why IMT Solutions</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /><span><strong className="text-foreground">Local team, local response.</strong> Engineers on the ground across Zimbabwe — not a call centre offshore.</span></li>
            <li className="flex gap-2"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /><span><strong className="text-foreground">SLA-backed uptime.</strong> Written response and resolution targets, tracked transparently in your portal.</span></li>
            <li className="flex gap-2"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /><span><strong className="text-foreground">One partner, one bill.</strong> All layers of your stack under a single contract and account manager.</span></li>
          </ul>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-display font-bold">Talk to an engineer</h3>
              <p className="text-sm text-muted-foreground mt-2">Get a scoped quote, usually within one working day.</p>
              <Button asChild className="w-full mt-4 text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Link to="/auth">Request a Quote</Link>
              </Button>
            </CardContent>
          </Card>
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />No setup fees</p>
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />24/7 local support</p>
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />Rapid 24-hour deployments</p>
          </div>
        </aside>
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
