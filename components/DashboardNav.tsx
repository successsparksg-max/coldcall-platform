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
  const { user } = useAuth();
  const role = user?.role;

  const agentNav: NavItem[] = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      label: "Upload",
      href: "/dashboard/upload",
      icon: <Upload className="h-4 w-4" />,
    },
  ];

  const adminNav: NavItem[] = [
    {
      label: "Overview",
      href: "/admin",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
  ];

  const itAdminNav: NavItem[] = [
    {
      label: "Credentials",
      href: "/it-admin",
      icon: <Settings className="h-4 w-4" />,
    },
    {
      label: "Manage Users",
      href: "/it-admin/users",
      icon: <Users className="h-4 w-4" />,
    },
  ];

  let navItems: NavItem[] = agentNav;
  if (role === "admin") navItems = [...adminNav, ...agentNav];
  else if (role === "it_admin") navItems = itAdminNav;

  // Change password link (not for IT admin since their password is in env)
  const showChangePassword = role && role !== "it_admin";

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen w-56 flex-col border-r bg-gray-50/50">
      <div className="flex h-14 items-center border-b px-4">
        <Phone className="mr-2 h-5 w-5" />
        <span className="font-semibold">ColdCall AI</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              pathname === item.href
                ? "bg-gray-200 font-medium"
                : "hover:bg-gray-100"
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
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              pathname === "/change-password"
                ? "bg-gray-200 font-medium"
                : "hover:bg-gray-100"
            )}
          >
            <KeyRound className="h-4 w-4" />
            Change Password
          </Link>
        )}
      </nav>
      <div className="border-t p-2">
        <div className="px-3 py-2 text-xs text-gray-500">
          {user?.name}
          <br />
          <span className="capitalize">{role?.replace("_", " ")}</span>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          size="sm"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
