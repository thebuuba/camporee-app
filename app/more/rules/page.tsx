import {requireCamporeeContext,type TenantPageParams} from '@/lib/tenant-server';
import RulesScreen from './rules-screen';

export default async function RulesPage({params}:{params?:TenantPageParams}={}) {
  const context=await requireCamporeeContext(params,'/more/rules');
  return <RulesScreen camporeeName={context.camporee.name}/>;
}
