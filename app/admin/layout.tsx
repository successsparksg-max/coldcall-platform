import { DashboardNav } from "@/components/DashboardNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <DashboardNav />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
