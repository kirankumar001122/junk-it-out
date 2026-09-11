export const metadata = {
  title: 'About Junk It Out',
  description: 'Learn about Junk It Out’s mission to digitize doorstep scrap collection and promote sustainable waste recycling across Bengaluru.',
  alternates: {
    canonical: 'https://junkitout.in/about',
  },
  openGraph: {
    title: 'About Junk It Out | Doorstep Recycling & Waste Management',
    description: 'Learn about Junk It Out’s mission to digitize doorstep scrap collection across Bengaluru.',
    url: 'https://junkitout.in/about',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
