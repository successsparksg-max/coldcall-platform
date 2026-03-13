import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  ready: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  paused: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-700",
  pending: "bg-gray-100 text-gray-600",
  calling: "bg-yellow-100 text-yellow-700",
  called: "bg-blue-100 text-blue-700",
  answered: "bg-green-100 text-green-700",
  no_answer: "bg-red-100 text-red-600",
  busy: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
  parsed: "bg-green-100 text-green-700",
};

const statusLabels: Record<string, string> = {
  ready: "Ready",
  in_progress: "In Progress",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  pending: "Pending",
  calling: "Calling",
  called: "Called",
  answered: "Answered",
  no_answer: "No Answer",
  busy: "Busy",
  failed: "Failed",
  skipped: "Skipped",
  parsed: "Parsed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("text-xs", statusColors[status] || "bg-gray-100")}
    >
      {statusLabels[status] || status}
    </Badge>
  );
}
