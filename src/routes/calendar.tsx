import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarEvents } from "@/mock/data";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar — RoyEno CRM" }, { name: "description", content: "Unified calendar of installations, site visits, and follow-ups." }] }),
  component: CalendarPage,
});

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dates = Array.from({ length: 35 }, (_, i) => i - 3);

const tone: Record<string, "info" | "solar" | "warning" | "neutral"> = {
  Visit: "info", Install: "solar", Call: "warning", Service: "warning", Internal: "neutral",
};

function CalendarPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workspace"
        title="Calendar"
        description="May 2026 · Installations, site visits, follow-ups, and team events."
        actions={
          <>
            <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon"><ChevronRight className="h-4 w-4" /></Button>
            <Button className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1.5" />New Event</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-3">
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b">
              {days.map((d) => <div key={d} className="p-3 text-xs font-semibold text-muted-foreground text-center uppercase tracking-wider">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {dates.map((d) => {
                const inMonth = d > 0 && d <= 31;
                const isToday = d === 11;
                const dayEvent = inMonth ? calendarEvents.find((e) => parseInt(e.date.split("-")[2]) === d) : null;
                return (
                  <div key={d} className={`min-h-[110px] border-r border-b border-border p-2 ${!inMonth ? "bg-muted/30" : ""} ${isToday ? "bg-solar/5" : ""}`}>
                    <div className={`text-xs font-semibold ${isToday ? "h-6 w-6 rounded-full bg-solar text-solar-foreground flex items-center justify-center" : !inMonth ? "text-muted-foreground/40" : "text-foreground"}`}>
                      {inMonth ? d : ""}
                    </div>
                    {dayEvent && (
                      <div className="mt-2 p-1.5 rounded-md bg-solar/15 border-l-2 border-solar">
                        <p className="text-[10px] font-semibold text-foreground truncate">{dayEvent.time}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{dayEvent.title}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display">Upcoming</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {calendarEvents.map((e) => (
              <div key={e.id} className="border-l-2 border-solar pl-3 py-1">
                <p className="text-xs text-muted-foreground">{e.date} · {e.time}</p>
                <p className="font-semibold text-sm mt-0.5">{e.title}</p>
                <StatusPill tone={tone[e.type]}>{e.type}</StatusPill>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
