import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import { loadHomeData } from "@/lib/home-data";
import HomeDashboard from "./home-dashboard";

export default async function HomeRoute({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params);
  const data = await loadHomeData(context);
  return <HomeDashboard key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} {...data} camporee={data.camporee} organizationId={context.organizationId}/>;
}
