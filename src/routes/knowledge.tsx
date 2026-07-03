import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/page";

const VIS = ["internal", "public"];

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export const Route = createFileRoute("/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge Base — IMT Operations" }] }),
  component: KBPage,
});

function KBPage() {
  return (
    <ModulePage
      eyebrow="System"
      title="Knowledge Base"
      description="Internal runbooks, how-tos and product documentation."
      table="kb_articles"
      queryKey="kb_articles"
      searchFields={["title", "slug", "category"]}
      emptyLabel="No articles yet."
      createTitle="New article"
      createLabel="New article"
      emptyForm={{ title: "", slug: "", category: "", content: "", visibility: "internal", published: false, tags: "" }}
      validateForm={(f) => (!f.title ? "Title required" : null)}
      transformInsert={(f) => ({
        title: f.title,
        slug: f.slug?.trim() ? slugify(f.slug) : slugify(f.title) + "-" + Math.random().toString(36).slice(2, 6),
        category: f.category || null,
        content: f.content || "",
        visibility: f.visibility,
        published: !!f.published,
        tags: typeof f.tags === "string" ? f.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : (f.tags || []),
      })}
      columns={[
        { header: "Article", cell: (r: any) => <div><div className="font-semibold">{r.title}</div><div className="text-xs text-muted-foreground font-mono">{r.slug}</div></div> },
        { header: "Category", cell: (r: any) => r.category || "—" },
        { header: "Visibility", cell: (r: any) => <StatusPill tone={r.visibility === "public" ? "info" : "neutral"}>{r.visibility}</StatusPill> },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.published ? "success" : "warning"}>{r.published ? "published" : "draft"}</StatusPill> },
        { header: "Tags", cell: (r: any) => (r.tags && r.tags.length) ? <div className="flex flex-wrap gap-1">{r.tags.slice(0, 3).map((t: string) => <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-muted">{t}</span>)}</div> : "—" },
        { header: "Updated", cell: (r: any) => new Date(r.updated_at).toLocaleDateString() },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Title *</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-2"><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto from title" /></div>
          <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Onboarding, Networking…" /></div>
          <div className="space-y-2"><Label>Visibility</Label>
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VIS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Published</Label>
            <Select value={String(form.published)} onValueChange={(v) => setForm({ ...form, published: v === "true" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No (draft)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2"><Label>Tags (comma-separated)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="firewall, vpn, howto" /></div>
          <div className="col-span-2 space-y-2"><Label>Content (markdown)</Label><Textarea rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
