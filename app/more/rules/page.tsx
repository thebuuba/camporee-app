import {requireCamporeeContext,type TenantPageParams} from '@/lib/tenant-server';
import RulesScreen from './rules-screen';

export default async function RulesPage({params}:{params?:TenantPageParams}={}) {
  const context=await requireCamporeeContext(params,'/more/rules');
  const {data,error}=await context.supabase.from('camporee_rule_sets').select('rules').eq('camporee_id',context.camporee.id).single();
  if(error)throw error;
  return <RulesScreen key={context.camporee.id} camporeeId={context.camporee.id} camporeeName={context.camporee.name}
    initialRules={data.rules} canEdit={context.canEdit('notes')}/>;
}
