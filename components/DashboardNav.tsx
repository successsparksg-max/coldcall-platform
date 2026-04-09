"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  LogOut,
  Phone,
  Settings,
  KeyRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const role = user?.role;

  const agentNav: NavItem[] = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      label: "Upload",
      href: "/dashboard/upload",
      icon: <Upload className="h-5 w-5" />,
    },
  ];

  const adminNav: NavItem[] = [
    {
      label: "Overview",
      href: "/admin",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      label: "Call Lists",
      href: "/admin/call-lists",
      icon: <Phone className="h-5 w-5" />,
    },
    {
      label: "Credentials",
      href: "/admin/credentials",
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  const itAdminNav: NavItem[] = [
    {
      label: "Dashboard",
      href: "/it-admin",
      icon: <Users className="h-5 w-5" />,
    },
  ];

  let navItems: NavItem[] = agentNav;
  if (role === "admin") navItems = adminNav;
  else if (role === "it_admin") navItems = itAdminNav;

  const showChangePassword = role && role !== "it_admin";

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    router.push("/login");
  }

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-white">
      <div className="flex h-16 items-center border-b px-5">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-blue-600 p-1.5">
            <Phone className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">ColdCall AI</span>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-3 text-base transition-colors",
              pathname === item.href
                ? "bg-blue-50 font-semibold text-blue-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
        {showChangePassword && (
          <Link
            href="/change-password"
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-3 text-base transition-colors",
              pathname === "/change-password"
                ? "bg-blue-50 font-semibold text-blue-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <KeyRound className="h-5 w-5" />
            Change Password
          </Link>
        )}
      </nav>
      <div className="border-t p-4">
        <div className="mb-3 px-1">
          <div className="text-sm font-medium text-gray-900">{user?.name}</div>
          <div className="text-xs text-gray-500 capitalize">
            {role?.replace("_", " ")}
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-base text-gray-600 hover:text-gray-900"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
