import { getSessionFromCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getSessionFromCookie();

  if (!user) {
    redirect("/login");
  }

  if (user.role === "admin") {
    redirect("/admin");
  } else if (user.role === "it_admin") {
    redirect("/it-admin");
  } else {
    redirect("/dashboard");
  }
}
