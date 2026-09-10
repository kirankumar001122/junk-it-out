import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import AgentBottomNav from '@/components/AgentBottomNav';

export const metadata = {
  title: 'Junk It Out — Doorstep Waste Pickup in 20-30 Minutes | South Bengaluru',
  description: 'Fast, reliable 20-30 minute doorstep waste pickup in South Bengaluru (JP Nagar, Jayanagar, Electronic City, HSR, Koramangala). We collect, weigh, pay you for recyclables, and manage waste responsibly.',
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
