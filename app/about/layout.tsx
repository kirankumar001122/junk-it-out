export const metadata = {
  title: 'About Us — Doorstep Recycling & Scrap Pickup Mission',
  description: 'Learn about Junk It Out’s mission to digitize doorstep scrap pickup in Bengaluru with transparent digital weighing, instant payouts, and sustainable recycling.',
  alternates: {
    canonical: 'https://junkitout.in/about',
  },
  openGraph: {
    title: 'About Us — Junk It Out Doorstep Recycling',
    description: 'Learn about Junk It Out’s mission to digitize doorstep scrap pickup in Bengaluru with transparent digital weighing, instant payouts, and sustainable recycling.',
    url: 'https://junkitout.in/about',
    siteName: 'Junk It Out',
    type: 'website',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
