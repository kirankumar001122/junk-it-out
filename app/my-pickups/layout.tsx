export const metadata = {
  title: 'My Pickups & Booking History',
  description: 'Track your active doorstep pickups, agent arrival status, weight records, and settlement receipts.',
  alternates: {
    canonical: 'https://junkitout.in/my-pickups',
  },
  openGraph: {
    title: 'My Pickups & Booking History | Junk It Out',
    description: 'Track your active doorstep pickups, agent arrival status, weight records, and settlement receipts.',
    url: 'https://junkitout.in/my-pickups',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
