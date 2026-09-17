import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';
import AdminHeader from '@/components/AdminHeader';

export const metadata = {
  title: 'Admin Operations Control Center | Junk It Out',
  description: 'Operations control center for South Bengaluru waste pickup, agent dispatch, pricing, and settlements.',
};

async function getAuthenticatedAdminUser(token: string) {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'https://www.junkitout.in';
    const meUrl = apiBase.endsWith('/') ? `${apiBase}api/auth/me` : `${apiBase}/api/auth/me`;

    const res = await fetch(meUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `jio_token=${token}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.success || !data.data?.user) return null;

    const user = data.data.user;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return null;

    return user;
  } catch (err) {
    console.error('Admin layout authentication error:', err);
    return null;
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('jio_token')?.value;

  if (!token) {
    redirect('/login');
  }

  const authUser = await getAuthenticatedAdminUser(token);
  if (!authUser) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-100 font-sans text-slate-900">
      <AdminSidebar />
      <main className="flex-1 p-6 overflow-x-hidden min-w-0">
        <AdminHeader />
        {children}
      </main>
    </div>
  );
}

