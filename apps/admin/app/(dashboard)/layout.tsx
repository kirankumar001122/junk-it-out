import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';
import AdminHeader from '@/components/AdminHeader';
import { getCachedAdminSession, setCachedAdminSession } from '@/lib/authSessionCache';

export const metadata = {
  title: 'Admin Operations Control Center | Junk It Out',
  description: 'Operations control center for South Bengaluru waste pickup, agent dispatch, pricing, and settlements.',
};

async function getAuthenticatedAdminUser(token: string) {
  // Check short-lived validated session cache to eliminate redundant HTTP hops during navigation
  const cachedUser = getCachedAdminSession(token);
  if (cachedUser) {
    return cachedUser;
  }

  try {
    const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
    if (!configured && process.env.NODE_ENV === 'development') {
      console.error('Admin layout authentication error: NEXT_PUBLIC_API_BASE_URL is not configured in local development.');
      return null;
    }
    const apiBase = configured || 'https://www.junkitout.in';
    const meUrl = apiBase.endsWith('/') ? `${apiBase}api/auth/me` : `${apiBase}/api/auth/me`;

    const res = await fetch(meUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `jio_token=${token}; jio_admin_token=${token}`,
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.success || !data.data?.user) return null;

    const user = data.data.user;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return null;

    // Cache verified session bounded by token expiration (max 30s)
    setCachedAdminSession(token, user);

    return user;
  } catch (err) {
    console.error('Admin layout authentication error:', err);
    return null;
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('jio_token')?.value || cookieStore.get('jio_admin_token')?.value;

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
        <AdminHeader initialUser={{ name: authUser.name, department: authUser.admin?.department || authUser.role }} />
        {children}
      </main>
    </div>
  );
}
