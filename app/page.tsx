import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const role = session.user.role;
  if (role === "admin") {
    redirect("/admin");
  } else if (role === "it_admin") {
    redirect("/it-admin");
  } else {
    redirect("/dashboard");
  }
}
