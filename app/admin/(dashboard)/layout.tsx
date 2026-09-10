import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';
import AdminHeader from '@/components/AdminHeader';
import { verifyToken } from '@/lib/auth/jwt';

export const metadata = {
  title: 'Admin Operations Control | Junk It Out',
  description: 'Operations control center for South Bengaluru waste pickup, agent dispatch, pricing, and settlements.',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('jio_token')?.value;
  const authUser = token ? verifyToken(token) : null;

  if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
    redirect('/admin/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-100 font-sans">
      <AdminSidebar />
      <main className="flex-1 p-6 overflow-x-hidden min-w-0">
        <AdminHeader />
        {children}
      </main>
    </div>
  );
}
