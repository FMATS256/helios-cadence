import { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}

export function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-border">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs uppercase tracking-[3px] text-solar font-semibold mb-2">{eyebrow}</p>
        )}
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight break-words">
          {title}
        </h1>
        {description && <p className="text-muted-foreground mt-2 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">{children}</div>;
}

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "warning" | "info" | "danger" | "solar" | "neutral";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]",
    info: "bg-info/15 text-info",
    danger: "bg-destructive/15 text-destructive",
    solar: "bg-solar/15 text-[oklch(0.45_0.16_50)]",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export { Button };
