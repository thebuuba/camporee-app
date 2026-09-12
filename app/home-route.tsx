import { redirect } from "next/navigation";
import { loadHomeData } from "@/lib/home-data";
import HomeDashboard from "./home-dashboard";
import HomeSetup from "./home-setup";

export default async function HomeRoute() {
  const data = await loadHomeData();
  if (!data) redirect("/login");
  if (data.memberLoadError) {
    return <HomeSetup firstName={data.firstName} isActive={false} isAdmin={false} accessLoadError />;
  }
  if (data.camporeeLoadError) {
    return <HomeSetup firstName={data.firstName} isActive={Boolean(data.member?.is_active)} isAdmin={Boolean(data.member?.is_active && data.member.role === "admin")} role={data.member?.role} camporeeLoadError />;
  }
  if (!data.camporee || !data.member?.is_active) {
    return <HomeSetup firstName={data.firstName} isActive={Boolean(data.member?.is_active)} isAdmin={Boolean(data.member?.is_active && data.member.role === "admin")} role={data.member?.role}/>;
  }
  return <HomeDashboard {...data} camporee={data.camporee}/>;
}
