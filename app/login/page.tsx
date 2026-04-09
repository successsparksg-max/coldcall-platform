"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Phone } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Invalid credentials");
        setLoading(false);
        return;
      }

      // Refresh auth context so nav updates immediately
      await refresh();

      // Redirect based on role
      const role = data.data?.role;
      if (role === "admin") {
        router.push("/admin");
      } else if (role === "it_admin") {
        router.push("/it-admin");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-lg rounded-xl border shadow-lg">
        <CardHeader className="text-center space-y-4 pb-2 pt-10">
          <div className="mx-auto rounded-xl bg-blue-100 p-3 w-fit">
            <Phone className="h-8 w-8 text-blue-600" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold text-gray-900">Cold Call Platform</CardTitle>
            <CardDescription className="text-base text-gray-500">Sign in to your account</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-10 pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-base text-red-600">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-base font-medium text-gray-700">Email / Username</Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com or it-admin"
                required
                className="h-12 rounded-xl text-base px-4"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-base font-medium text-gray-700">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 rounded-xl text-base px-4"
              />
            </div>
            <Button type="submit" size="lg" className="w-full text-base h-12 rounded-xl" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
