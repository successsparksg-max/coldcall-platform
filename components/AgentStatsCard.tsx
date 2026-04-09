import type { LucideIcon } from "lucide-react";

interface AgentStatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  color?: "default" | "green" | "red" | "blue";
}

const colorMap = {
  default: "bg-white border-gray-200",
  green: "bg-emerald-50 border-emerald-200",
  red: "bg-red-50 border-red-200",
  blue: "bg-blue-50 border-blue-200",
};

const iconColorMap = {
  default: "text-gray-400 bg-gray-100",
  green: "text-emerald-600 bg-emerald-100",
  red: "text-red-500 bg-red-100",
  blue: "text-blue-600 bg-blue-100",
};

const valueColorMap = {
  default: "text-gray-900",
  green: "text-emerald-700",
  red: "text-red-600",
  blue: "text-blue-700",
};

export function AgentStatsCard({
  title,
  value,
  icon: Icon,
  description,
  color = "default",
}: AgentStatsCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <div className={`rounded-lg p-2 ${iconColorMap[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className={`mt-3 text-3xl font-bold ${valueColorMap[color]}`}>
        {value}
      </div>
      {description && (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      )}
    </div>
  );
}
