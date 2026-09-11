import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/',
        '/agent/',
        '/api/',
        '/customer/',
      ],
    },
    sitemap: 'https://junkitout.in/sitemap.xml',
  };
}