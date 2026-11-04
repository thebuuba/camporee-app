import { requireCamporeeContext } from '@/lib/tenant-server';
import { buildMealMenuDocument } from '@/lib/meal-menu';
import { buildMealPrintPage, mealPrintPolicy } from '@/lib/meal-print-page';

export const dynamic = 'force-dynamic';

type Params = Promise<{ organizationId: string; camporeeId: string }>;

// A real top-level HTML response avoids iframe-print and hydration readiness
// failures. Authentication, membership and Supabase RLS are identical to Meals.
export async function GET(_request: Request, { params }: { params: Params }) {
  const context = await requireCamporeeContext(params);
  const { data: meals, error } = await context.supabase.from('meals')
    .select('meal_date,meal_type,menu')
    .eq('camporee_id', context.camporeeId)
    .order('meal_date').order('meal_type');
  const headers = {
    'Cache-Control': 'private, no-store, max-age=0',
    'Vary': 'Cookie',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };
  if (error) {
    return new Response('No se pudo cargar el menú. Regresa a Comidas y vuelve a intentarlo.', {
      status: 503, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const backHref = `/o/${context.organizationId}/c/${context.camporeeId}/more/meals`;
  const html = buildMealPrintPage(
    buildMealMenuDocument(meals ?? [], context.camporee.name),
    backHref, nonce, Boolean(meals?.length),
  );
  return new Response(html, { headers: {
    ...headers,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `${mealPrintPolicy(nonce)}; frame-ancestors 'none'`,
  } });
}
