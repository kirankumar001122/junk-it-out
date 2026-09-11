export const metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy explaining data collection, mobile OTP authentication, GPS location usage, and customer data rights.',
  alternates: {
    canonical: 'https://junkitout.in/privacy-policy',
  },
  openGraph: {
    title: 'Privacy Policy | Junk It Out',
    description: 'Privacy Policy explaining data collection, mobile OTP authentication, GPS location usage, and customer data rights.',
    url: 'https://junkitout.in/privacy-policy',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
