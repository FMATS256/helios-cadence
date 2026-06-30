import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

type Step = { route: string; title: string; body: string };

const STEPS: Step[] = [
  { route: "/", title: "Welcome to RoyEno CRM ✨", body: "This quick tour will show you the seven core workflows. You can replay it any time from Getting Started." },
  { route: "/leads", title: "Capture leads first", body: "Every new enquiry lives here. Click Add Lead, then move it through stages as you qualify." },
  { route: "/pipeline", title: "Visualise your pipeline", body: "See every lead grouped by stage. Use the dropdown on a card to move it forward." },
  { route: "/clients", title: "Convert to clients", body: "When you win a deal, create a client with full system specs, warranty and installation details." },
  { route: "/quotes", title: "Quote & invoice", body: "Send formal quotes, then convert them to invoices. Track Draft → Sent → Paid." },
  { route: "/installations", title: "Schedule installations", body: "Plan the job, assign a crew lead, update progress as the team works through it." },
  { route: "/getting-started", title: "You're ready! 🎉", body: "Detailed step-by-step instructions live on this page. Star it for later." },
];

const KEY = "royeno_tour_done";

export function ProductTour() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(KEY);
    if (!done) { setActive(true); navigate({ to: "/" }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;
  const cur = STEPS[step];
  const close = () => { localStorage.setItem(KEY, "1"); setActive(false); };
  const next = () => {
    const n = step + 1;
    if (n >= STEPS.length) return close();
    setStep(n);
    navigate({ to: STEPS[n].route });
  };
  const prev = () => {
    const n = Math.max(0, step - 1);
    setStep(n);
    navigate({ to: STEPS[n].route });
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm pointer-events-none" />
      <div className="fixed bottom-6 right-6 z-[101] w-[min(92vw,380px)] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                <Sparkles className="h-4 w-4" />
              </div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Step {step + 1} / {STEPS.length}</p>
            </div>
            <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <h3 className="font-display text-lg font-bold mt-3">{cur.title}</h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{cur.body}</p>
          <p className="text-xs text-muted-foreground mt-3">Currently viewing: <span className="font-mono">{pathname}</span></p>
          <div className="flex items-center justify-between mt-5">
            <Button variant="ghost" size="sm" onClick={close}>Skip tour</Button>
            <div className="flex items-center gap-2">
              {step > 0 && <Button variant="outline" size="sm" onClick={prev}><ChevronLeft className="h-4 w-4 mr-1" />Back</Button>}
              <Button size="sm" onClick={next} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                {step === STEPS.length - 1 ? "Finish" : "Next"}{step !== STEPS.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
