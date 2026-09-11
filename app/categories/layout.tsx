export const metadata = {
  title: 'Recyclable Waste Categories',
  description: 'Explore all accepted recyclable scrap categories including paper, cardboard, plastics, metals, e-waste, glass, and bulky items.',
  alternates: {
    canonical: 'https://junkitout.in/categories',
  },
  openGraph: {
    title: 'Recyclable Waste Categories | Junk It Out',
    description: 'Explore all accepted recyclable scrap categories including paper, cardboard, plastics, metals, e-waste, glass, and bulky items.',
    url: 'https://junkitout.in/categories',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
