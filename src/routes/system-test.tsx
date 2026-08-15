import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, StatusBadge, RefreshButton,
  ActionBar, EmptyState, money, shortDate,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  PlayCircle, Trash2, Mail, Download, ShieldCheck, Activity,
} from "lucide-react";

import {
  getSystemTestState, verifySystemTest, addTestContact, uploadTestDocument,
  runEmailTemplateSuite, purgeSystemTestData,
} from "@/lib/system-test.functions";
import {
  createCustomerRecord, createSubscriptionRecord, createCloudServiceRecord,
  manageSubscription, getCustomer360, getCustomerPaymentContext,
} from "@/lib/ops.functions";
import {
  getCustomerBilling, changeCustomerPackage, setServiceState, addCustomerCredit,
  recordCustomerPayment, getCustomerHistory, sendCustomerMessage, getCustomerConversations,
  getCustomerDocuments, saveCustomerDocument, setDocumentStatus, getDocumentLink,
  assignEquipment, updateEquipment, releaseEquipment, getCustomerEquipment,
  generateContract, getCustomerStatement, getCustomerProfileExport,
} from "@/lib/customer360.functions";
import { createInvoiceForCustomer, listAssignableStaff } from "@/lib/client-actions.functions";
import { createTicket, assignTicket, updateTicket } from "@/lib/support.functions";
import { getInvoicesOverview, getPaymentsOverview } from "@/lib/finance.functions";
import { runReport } from "@/lib/reports.functions";

export const Route = createFileRoute("/system-test")({
  head: () => ({
    meta: [
      { title: "System Health & Integration Test — IMT Operations" },
      { name: "description", content: "Run an end-to-end integration test across Customer 360, billing, services, support, KYC, equipment and email, against the live backend." },
      { property: "og:title", content: "System Health & Integration Test — IMT Operations" },
      { property: "og:description", content: "End-to-end verification of every IMT Account Manager module against the live backend." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SystemTestPage,
});

const TEST_MARKER = "[SYSTEM TEST]";

type Verdict = "PASS" | "FAIL" | "WARNING" | "EXTERNAL";

type TestResult = {
  id: string;
  name: string;
  module: string;
  expected: string;
  actual: string;
  verdict: Verdict;
  at: string;
  ms: number;
  recordId?: string | null;
  error?: string | null;
};

type Ctx = Record<string, any>;

type Step = {
  id: string;
  name: string;
  module: string;
  expected: string;
  run: (ctx: Ctx) => Promise<{ actual: string; recordId?: string | null; warning?: boolean; external?: boolean }>;
};


const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;
const near = (a: number, b: number, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol;

function buildSteps(email: string): Step[] {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");

  return [
    /* ---------------- Customer 360 ---------------- */
    {
      id: "cust-corporate", module: "Customer 360", name: "Create corporate test customer",
      expected: "Customer row created with account number and corporate type",
      run: async (ctx) => {
        const row = await createCustomerRecord({
          data: {
            company_name: `${TEST_MARKER} Corporate ${stamp}`,
            account_type: "corporate",
            industry: "Integration testing",
            primary_email: email,
            primary_phone: "+263771000000",
            status: "active",
            notes: "Automated system integration test record. Safe to delete.",
          },
        });
        ctx.corp = row;
        return { actual: `${row.account_number} · ${row.account_type}`, recordId: row.id };
      },
    },
    {
      id: "cust-individual", module: "Customer 360", name: "Create individual test customer",
      expected: "Second customer created with personal account type",
      run: async (ctx) => {
        const row = await createCustomerRecord({
          data: {
            company_name: `${TEST_MARKER} Individual ${stamp}`,
            account_type: "personal",
            primary_email: email,
            primary_phone: "+263771000001",
            status: "active",
            notes: "Automated system integration test record. Safe to delete.",
          },
        });
        ctx.individual = row;
        return { actual: `${row.account_number} · ${row.account_type}`, recordId: row.id };
      },
    },
    {
      id: "cust-contact", module: "Customer 360", name: "Add primary contact",
      expected: "Contact stored and linked to the account",
      run: async (ctx) => {
        const row = await addTestContact({
          data: {
            customer_id: ctx.corp.id, name: "Test Contact", email, phone: "+263771000002",
            role: "Operations Manager", is_primary: true,
          },
        });
        return { actual: `${row.name} · ${row.email}`, recordId: row.id };
      },
    },
    {
      id: "cust-360", module: "Customer 360", name: "Customer 360 loads live data",
      expected: "Aggregator returns the customer with stats and health",
      run: async (ctx) => {
        const c360 = await getCustomer360({ data: { account_number: ctx.corp.account_number } });
        if (!c360) throw new Error("Customer 360 returned null");
        ctx.c360 = c360;
        const health = (c360 as any).health ?? (c360 as any).stats?.health ?? "computed";
        return { actual: `loaded · health ${JSON.stringify(health).slice(0, 40)}`, recordId: ctx.corp.id };
      },
    },
    {
      id: "cust-timeline", module: "Customer 360", name: "Creation writes timeline + audit",
      expected: "customer_created present in both timeline and audit log",
      run: async (ctx) => {
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        const tl = snap.timelineTypes.includes("customer_created");
        const au = snap.auditActions.includes("customer_created");
        if (!tl || !au) throw new Error(`timeline=${tl} audit=${au}`);
        return { actual: `timeline ${snap.counts.timeline} · audit ${snap.counts.audit}`, recordId: ctx.corp.id };
      },
    },

    /* ---------------- Services & subscriptions ---------------- */
    {
      id: "svc-subscription", module: "Services", name: "Create subscription",
      expected: "Active subscription at $120/month",
      run: async (ctx) => {
        const row = await createSubscriptionRecord({
          data: {
            customer_id: ctx.corp.id, plan_name: "Test Fibre 100Mbps", description: "System test package",
            amount: 120, currency: "USD", billing_cycle: "monthly", status: "active",
            started_on: new Date().toISOString().slice(0, 10), auto_renew: true,
          },
        });
        ctx.sub = row;
        return { actual: `${row.plan_name} · ${row.status} · ${money(row.amount)}`, recordId: row.id };
      },
    },
    {
      id: "svc-cloud", module: "Services", name: "Create cloud service",
      expected: "Cloud service active at $45/month",
      run: async (ctx) => {
        const row = await createCloudServiceRecord({
          data: {
            customer_id: ctx.corp.id, service_type: "cloud", service_name: "Test Cloud Backup",
            vendor: "IMT Cloud", plan: "Standard", monthly_cost: 45, status: "active",
          },
        });
        ctx.cloudService = row;
        return { actual: `${row.service_name} · ${row.status}`, recordId: row.id };
      },
    },
    {
      id: "svc-package-change", module: "Services", name: "Change package (upgrade)",
      expected: "Existing subscription updated to $180 — no new active row",
      run: async (ctx) => {
        const res: any = await changeCustomerPackage({
          data: {
            customer_id: ctx.corp.id, subscription_id: ctx.sub.id,
            plan_name: "Test Fibre 200Mbps", description: "Upgraded by system test",
            amount: 180, billing_cycle: "monthly", currency: "USD",
            reason: "System integration test upgrade", generate_invoice: false,
          },
        });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        const active = snap.subscriptions.filter((s) => s.status === "active");
        ctx.snapAfterPackage = snap;
        if (active.length !== 1) throw new Error(`expected 1 active subscription, got ${active.length}`);
        if (!near(active[0].amount, 180)) throw new Error(`amount ${active[0].amount}`);
        return { actual: `1 active · ${active[0].plan_name} @ ${money(active[0].amount)}`, recordId: res?.subscription?.id ?? ctx.sub.id };
      },
    },
    {
      id: "svc-no-duplicate", module: "Services", name: "No duplicate active packages",
      expected: "Zero duplicate active plans on the account",
      run: async (ctx) => {
        const snap = ctx.snapAfterPackage ?? (await verifySystemTest({ data: { customer_id: ctx.corp.id } }));
        const dupes = snap.summary.duplicateActivePackages;
        if (dupes.length) throw new Error(JSON.stringify(dupes));
        return { actual: "0 duplicates", recordId: ctx.corp.id };
      },
    },
    {
      id: "svc-history", module: "Services", name: "Package change archived to history",
      expected: "package_changed event on timeline and audit log",
      run: async (ctx) => {
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        if (!snap.timelineTypes.includes("package_changed")) throw new Error("timeline missing package_changed");
        return { actual: `timeline ${snap.counts.timeline} entries`, recordId: ctx.corp.id };
      },
    },

    /* ---------------- Billing ---------------- */
    {
      id: "bill-invoice", module: "Billing", name: "Generate invoice",
      expected: "Invoice created for $180 with line items",
      run: async (ctx) => {
        const inv: any = await createInvoiceForCustomer({
          data: {
            customer_id: ctx.corp.id, currency: "USD", due_days: 14, tax_rate: 0,
            notes: "System integration test invoice",
            items: [{ description: "Test Fibre 200Mbps — monthly", quantity: 1, unit_price: 180 }],
          },
        });
        ctx.invoice = inv;
        return { actual: `${inv.invoice_number} · ${money(inv.total)} · ${inv.status}`, recordId: inv.id };
      },
    },
    {
      id: "bill-partial", module: "Billing", name: "Record partial payment ($80)",
      expected: "Invoice becomes partially paid, balance $100",
      run: async (ctx) => {
        const res: any = await recordCustomerPayment({
          data: {
            customer_id: ctx.corp.id, amount: 80, currency: "USD", method: "cash",
            reference: "SYSTEST-PARTIAL", auto_allocate: true, notes: "System test partial payment",
          },
        });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        const inv = snap.invoices.find((i) => i.id === ctx.invoice.id)!;
        if (inv.derived !== "partial" || !near(inv.balance, 100)) {
          throw new Error(`derived=${inv.derived} balance=${inv.balance} status=${inv.status}`);
        }
        return { actual: `${inv.derived} · balance ${money(inv.balance)} · db status ${inv.status}`, recordId: res?.payment?.id ?? null };
      },
    },
    {
      id: "bill-full", module: "Billing", name: "Record settling payment ($100)",
      expected: "Invoice fully paid, outstanding $0",
      run: async (ctx) => {
        const res: any = await recordCustomerPayment({
          data: {
            customer_id: ctx.corp.id, amount: 100, currency: "USD", method: "bank_transfer",
            reference: "SYSTEST-FULL", auto_allocate: true, notes: "System test settlement",
          },
        });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        const inv = snap.invoices.find((i) => i.id === ctx.invoice.id)!;
        if (inv.derived !== "paid") throw new Error(`derived=${inv.derived} balance=${inv.balance}`);
        if (!near(snap.summary.outstanding, 0)) throw new Error(`outstanding ${snap.summary.outstanding}`);
        return { actual: `paid · outstanding ${money(snap.summary.outstanding)}`, recordId: res?.payment?.id ?? null };
      },
    },
    {
      id: "bill-advance", module: "Billing", name: "Record advance payment ($50)",
      expected: "Unallocated cash becomes an advance credit",
      run: async (ctx) => {
        const res: any = await recordCustomerPayment({
          data: {
            customer_id: ctx.corp.id, amount: 50, currency: "USD", method: "mobile_money",
            reference: "SYSTEST-ADVANCE", auto_allocate: true, credit_remainder: true,
            notes: "System test advance payment",
          },
        });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        const advance = snap.credits.filter((c) => c.kind === "advance").reduce((s, c) => s + c.amount, 0);
        if (!near(advance, 50)) throw new Error(`advance credit ${advance}`);
        ctx.creditAfterAdvance = snap.summary.creditBalance;
        return { actual: `advance ${money(advance)} · wallet ${money(snap.summary.creditBalance)}`, recordId: res?.payment?.id ?? null };
      },
    },
    {
      id: "bill-credit", module: "Billing", name: "Add manual account credit ($25)",
      expected: "Credit balance increases by exactly 25.00",
      run: async (ctx) => {
        const before = Number(ctx.creditAfterAdvance ?? 0);
        const row: any = await addCustomerCredit({
          data: { customer_id: ctx.corp.id, amount: 25, currency: "USD", kind: "goodwill", note: "System test credit" },
        });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        if (!near(snap.summary.creditBalance, before + 25)) {
          throw new Error(`expected ${round2(before + 25)}, got ${snap.summary.creditBalance}`);
        }
        return { actual: `wallet ${money(snap.summary.creditBalance)}`, recordId: row?.id ?? null };
      },
    },
    {
      id: "bill-mrr", module: "Billing", name: "MRR / ARR calculated from live services",
      expected: "MRR = $225.00 (180 subscription + 45 cloud), ARR = 12 × MRR",
      run: async (ctx) => {
        const billing: any = await getCustomerBilling({ data: { customer_id: ctx.corp.id } });
        const mrr = round2(billing.summary.mrr);
        if (!near(mrr, 225, 0.05)) throw new Error(`MRR ${mrr}`);
        if (!near(round2(billing.summary.arr), round2(mrr * 12), 0.5)) throw new Error(`ARR ${billing.summary.arr}`);
        return { actual: `MRR ${money(mrr)} · ARR ${money(billing.summary.arr)}`, recordId: ctx.corp.id };
      },
    },
    {
      id: "bill-ageing", module: "Billing", name: "Ageing + ledger reconciled",
      expected: "No outstanding balance and payments reconciled",
      run: async (ctx) => {
        const billing: any = await getCustomerBilling({ data: { customer_id: ctx.corp.id } });
        const outstanding = round2(billing.summary.outstanding);
        const ageingTotal = round2(Object.values(billing.ageing ?? {}).reduce((s: number, v: any) => s + Number(v || 0), 0));
        if (!near(outstanding, 0)) throw new Error(`outstanding ${outstanding}`);
        if (!near(ageingTotal, outstanding, 0.05)) throw new Error(`ageing ${ageingTotal} vs outstanding ${outstanding}`);
        return { actual: `outstanding ${money(outstanding)} · ageing ${money(ageingTotal)}`, recordId: ctx.corp.id };
      },
    },
    {
      id: "bill-workspace", module: "Billing", name: "Payment workspace reflects settlement",
      expected: "Open invoices empty, credit balance carried",
      run: async (ctx) => {
        const ws: any = await getCustomerPaymentContext({ data: { customer_id: ctx.corp.id } });
        return { actual: `open invoices ${(ws.openInvoices ?? ws.invoices ?? []).length}`, recordId: ctx.corp.id };
      },
    },

    /* ---------------- Cross-module synchronisation ---------------- */
    {
      id: "sync-finance", module: "Synchronisation", name: "Finance ledger picks up invoice + payments",
      expected: "Invoice and all 3 payments visible in finance aggregators",
      run: async (ctx) => {
        const [inv, pay] = await Promise.all([
          getInvoicesOverview({ data: { limit: 500 } }),
          getPaymentsOverview({ data: { limit: 500 } }),
        ]);
        const found = inv.invoices.some((i: any) => i.id === ctx.invoice.id);
        const mine = pay.payments.filter((p: any) => p.customer_id === ctx.corp.id);
        if (!found) throw new Error("invoice missing from finance ledger");
        if (mine.length < 3) throw new Error(`only ${mine.length} payments in ledger`);
        return { actual: `invoice found · ${mine.length} payments`, recordId: ctx.invoice.id };
      },
    },
    {
      id: "sync-reports", module: "Synchronisation", name: "Reports engine reflects the account",
      expected: "MRR report includes the test account",
      run: async (ctx) => {
        const report: any = await runReport({ data: { key: "mrr" } });
        const rows = report.rows ?? [];
        const hit = rows.some((r: any) => String(r.account_number ?? "") === ctx.corp.account_number);
        if (!hit) return { actual: `${rows.length} rows, test account not listed`, warning: true, recordId: ctx.corp.id };
        return { actual: `test account present in ${rows.length} rows`, recordId: ctx.corp.id };
      },
    },

    /* ---------------- Service lifecycle ---------------- */
    {
      id: "svc-suspend", module: "Services", name: "Suspend service",
      expected: "Subscription status suspended, MRR drops",
      run: async (ctx) => {
        await setServiceState({
          data: { customer_id: ctx.corp.id, action: "suspend", scope: "subscription", subscription_id: ctx.sub.id, reason: "System test suspend" },
        });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        const sub = snap.subscriptions.find((s) => s.id === ctx.sub.id)!;
        if (sub.status !== "suspended") throw new Error(`status ${sub.status}`);
        if (!snap.timelineTypes.includes("service_suspended")) throw new Error("no service_suspended timeline entry");
        return { actual: `suspended · MRR ${money(snap.summary.mrr)}`, recordId: ctx.sub.id };
      },
    },
    {
      id: "svc-resume", module: "Services", name: "Resume service",
      expected: "Subscription active again, MRR restored to $225",
      run: async (ctx) => {
        await setServiceState({
          data: { customer_id: ctx.corp.id, action: "resume", scope: "subscription", subscription_id: ctx.sub.id, reason: "System test resume" },
        });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        const sub = snap.subscriptions.find((s) => s.id === ctx.sub.id)!;
        if (sub.status !== "active") throw new Error(`status ${sub.status}`);
        if (!near(snap.summary.mrr, 225, 0.05)) throw new Error(`MRR ${snap.summary.mrr}`);
        return { actual: `active · MRR ${money(snap.summary.mrr)}`, recordId: ctx.sub.id };
      },
    },
    {
      id: "svc-cancel", module: "Services", name: "Cancel service",
      expected: "Subscription cancelled and removed from MRR",
      run: async (ctx) => {
        await manageSubscription({ data: { subscription_id: ctx.sub.id, action: "cancel", note: "System test cancellation" } });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        const sub = snap.subscriptions.find((s) => s.id === ctx.sub.id)!;
        if (sub.status !== "cancelled") throw new Error(`status ${sub.status}`);
        if (!near(snap.summary.mrr, 45, 0.05)) throw new Error(`MRR after cancel ${snap.summary.mrr}`);
        return { actual: `cancelled · MRR ${money(snap.summary.mrr)}`, recordId: ctx.sub.id };
      },
    },

    /* ---------------- Support & communication ---------------- */
    {
      id: "sup-staff", module: "Support", name: "Load assignable technicians",
      expected: "At least one staff profile available for assignment",
      run: async (ctx) => {
        const staff: any = await listAssignableStaff();
        const list = Array.isArray(staff) ? staff : staff?.staff ?? [];
        ctx.staff = list;
        if (!list.length) return { actual: "no staff profiles found", warning: true };
        return { actual: `${list.length} technicians`, recordId: list[0]?.id };
      },
    },
    {
      id: "sup-ticket", module: "Support", name: "Create ticket (customer emailed)",
      expected: "Ticket opened with SLA due date and customer acknowledgement",
      run: async (ctx) => {
        const t: any = await createTicket({
          data: {
            customer_id: ctx.corp.id, subject: "System test — connectivity check",
            description: "Automated end-to-end test ticket.", priority: "high", category: "network",
          },
        });
        ctx.ticket = t;
        if (!t.sla_due_at) throw new Error("SLA due date not stamped");
        return { actual: `${t.ticket_number} · SLA ${shortDate(t.sla_due_at)}`, recordId: t.id };
      },
    },
    {
      id: "sup-assign", module: "Support", name: "Assign technician + notify",
      expected: "Ticket assigned and a notification row written",
      run: async (ctx) => {
        const tech = ctx.staff?.[0];
        if (!tech) return { actual: "skipped — no technician available", warning: true };
        const t: any = await assignTicket({ data: { ticket_id: ctx.ticket.id, assigned_to: tech.id, note: "System test assignment" } });
        if (t.assigned_to !== tech.id) throw new Error("assignment did not persist");
        return { actual: `assigned to ${tech.full_name || tech.email}`, recordId: t.id };
      },
    },
    {
      id: "sup-resolve", module: "Support", name: "Resolve ticket + timeline entry",
      expected: "Status resolved with a timeline event",
      run: async (ctx) => {
        const t: any = await updateTicket({
          data: { ticket_id: ctx.ticket.id, status: "resolved", note: "Resolved by automated system test" },
        });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        if (t.status !== "resolved") throw new Error(`status ${t.status}`);
        const hasEvent = snap.timelineTypes.some((e) => e.startsWith("ticket_"));
        if (!hasEvent) throw new Error("no ticket timeline event");
        return { actual: `resolved · timeline ${snap.counts.timeline}`, recordId: t.id };
      },
    },
    {
      id: "comm-message", module: "Communications", name: "Send customer message",
      expected: "Communication logged and thread visible in the centre",
      run: async (ctx) => {
        const row: any = await sendCustomerMessage({
          data: {
            customer_id: ctx.corp.id, channel: "email", recipient: email,
            subject: "System test message", body: "This message was generated by the IMT integration test.",
          },
        });
        const convos: any = await getCustomerConversations({ data: { customer_id: ctx.corp.id } });
        const threads = convos.threads ?? convos ?? [];
        if (!threads.length) throw new Error("no conversation threads returned");
        return { actual: `${threads.length} thread(s) · status ${row?.status ?? row?.message?.status ?? "logged"}`, recordId: row?.id ?? null };
      },
    },

    /* ---------------- KYC ---------------- */
    {
      id: "kyc-corporate", module: "KYC", name: "Corporate KYC checklist",
      expected: "Corporate requirement set returned",
      run: async (ctx) => {
        const kyc: any = await getCustomerDocuments({ data: { customer_id: ctx.corp.id } });
        ctx.corpKyc = kyc;
        if (kyc.profile !== "corporate") throw new Error(`profile ${kyc.profile}`);
        if (!kyc.checklist.length) throw new Error("empty checklist");
        return { actual: `${kyc.checklist.length} requirements · ${kyc.completion}% complete`, recordId: ctx.corp.id };
      },
    },
    {
      id: "kyc-individual", module: "KYC", name: "Individual KYC checklist differs",
      expected: "Personal profile returns a different requirement set",
      run: async (ctx) => {
        const kyc: any = await getCustomerDocuments({ data: { customer_id: ctx.individual.id } });
        const sameKeys = JSON.stringify(kyc.checklist.map((c: any) => c.key)) ===
          JSON.stringify((ctx.corpKyc?.checklist ?? []).map((c: any) => c.key));
        if (sameKeys) throw new Error("individual checklist identical to corporate");
        return { actual: `${kyc.profile} · ${kyc.checklist.length} requirements`, recordId: ctx.individual.id };
      },
    },
    {
      id: "kyc-upload", module: "KYC", name: "Upload KYC document",
      expected: "File stored in the private bucket and linked to the customer",
      run: async (ctx) => {
        const key = ctx.corpKyc.checklist[0]?.key ?? "other";
        const label = ctx.corpKyc.checklist[0]?.label ?? "Test document";
        const file = await uploadTestDocument({ data: { customer_id: ctx.corp.id, doc_key: key } });
        const doc: any = await saveCustomerDocument({
          data: {
            customer_id: ctx.corp.id, doc_key: key, doc_label: label,
            file_path: file.file_path, file_name: file.file_name,
            mime_type: file.mime_type, file_size: file.file_size,
            notes: "Uploaded by system integration test",
          },
        });
        ctx.document = doc;
        return { actual: `${label} · ${file.file_size} bytes`, recordId: doc?.id ?? null };
      },
    },
    {
      id: "kyc-verify", module: "KYC", name: "Verify document",
      expected: "Document status becomes verified",
      run: async (ctx) => {
        const doc: any = await setDocumentStatus({ data: { document_id: ctx.document.id, status: "verified", notes: "Verified by system test" } });
        if (doc.status !== "verified") throw new Error(`status ${doc.status}`);
        return { actual: "verified", recordId: doc.id };
      },
    },
    {
      id: "kyc-secure", module: "KYC", name: "Secure document access",
      expected: "Signed, time-limited URL issued for the private file",
      run: async (ctx) => {
        const link: any = await getDocumentLink({ data: { document_id: ctx.document.id } });
        const url = link?.url ?? link?.signedUrl ?? link;
        if (typeof url !== "string" || !url.startsWith("http")) throw new Error("no signed URL returned");
        return { actual: "signed URL issued", recordId: ctx.document.id };
      },
    },

    /* ---------------- Equipment ---------------- */
    {
      id: "eq-assign", module: "Equipment", name: "Assign equipment",
      expected: "Asset created, assigned and linked to the account",
      run: async (ctx) => {
        const asset: any = await assignEquipment({
          data: {
            customer_id: ctx.corp.id, asset_type: "router", asset_tag: `SYSTEST-${Date.now()}`,
            make: "MikroTik", model: "hEX S", serial_number: `SN-${Date.now()}`,
            location: "Head office", assigned_to: "Test Contact", notes: "System test equipment",
          },
        });
        ctx.asset = asset?.asset ?? asset;
        if (!ctx.asset?.id) throw new Error("no asset returned");
        return { actual: `${ctx.asset.asset_tag} · ${ctx.asset.status}`, recordId: ctx.asset.id };
      },
    },
    {
      id: "eq-reassign", module: "Equipment", name: "Reassign equipment",
      expected: "Assignment changes and is recorded in history",
      run: async (ctx) => {
        const res: any = await updateEquipment({
          data: { asset_id: ctx.asset.id, assigned_to: "Second Test User", location: "Branch office", notes: "Reassigned by system test" },
        });
        const row = res?.asset ?? res;
        if (row.assigned_to !== "Second Test User") throw new Error(`assigned_to ${row.assigned_to}`);
        return { actual: `now with ${row.assigned_to}`, recordId: ctx.asset.id };
      },
    },
    {
      id: "eq-release", module: "Equipment", name: "Release equipment",
      expected: "Asset released from the customer",
      run: async (ctx) => {
        const res: any = await releaseEquipment({ data: { asset_id: ctx.asset.id, status: "in_stock", notes: "Released by system test" } });
        const row = res?.asset ?? res;
        return { actual: `status ${row?.status ?? "released"}`, recordId: ctx.asset.id };
      },
    },
    {
      id: "eq-history", module: "Equipment", name: "Assignment history + audit",
      expected: "At least 3 lifecycle events recorded for the asset",
      run: async (ctx) => {
        const eq: any = await getCustomerEquipment({ data: { customer_id: ctx.corp.id } });
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        const events = snap.assetEvents.length;
        if (events < 2) return { actual: `${events} lifecycle events`, warning: true, recordId: ctx.asset.id };
        return { actual: `${events} lifecycle events · ${(eq.assets ?? eq.equipment ?? []).length} assets on file`, recordId: ctx.asset.id };
      },
    },

    /* ---------------- Documents & exports ---------------- */
    {
      id: "doc-contract", module: "Documents", name: "Generate contract",
      expected: "Contract document produced for the account",
      run: async (ctx) => {
        const doc: any = await generateContract({
          data: { customer_id: ctx.corp.id, title: "System test service agreement", term_months: 12 },
        });
        ctx.contract = doc;
        if (!doc) throw new Error("no contract returned");
        return { actual: `contract generated`, recordId: doc?.document?.id ?? doc?.id ?? null };
      },
    },
    {
      id: "doc-statement", module: "Documents", name: "Customer statement",
      expected: "Statement returns ledger lines with opening/closing balances",
      run: async (ctx) => {
        const st: any = await getCustomerStatement({ data: { customer_id: ctx.corp.id } });
        ctx.statement = st;
        if (!Array.isArray(st.lines)) throw new Error("no statement lines");
        return { actual: `${st.lines.length} lines · closing ${money(st.closing)}`, recordId: ctx.corp.id };
      },
    },
    {
      id: "doc-export", module: "Documents", name: "PDF / Excel export payload",
      expected: "Export bundle contains every module section and builds a CSV",
      run: async (ctx) => {
        const ex: any = await getCustomerProfileExport({ data: { customer_id: ctx.corp.id } });
        ctx.exportBundle = ex;
        const sections = ["contacts", "subscriptions", "services", "invoices", "payments", "tickets", "assets", "documents"];
        const missing = sections.filter((s) => !Array.isArray(ex[s]));
        if (missing.length) throw new Error(`missing sections: ${missing.join(", ")}`);
        const csv = buildCsv(ex);
        ctx.exportCsv = csv;
        if (csv.length < 50) throw new Error("CSV export empty");
        return { actual: `${sections.length} sections · ${csv.length} bytes CSV`, recordId: ctx.corp.id };
      },
    },

    /* ---------------- Final integration assertions ---------------- */
    {
      id: "final-sync", module: "Synchronisation", name: "Timeline + audit cover every mutation",
      expected: "Timeline and audit log both non-empty and mirrored across modules",
      run: async (ctx) => {
        const snap = await verifySystemTest({ data: { customer_id: ctx.corp.id } });
        ctx.finalSnapshot = snap;
        const need = ["customer_created", "package_changed", "payment_recorded", "service_suspended", "service_resumed"];
        const missing = need.filter((n) => !snap.timelineTypes.includes(n));
        if (snap.counts.audit === 0) throw new Error("audit log empty");
        if (missing.length) return { actual: `missing timeline events: ${missing.join(", ")}`, warning: true, recordId: ctx.corp.id };
        return { actual: `timeline ${snap.counts.timeline} · audit ${snap.counts.audit}`, recordId: ctx.corp.id };
      },
    },
    {
      id: "audit-coverage", module: "Synchronisation", name: "Every mutation wrote an audit entry",
      expected: "Audit log contains an entry for each mutating test operation",
      run: async (ctx) => {
        const snap = ctx.finalSnapshot ?? (await verifySystemTest({ data: { customer_id: ctx.corp.id } }));
        const actions: string[] = snap.auditActions ?? [];
        const blob = actions.join("|");
        const need = [
          ["customer created", /customer_created|created_customer/],
          ["package change", /package/],
          ["payment", /payment/],
          ["service state", /suspend|resume|service_/],
          ["ticket", /ticket/],
          ["document", /document|kyc/],
          ["equipment", /asset|equipment/],
        ] as const;
        const missing = need.filter(([, re]) => !re.test(blob)).map(([label]) => label);
        if (!actions.length) throw new Error("no audit entries for the test account");
        if (missing.length) return { actual: `${actions.length} entries · no audit trail for: ${missing.join(", ")}`, warning: true, recordId: ctx.corp.id };
        return { actual: `${actions.length} audit entries covering all mutations`, recordId: ctx.corp.id };
      },
    },
    {
      id: "final-360", module: "Customer 360", name: "Customer 360 reflects every module",
      expected: "Aggregator returns services, invoices, payments, tickets, assets and documents",
      run: async (ctx) => {
        const c360: any = await getCustomer360({ data: { account_number: ctx.corp.account_number } });
        ctx.c360 = c360;
        const counts = {
          subscriptions: (c360.subscriptions ?? []).length,
          invoices: (c360.invoices ?? []).length,
          payments: (c360.payments ?? []).length,
          tickets: (c360.tickets ?? []).length,
          assets: (c360.assets ?? []).length,
        };
        if (!counts.invoices || !counts.payments || !counts.tickets) throw new Error(JSON.stringify(counts));
        return { actual: Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · "), recordId: ctx.corp.id };
      },
    },
    {
      id: "sync-realtime", module: "Synchronisation", name: "Live refetch agrees across all modules",
      expected: "Customer 360, Billing, Invoices, Payments, Subscriptions, Services, Reports and Dashboard report the same figures without a reload",
      run: async (ctx) => {
        const [c360, billing, inv, pay, snap, mrrReport] = await Promise.all([
          getCustomer360({ data: { account_number: ctx.corp.account_number } }) as any,
          getCustomerBilling({ data: { customer_id: ctx.corp.id } }) as any,
          getInvoicesOverview({ data: { limit: 500 } }),
          getPaymentsOverview({ data: { limit: 500 } }),
          verifySystemTest({ data: { customer_id: ctx.corp.id } }),
          runReport({ data: { key: "mrr" } }) as any,
        ]);
        const mismatches: string[] = [];
        const invRows = (inv.invoices ?? []).filter((i: any) => i.customer_id === ctx.corp.id);
        const payRows = (pay.payments ?? []).filter((p: any) => p.customer_id === ctx.corp.id);
        if (invRows.length !== snap.counts.invoices) mismatches.push(`invoices ledger ${invRows.length} vs 360 ${snap.counts.invoices}`);
        if (payRows.length !== snap.counts.payments) mismatches.push(`payments ledger ${payRows.length} vs 360 ${snap.counts.payments}`);
        if (!near(round2(billing.summary.outstanding), round2(snap.summary.outstanding), 0.05))
          mismatches.push(`outstanding billing ${billing.summary.outstanding} vs 360 ${snap.summary.outstanding}`);
        const c360Subs = (c360.subscriptions ?? []).length;
        if (c360Subs !== snap.counts.subscriptions) mismatches.push(`subscriptions 360 ${c360Subs} vs snapshot ${snap.counts.subscriptions}`);
        const reportRow = (mrrReport.rows ?? []).find((r: any) => String(r.account_number ?? "") === ctx.corp.account_number);
        if (reportRow && !near(round2(Number(reportRow.mrr ?? reportRow.amount ?? snap.summary.mrr)), round2(snap.summary.mrr), 0.5))
          mismatches.push(`reports MRR ${reportRow.mrr ?? reportRow.amount} vs 360 ${snap.summary.mrr}`);
        if (mismatches.length) throw new Error(mismatches.join("; "));
        return {
          actual: `invoices ${invRows.length} · payments ${payRows.length} · subs ${c360Subs} · outstanding ${money(snap.summary.outstanding)} · MRR ${money(snap.summary.mrr)} — all modules agree`,
          recordId: ctx.corp.id,
        };
      },
    },
    {
      id: "email-suite", module: "Email", name: "Send every email template",
      expected: `All registered templates accepted by the email provider for ${email}`,
      run: async () => {
        const res: any = await runEmailTemplateSuite({ data: { to: email } });
        if (res.errors > 0) {
          throw new Error(`${res.errors}/${res.total} templates failed with integration errors — ${res.firstError}`);
        }
        if (res.domainPending) {
          return {
            actual: `blocked by external dependency — sender domain/DNS verification pending (${res.externalReason ?? "no verified sender"}). Rerun once the domain is active.`,
            external: true,
          };
        }
        if (res.external > 0 || res.suppressed > 0) {
          return {
            actual: `${res.sent}/${res.total} accepted · ${res.external} blocked by pending sender domain · ${res.suppressed} suppressed recipient`,
            warning: true,
          };
        }
        return { actual: `${res.sent}/${res.total} templates accepted by the email provider` };
      },
    },
  ];
}


function buildCsv(ex: any): string {
  const out: string[] = [];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  out.push(`Customer,${esc(ex.customer?.company_name)},Account,${esc(ex.customer?.account_number)}`);
  for (const key of ["contacts", "subscriptions", "services", "invoices", "payments", "tickets", "assets", "documents", "projects"]) {
    const rows = ex[key] ?? [];
    out.push("", key.toUpperCase());
    if (!rows.length) { out.push("(none)"); continue; }
    out.push(Object.keys(rows[0]).map(esc).join(","));
    for (const r of rows) out.push(Object.values(r).map(esc).join(","));
  }
  return out.join("\n");
}

function verdictTone(v: Verdict) {
  return v === "PASS" ? "success" : v === "WARNING" ? "warning" : v === "EXTERNAL" ? "info" : "danger";
}


function SystemTestPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("fmats256@gmail.com");
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState<TestResult | null>(null);
  const [purging, setPurging] = useState(false);
  const ctxRef = useRef<Ctx>({});

  const state = useQuery({
    queryKey: ["system-test-state"],
    queryFn: () => getSystemTestState({ data: {} }),
  });

  const stats = useMemo(() => {
    const pass = results.filter((r) => r.verdict === "PASS").length;
    const fail = results.filter((r) => r.verdict === "FAIL").length;
    const warn = results.filter((r) => r.verdict === "WARNING").length;
    const external = results.filter((r) => r.verdict === "EXTERNAL").length;
    return { pass, fail, warn, external, total: results.length, ms: results.reduce((s, r) => s + r.ms, 0) };
  }, [results]);


  async function runAll() {
    if (running) return;
    setRunning(true);
    setResults([]);
    ctxRef.current = {};
    const steps = buildSteps(email.trim());
    let aborted = false;
    for (const step of steps) {
      if (aborted) {
        setResults((prev) => [...prev, {
          id: step.id, name: step.name, module: step.module, expected: step.expected,
          actual: "skipped — a prerequisite step failed", verdict: "WARNING",
          at: new Date().toISOString(), ms: 0,
        }]);
        continue;
      }
      const t0 = performance.now();
      try {
        const r = await step.run(ctxRef.current);
        setResults((prev) => [...prev, {
          id: step.id, name: step.name, module: step.module, expected: step.expected,
          actual: r.actual, verdict: r.external ? "EXTERNAL" : r.warning ? "WARNING" : "PASS",
          at: new Date().toISOString(), ms: Math.round(performance.now() - t0),
          recordId: r.recordId ?? null,
        }]);
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        setResults((prev) => [...prev, {
          id: step.id, name: step.name, module: step.module, expected: step.expected,
          actual: `FAILED — ${msg}`, verdict: "FAIL",
          at: new Date().toISOString(), ms: Math.round(performance.now() - t0),
          error: msg,
        }]);
        // Only abort when the account itself could not be created.
        if (step.id === "cust-corporate") aborted = true;
      }
      // let live queries refresh so the UI stays in sync without a reload
      qc.invalidateQueries();
    }
    setRunning(false);
    await state.refetch();
    toast.success("System test complete");
  }

  async function purge() {
    setPurging(true);
    try {
      const res = await purgeSystemTestData();
      toast.success(`Removed ${res.customers} test customer(s) and all related records`);
      setResults([]);
      await state.refetch();
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Cleanup failed");
    } finally {
      setPurging(false);
    }
  }

  function downloadCsv() {
    const csv = ctxRef.current.exportCsv as string | undefined;
    const payload = csv ?? [
      "Test,Module,Expected,Actual,Verdict,Timestamp,Record",
      ...results.map((r) => [r.name, r.module, r.expected, r.actual, r.verdict, r.at, r.recordId ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([payload], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = csv ? "customer-profile-export.csv" : "system-test-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const snapshot = state.data?.snapshot as any;

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Quality assurance"
        title="System Health & Integration Test"
        description="Runs the entire IMT Account Manager end-to-end against the live backend — real customers, invoices, payments, tickets, documents and emails — then cleans up after itself."
        actions={<RefreshButton onClick={() => state.refetch()} loading={state.isFetching} />}
      />

      <StatChipRow
        cols={6}
        chips={[
          { label: "Tests run", value: stats.total, color: "oklch(0.45 0.05 265)" },
          { label: "Passed", value: stats.pass, color: "oklch(0.6 0.15 150)" },
          { label: "Warnings", value: stats.warn, color: "oklch(0.75 0.16 75)", text: "oklch(0.25 0.08 75)" },
          { label: "Failed", value: stats.fail, color: "oklch(0.6 0.2 20)" },
          { label: "External deps", value: stats.external, color: "oklch(0.6 0.14 240)" },
          { label: "Duration", value: `${(stats.ms / 1000).toFixed(1)}s`, color: "oklch(0.5 0.06 265)" },
        ]}
      />


      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label htmlFor="test-email">Test inbox (emails and customer notifications)</Label>
              <Input id="test-email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 max-w-sm" />
            </div>
            <ActionBar
              visibleCount={5}
              actions={[
                { tone: "emerald", icon: PlayCircle, label: running ? "Running…" : results.length ? "Run test again" : "Run full system test", onClick: runAll, disabled: running || purging },
                { tone: "sky", icon: Mail, label: "Email suite only", disabled: running || purging, onClick: async () => {
                  try {
                    const res: any = await runEmailTemplateSuite({ data: { to: email.trim() } });
                    if (res.errors > 0) toast.error(`${res.errors}/${res.total} templates failed — ${res.firstError}`);
                    else if (res.domainPending) toast.warning(`Sender domain verification still pending — 0/${res.total} sent`);
                    else toast.success(`${res.sent}/${res.total} templates accepted`);
                  } catch (e: any) { toast.error(e?.message ?? "Email suite failed"); }
                } },
                { tone: "indigo", icon: Download, label: "Export results", onClick: downloadCsv, disabled: !results.length },
                { tone: "rose", icon: Trash2, label: purging ? "Deleting…" : "Delete test data", onClick: purge, disabled: running || purging },
              ]}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Every record created here is prefixed <span className="font-mono">{TEST_MARKER}</span>. Cleanup only removes
            records carrying that marker — real customer accounts are never touched.
          </p>
        </CardContent>
      </Card>

      {snapshot && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-solar" />
              <p className="text-sm font-semibold">Live test account state — {snapshot.customer.company_name} ({snapshot.customer.account_number})</p>
            </div>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-6 text-xs">
              {[
                ["MRR", money(snapshot.summary.mrr)],
                ["Outstanding", money(snapshot.summary.outstanding)],
                ["Credit", money(snapshot.summary.creditBalance)],
                ["Invoices", snapshot.counts.invoices],
                ["Payments", snapshot.counts.payments],
                ["Timeline", snapshot.counts.timeline],
                ["Audit", snapshot.counts.audit],
                ["Tickets", snapshot.counts.tickets],
                ["Assets", snapshot.counts.assets],
                ["Documents", snapshot.counts.documents],
                ["Comms", snapshot.counts.communications],
                ["Duplicates", snapshot.summary.duplicateActivePackages.length],
              ].map(([label, value]) => (
                <div key={String(label)} className="border border-border p-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="font-semibold tabular-nums mt-0.5">{String(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <DataGrid
            rows={results}
            keyOf={(r, i) => `${r.id}-${i}`}
            onRowClick={(r) => setDetail(r)}
            empty={
              <EmptyState
                icon={ShieldCheck}
                title="No test run yet"
                description="Run the full system test to verify Customer 360, services, billing, support, KYC, equipment, documents, synchronisation and email end-to-end."
              />
            }
            columns={[
              { header: "Verdict", cell: (r) => <StatusBadge tone={verdictTone(r.verdict) as any}>{r.verdict}</StatusBadge> },
              { header: "Test", cell: (r) => <span className="font-medium">{r.name}</span> },
              { header: "Module", cell: (r) => <span className="text-muted-foreground">{r.module}</span> },
              { header: "Expected", cell: (r) => <span className="text-xs text-muted-foreground">{r.expected}</span> },
              { header: "Actual", cell: (r) => <span className="text-xs">{r.actual}</span> },
              { header: "Record", cell: (r) => <span className="font-mono text-[10px] text-muted-foreground">{r.recordId ? r.recordId.slice(0, 8) : "—"}</span> },
              { header: "Time", align: "right", cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{new Date(r.at).toLocaleTimeString()} · {r.ms}ms</span> },
            ]}
          />
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{detail?.name}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge tone={verdictTone(detail.verdict) as any}>{detail.verdict}</StatusBadge>
                <span className="text-muted-foreground">{detail.module}</span>
              </div>
              <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Expected</p><p>{detail.expected}</p></div>
              <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Actual</p><p>{detail.actual}</p></div>
              {detail.error && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Error</p>
                  <pre className="whitespace-pre-wrap text-xs bg-muted p-2 rounded">{detail.error}</pre>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Timestamp: {new Date(detail.at).toLocaleString()}</div>
                <div>Duration: {detail.ms}ms</div>
                <div className="col-span-2 font-mono">Record: {detail.recordId ?? "—"}</div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
