import { createFileRoute, Link } from "@tanstack/react-router";
import { serviceCategories } from "@/components/services/marketing-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, Clock, Shield, Zap } from "lucide-react";

export const Route = createFileRoute("/services/")({
  head: () => ({
    meta: [
      { title: "IT Services in Zimbabwe — Connectivity, Cloud, Security | IMT Solutions" },
      { name: "description", content: "One local team for connectivity, cloud, VoIP, cyber security, networking and CCTV. SLA-backed, 24/7 support across Zimbabwe." },
      { property: "og:title", content: "Smarter technology. Stronger business. — IMT Solutions" },
      { property: "og:description", content: "Trusted IT partner across Zimbabwe. Connectivity, cloud, cyber security, networking, VoIP and CCTV — engineered, installed and supported by one local team." },
    ],
  }),
  component: ServicesIndex,
});

function ServicesIndex() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07]" style={{ background: "var(--gradient-solar)" }} />
        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-20 md:py-28">
          <p className="text-xs uppercase tracking-[3px] text-solar font-semibold mb-4">Trusted IT partner across Zimbabwe</p>
          <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight max-w-3xl">
            Smarter technology.<br />Stronger business.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Connectivity, cloud, cyber security, networking, VoIP and CCTV — engineered, installed and supported by one local team that actually picks up the phone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              <Link to="/auth">Get a Free Quote <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#services">Explore Services</a>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
            {["No setup fees", "24/7 local support", "SLA-backed uptime", "Rapid 24-hour deployments", "500+ businesses served"].map((t) => (
              <span key={t} className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-success" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section id="services" className="max-w-6xl mx-auto px-4 md:px-8 py-16">
        <p className="text-xs uppercase tracking-[3px] text-solar font-semibold mb-2">What we do</p>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight max-w-2xl">One partner for every layer of your IT stack</h2>
        <p className="mt-4 text-muted-foreground max-w-2xl">From the cable in the ground to the camera on the wall — IMT Solutions designs, deploys and supports the technology that keeps your business running.</p>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {serviceCategories.map((c) => (
            <Card key={c.slug} className="group hover:border-solar/50 transition">
              <CardContent className="p-6 flex flex-col h-full">
                <p className="text-[10px] tracking-[2px] text-solar font-semibold uppercase">{c.tagline}</p>
                <h3 className="font-display text-xl font-bold mt-1">{c.title}</h3>
                <p className="text-sm text-muted-foreground mt-2">{c.blurb}</p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {c.features.map((f) => (
                    <li key={f} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" />{f}</li>
                  ))}
                </ul>
                <div className="mt-6 flex gap-2 pt-4 border-t border-border">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/services/${c.slug}` as any}>Learn more <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/auth">Get a Quote</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="bg-muted/40 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 grid gap-6 md:grid-cols-3">
          {[
            { icon: Clock, title: "Rapid 24-hour deployments", body: "Most sites live within a day of sign-off." },
            { icon: Shield, title: "SLA-backed uptime", body: "Written response and resolution targets, tracked in-portal." },
            { icon: Zap, title: "Local engineers on call", body: "A human on the line, not a queue. 24/7." },
          ].map((f) => (
            <div key={f.title} className="flex gap-4">
              <div className="h-11 w-11 rounded-lg bg-solar/15 text-solar flex items-center justify-center shrink-0"><f.icon className="h-5 w-5" /></div>
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
