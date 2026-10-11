import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
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
import MealsPage from '@/app/more/meals/page';
import NotesPage from '@/app/more/notes/page';
import ParticipantsPage from '@/app/more/participants/page';
import SettingsPage from '@/app/more/settings/page';
import SongsPage from '@/app/more/songs/page';

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
  const panel=(ids.panel??[]).join('/');
  if(panel==='more/users')redirect(`/o/${ids.organizationId}/members`);
  if(!Object.hasOwn(screens,panel))notFound();
  const Screen=screens[panel as keyof typeof screens];
  const query=Object.fromEntries(Object.entries(await searchParams).map(([key,value])=>[key,Array.isArray(value)?value[0]??'':value??'']));
  const content=<Screen params={params} searchParams={Promise.resolve(query)}/>;
  return <div key={`${context.userId}:${context.organizationId}:${context.camporeeId}`}>
    <header className="tenant-heading"><strong>{context.organization.name}</strong><small>{context.camporee.name}{context.camporee.status==='archived'?' · Archivado, solo lectura':''}</small><nav aria-label="Cambiar contexto"><Link href={`/o/${context.organizationId}`}>Cambiar camporee</Link><Link href="/organizations">Organizaciones</Link></nav></header>
    {panel==='more'||panel.startsWith('more/')?<MoreLayout>{content}</MoreLayout>:content}
  </div>;
}
