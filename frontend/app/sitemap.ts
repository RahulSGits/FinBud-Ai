import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL || 'https://finbud.ai';
  const routes = ['', '/pricing', '/why', '/how-it-works', '/faq', '/docs', '/login', '/register'];
  return routes.map((r) => ({
    url: `${base}${r}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: r === '' ? 1 : 0.7,
  }));
}
