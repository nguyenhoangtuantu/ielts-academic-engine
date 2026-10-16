import type { MetadataRoute } from 'next';
import { getAllSampleEssays } from './samples/sampleData';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ielts.academic-engine.com';

/**
 * Next.js Dynamic Sitemap Generator
 *
 * Produces search engine sitemap entries for:
 * 1. Root / homepage
 * 2. Public IELTS sample essay pages (/samples/[slug]) with weekly update frequency and high priority
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const samples = getAllSampleEssays();

  const sampleEntries: MetadataRoute.Sitemap = samples.map((sample) => ({
    url: `${BASE_URL}/samples/${sample.slug}`,
    lastModified: new Date(sample.datePublished),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    ...sampleEntries,
  ];
}
