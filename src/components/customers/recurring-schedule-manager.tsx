"use client";

/**
 * Customer detail page -> "Recurring reminders" — calendar-anchored
 * reminders (e.g. a monthly coaching fee due on the join-date anniversary)
 * that are mechanically separate from the opportunity engine's
 * visit-pattern opportunities (see `lib/recurring-schedules/`). Actually
 * sending anything still requires a `recurring_schedule` automation to be
 * created and activated in Automations — this only manages WHO/WHEN.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InlineError } from "@/components/inline-error";
import {
  createRecurringScheduleAction,
  deleteRecurringScheduleAction,
  setRecurringScheduleStatusAction,
} from "@/lib/recurring-schedules/actions";
import type { RecurringScheduleRow } from "@/types/database";

function formatAnniversary(anchorDate: string): string {
  // anchor_date is a plain calendar date ("YYYY-MM-DD") — read the day
  // straight from it, never via the browser's time zone.
  const day = Number(anchorDate.slice(8, 10));
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `the ${day}${suffix} of every month`;
}

export function RecurringScheduleManager({
  customerId,
  schedules,
}: {
  customerId: string;
  schedules: RecurringScheduleRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [anchorDate, setAnchorDate] = React.useState(() => {
    // Today on the staff member's own device (not UTC, which is yesterday
    // in India before 5:30am).
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [workingId, setWorkingId] = React.useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await createRecurringScheduleAction(customerId, label, anchorDate);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setLabel("");
    setOpen(false);
    router.refresh();
  };

  const handleToggle = async (schedule: RecurringScheduleRow) => {
    setWorkingId(schedule.id);
    const nextStatus = schedule.status === "active" ? "paused" : "active";
    const result = await setRecurringScheduleStatusAction(customerId, schedule.id, nextStatus);
    setWorkingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleDelete = async (schedule: RecurringScheduleRow) => {
    setWorkingId(schedule.id);
    const result = await deleteRecurringScheduleAction(customerId, schedule.id);
    setWorkingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <InlineError message={error} />
      {schedules.length > 0 && (
        <div className="space-y-2">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="font-medium">{schedule.label}</p>
                <p className="text-xs text-muted-foreground">
                  Repeats on {formatAnniversary(schedule.anchor_date)} — anchored to{" "}
                  {new Date(`${schedule.anchor_date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={schedule.status === "active" ? "success" : "muted"}>
                  {schedule.status === "active" ? "Active" : "Paused"}
                </Badge>
                <Button size="sm" variant="secondary" onClick={() => handleToggle(schedule)} disabled={workingId === schedule.id}>
                  {schedule.status === "active" ? "Pause" : "Resume"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(schedule)} disabled={workingId === schedule.id}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Add recurring reminder
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add recurring reminder"
        description="For calendar-based reminders like a monthly fee — not a visit pattern. Reelo will fire this every month on the same date, once you also create and activate a 'Recurring calendar reminder' automation."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <InlineError message={error} />
          <div className="space-y-1.5">
            <label htmlFor="schedule-label" className="text-sm font-medium">
              What is this reminder for?
            </label>
            <Input
              id="schedule-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Monthly coaching fee"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="schedule-anchor" className="text-sm font-medium">
              Anchor date (e.g. the date they joined)
            </label>
            <Input
              id="schedule-anchor"
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Reminders repeat monthly on this date&apos;s day-of-month, starting the following month.
            </p>
          </div>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "Adding..." : "Add reminder"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
