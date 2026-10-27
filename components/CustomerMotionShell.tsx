'use client';

import { usePathname } from 'next/navigation';

export default function CustomerMotionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRestrictedSurface = pathname.startsWith('/admin') || pathname.startsWith('/agent');

  return (
    <div
      key={pathname}
      className={isRestrictedSurface ? undefined : 'customer-motion-shell customer-route-enter'}
    >
      {children}
    </div>
  );
}
