import { createFileRoute, Link } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserCircle2, GitBranch, FileText, Receipt, HardHat, Wallet, ListChecks, PlayCircle, Plug } from "lucide-react";

export const Route = createFileRoute("/getting-started")({
  head: () => ({ meta: [{ title: "Getting Started — RoyEno CRM" }, { name: "description", content: "Step-by-step guide to using the RoyEno Solartech CRM." }] }),
  component: GettingStarted,
});

const steps = [
  { icon: Users, title: "1. Capture a Lead", desc: "Every enquiry — walk-in, phone call, Facebook DM — starts in Leads. Click Add Lead, fill in name, phone, system type and estimated value, set the stage to New.", to: "/leads", cta: "Open Leads" },
  { icon: GitBranch, title: "2. Move it through the Pipeline", desc: "Open the Sales Pipeline to see all leads grouped by stage. Change the dropdown on a card to promote a lead from New → Qualified → Proposal → Won.", to: "/pipeline", cta: "Open Pipeline" },
  { icon: UserCircle2, title: "3. Convert to a Client", desc: "Once a deal is won, create a Client record with their full address, system specs, warranty and installation date. The client page tracks phones, systems and every interaction.", to: "/clients", cta: "Open Clients" },
  { icon: FileText, title: "4. Issue a Quote", desc: "Send a written quote (Q-0001…) with the system summary, total amount and validity date. Track Draft → Sent → Accepted.", to: "/quotes", cta: "Open Quotes" },
  { icon: HardHat, title: "5. Schedule the Installation", desc: "Book the job: assign a crew lead, set the date, mark progress 0–100% as the team works through it.", to: "/installations", cta: "Open Installations" },
  { icon: Receipt, title: "6. Send an Invoice", desc: "Convert the quote into an invoice (INV-0001…). Track partial payments and overdue balances at a glance.", to: "/invoices", cta: "Open Invoices" },
  { icon: Wallet, title: "7. Record the Payment", desc: "When money comes in (cash, EcoCash, bank transfer), record it under Payments with the reference number. Your finance dashboard updates instantly.", to: "/payments", cta: "Open Payments" },
  { icon: ListChecks, title: "8. Stay on top with Tasks", desc: "Use Tasks for every follow-up — site visit, callback, paperwork. Tick them off as you go.", to: "/tasks", cta: "Open Tasks" },
  { icon: Plug, title: "9. (Optional) Connect Zoho Books", desc: "If you already use Zoho Books for accounting, link your account on the Zoho page to mirror customers, invoices, payments and expenses into the CRM.", to: "/zoho", cta: "Open Zoho" },
];

function GettingStarted() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Onboarding" title="Getting Started"
        description="A nine-step walkthrough that takes a brand-new lead all the way to paid invoice. Open each section to try it live."
        actions={
          <Button onClick={() => { localStorage.removeItem("royeno_tour_done"); location.assign("/"); }}>
            <PlayCircle className="h-4 w-4 mr-1.5" />Replay product tour
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((s) => (
          <Card key={s.title} className="hover:shadow-[var(--shadow-elegant)] transition-shadow">
            <CardHeader className="flex flex-row items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-solar/15 text-solar flex items-center justify-center shrink-0">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <CardTitle className="font-display text-lg">{s.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.desc}</p>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full"><Link to={s.to}>{s.cta} →</Link></Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="font-display">Quick tips</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Every list page has search at the top — type a name, phone, system or reference to filter instantly.</p>
          <p>• Click the pencil icon to edit a row, the trash icon to delete it (with a confirmation prompt).</p>
          <p>• Your data is private — Row-Level Security ensures only you can see your own leads, clients and invoices.</p>
          <p>• Use the New button (top right) for a shortcut to create any record from any page.</p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
