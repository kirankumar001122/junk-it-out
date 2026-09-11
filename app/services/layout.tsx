import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Waste & Scrap Pickup Services in Bengaluru',
  description:
    'Explore Junk It Out doorstep waste and scrap pickup services in Bengaluru, including recyclable scrap, bulky junk, furniture, e-waste, appliances, and commercial waste.',
  alternates: {
    canonical: 'https://junkitout.in/services',
  },
  openGraph: {
    title: 'Waste & Scrap Pickup Services in Bengaluru | Junk It Out',
    description:
      'Fast doorstep waste and scrap pickup services across Bengaluru with transparent weighing and pricing.',
    url: 'https://junkitout.in/services',
    siteName: 'Junk It Out',
    locale: 'en_IN',
    type: 'website',
  },
};

export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}