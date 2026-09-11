import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import AgentBottomNav from '@/components/AgentBottomNav';

const getMetadataBase = () => {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && (envUrl.startsWith('http://') || envUrl.startsWith('https://'))) {
    return new URL(envUrl);
  }
  return new URL('https://junkitout.in');
};

export const metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: 'Junk It Out — Doorstep Waste Pickup in 20-30 Minutes | Bengaluru',
    template: '%s | Junk It Out',
  },
  description: 'Fast, reliable 20-30 minute doorstep scrap & waste pickup across Bengaluru. Digital scale weighing, upfront rates, and instant cash payouts for recyclables.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'Junk It Out — Doorstep Waste Pickup in 20-30 Minutes | Bengaluru',
    description: 'Fast, reliable 20-30 minute doorstep scrap & waste pickup across Bengaluru. Digital scale weighing, upfront rates, and instant cash payouts for recyclables.',
    url: 'https://junkitout.in',
    siteName: 'Junk It Out',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Junk It Out Logo' }],
    locale: 'en_IN',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased bg-slate-50 text-slate-900">
        <Navbar />
        <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0">{children}</main>
        <Footer />
        <BottomNav />
        <AgentBottomNav />
      </body>
    </html>
  );
}
