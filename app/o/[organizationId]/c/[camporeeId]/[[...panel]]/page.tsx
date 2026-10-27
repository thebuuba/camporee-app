import {notFound,redirect} from 'next/navigation';
import {Suspense} from 'react';
import {requireCamporeeContext} from '@/lib/tenant-server';
import HomeRoute from '@/app/home-route';
import TasksPage from '@/app/tasks/page';
import ProgramPage from '@/app/program/page';
import SearchPage from '@/app/search/page';
import MorePage from '@/app/more/page';
import MoreLayout from '@/app/more/layout';
import ActivitiesPage from '@/app/more/activities/page';
import AnnouncementsPage from '@/app/more/announcements/page';
import AttendancePage from '@/app/more/attendance/page';
import BudgetPage from '@/app/more/budget/page';
import DocumentsPage from '@/app/more/documents/page';
import EmergencyPage from '@/app/more/emergency/page';
import InventoryPage from '@/app/more/inventory/page';
import ListsPage from '@/app/more/lists/page';
import ListDetailPage from '@/app/more/lists/[listId]/page';
import ListDetailLoading from '@/app/more/lists/[listId]/list-detail-loading';
import MealsPage from '@/app/more/meals/page';
import NotesPage from '@/app/more/notes/page';
import ParticipantsPage from '@/app/more/participants/page';
import SettingsPage from '@/app/more/settings/page';
import SongsPage from '@/app/more/songs/page';
import NavigationPanelsProvider from '@/app/components/navigation-panels-provider';

const screens={
  '':HomeRoute,tasks:TasksPage,program:ProgramPage,search:SearchPage,more:MorePage,
  'more/activities':ActivitiesPage,'more/announcements':AnnouncementsPage,'more/attendance':AttendancePage,
  'more/budget':BudgetPage,'more/documents':DocumentsPage,'more/emergency':EmergencyPage,'more/inventory':InventoryPage,
  'more/lists':ListsPage,'more/meals':MealsPage,'more/notes':NotesPage,'more/participants':ParticipantsPage,
  'more/settings':SettingsPage,'more/songs':SongsPage,
};
type RouteParams={organizationId:string;camporeeId:string;panel?:string[]};
export default async function CamporeePage({params,searchParams}:{params:Promise<RouteParams>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const ids=await params;
  const context=await requireCamporeeContext(params);
  // A club has one current camporee: direct historical URLs must not become
  // a way for a user to manually switch camporees.
  const {data:current,error:currentError}=await context.supabase.from('camporees')
    .select('id').eq('organization_id',context.organizationId).neq('status','archived').maybeSingle();
  if(currentError)throw currentError;
  if(current && current.id!==context.camporeeId)redirect(`/o/${context.organizationId}/c/${current.id}`);
  const panel=(ids.panel??[]).join('/');
  if(panel==='more/users')redirect(`/o/${ids.organizationId}/members`);
  const listId = panel.startsWith('more/lists/') && ids.panel?.length === 3 ? ids.panel[2] : null;
  if(!listId && !Object.hasOwn(screens,panel))notFound();
  const Screen = listId ? null : screens[panel as keyof typeof screens];
  const query=Object.fromEntries(Object.entries(await searchParams).map(([key,value])=>[key,Array.isArray(value)?value[0]??'':value??'']));
  const content = listId
    ? <Suspense key={listId} fallback={<ListDetailLoading/>}><ListDetailPage params={Promise.resolve({organizationId:ids.organizationId,camporeeId:ids.camporeeId,listId})} searchParams={Promise.resolve(query)}/></Suspense>
    : Screen ? <Screen params={params} searchParams={Promise.resolve(query)}/> : notFound();
  return <NavigationPanelsProvider panels={context.camporee.navigation_panels}><div key={`${context.userId}:${context.organizationId}:${context.camporeeId}`}>
    {panel==='more'||panel.startsWith('more/')?<MoreLayout>{content}</MoreLayout>:content}
  </div></NavigationPanelsProvider>;
}
