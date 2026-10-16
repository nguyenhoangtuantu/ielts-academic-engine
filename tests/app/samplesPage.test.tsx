// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SampleEssayPage, { generateMetadata, generateStaticParams } from '../../src/app/samples/[slug]/page';
import { getAllSampleEssays, getSampleBySlug } from '../../src/app/samples/sampleData';
import sitemap from '../../src/app/sitemap';

// Mock next/navigation
const mockNotFound = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => {
    mockNotFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('Samples Dynamic Route (/samples/[slug])', () => {
  const validSlug = 'environmental-degradation-and-individual-responsibility';

  describe('generateMetadata', () => {
    it('generates complete OpenGraph, Twitter, canonical, and educational tags for valid slug', async () => {
      const meta = await generateMetadata({ params: Promise.resolve({ slug: validSlug }) });

      expect(meta.title).toContain('Environmental Degradation and Individual Responsibility');
      expect(meta.description).toContain('IELTS Writing');
      expect(meta.alternates?.canonical).toBe(
        `https://ielts.academic-engine.com/samples/${validSlug}`
      );

      // OpenGraph tags
      expect(meta.openGraph).toBeDefined();
      expect((meta.openGraph as any)?.type).toBe('article');
      expect((meta.openGraph as any)?.url).toBe(
        `https://ielts.academic-engine.com/samples/${validSlug}`
      );
      expect((meta.openGraph as any)?.siteName).toBe('IELTS Academic Engine');

      // Twitter tags
      expect(meta.twitter).toBeDefined();
      expect((meta.twitter as any)?.card).toBe('summary_large_image');

      // Educational metadata
      expect(meta.other?.['educational-level']).toBe('IELTS Band 6.5 - 8.5');
      expect(meta.other?.['learning-resource-type']).toBe('EducationalWebPage');
    });

    it('returns not found metadata when slug is invalid', async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ slug: 'non-existent-essay-slug' }),
      });

      expect(meta.title).toContain('Not Found');
    });
  });

  describe('generateStaticParams', () => {
    it('returns all pre-configured sample slugs', async () => {
      const params = await generateStaticParams();
      const allSamples = getAllSampleEssays();

      expect(params.length).toBe(allSamples.length);
      expect(params.map((p) => p.slug)).toContain(validSlug);
    });
  });

  describe('SampleEssayPage component', () => {
    it('renders the sample page with title, prompt, band analysis, and SideBySideView', async () => {
      const PageComponent = await SampleEssayPage({
        params: Promise.resolve({ slug: validSlug }),
      });

      const { container } = render(PageComponent);

      // Title & Heading
      expect(
        screen.getByRole('heading', {
          name: /Environmental Degradation and Individual Responsibility/i,
        })
      ).toBeTruthy();

      // Band Badges & Prompt
      expect(screen.getByText(/Baseline: Band 6.0/i)).toBeTruthy();
      expect(screen.getByText(/Target Upgrade: Band 7.5\+/i)).toBeTruthy();
      expect(screen.getByText(/IELTS Writing Task 2 Prompt/i)).toBeTruthy();

      // Key Takeaways
      expect(screen.getByRole('heading', { name: /Band 7.5\+ Upgrade Key Takeaways/i })).toBeTruthy();
      expect(screen.getByText(/Eliminate informal contractions/i)).toBeTruthy();

      // Band breakdown metrics
      expect(screen.getByText('Task Achievement')).toBeTruthy();
      expect(screen.getByText('Coherence & Cohesion')).toBeTruthy();
      expect(screen.getByText('Lexical Resource')).toBeTruthy();
      expect(screen.getByText('Grammatical Range')).toBeTruthy();

      // Side-by-side diff component presence
      expect(container.querySelector('.side-by-side-diff-view')).toBeTruthy();

      // Call to action button
      expect(screen.getByRole('link', { name: /Start Free Evaluation/i })).toBeTruthy();
    });

    it('injects Schema.org JSON-LD structured data with EducationalWebPage and Article', async () => {
      const PageComponent = await SampleEssayPage({
        params: Promise.resolve({ slug: validSlug }),
      });

      const { container } = render(PageComponent);
      const scriptTag = container.querySelector('script[type="application/ld+json"]');
      expect(scriptTag).toBeTruthy();

      const jsonContent = JSON.parse(scriptTag!.innerHTML);
      expect(jsonContent['@context']).toBe('https://schema.org');
      expect(jsonContent['@graph']).toBeDefined();

      const types = jsonContent['@graph'].map((item: any) => item['@type']);
      expect(types).toContain('EducationalWebPage');
      expect(types).toContain('Article');

      const educationalPage = jsonContent['@graph'].find(
        (item: any) => item['@type'] === 'EducationalWebPage'
      );
      expect(educationalPage.educationalLevel).toBe('IELTS Band 6.5 - 8.5');
      expect(educationalPage.learningResourceType).toBe('Academic Writing Sample & Diff Analysis');
    });

    it('triggers notFound() when slug is not recognized', async () => {
      mockNotFound.mockClear();

      await expect(
        SampleEssayPage({ params: Promise.resolve({ slug: 'unknown-sample-xyz' }) })
      ).rejects.toThrow('NEXT_NOT_FOUND');

      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });
  });

  describe('sitemap()', () => {
    it('produces dynamic sitemap entries for root and all sample pages with weekly frequency', async () => {
      const entries = await sitemap();
      const allSamples = getAllSampleEssays();

      // Root entry + all sample entries
      expect(entries.length).toBe(allSamples.length + 1);

      const rootEntry = entries.find((e) => e.url === 'https://ielts.academic-engine.com');
      expect(rootEntry).toBeDefined();
      expect(rootEntry?.priority).toBe(1.0);
      expect(rootEntry?.changeFrequency).toBe('daily');

      // Check sample entries
      const sampleEntry = entries.find((e) =>
        e.url.includes('/samples/environmental-degradation-and-individual-responsibility')
      );
      expect(sampleEntry).toBeDefined();
      expect(sampleEntry?.changeFrequency).toBe('weekly');
      expect(sampleEntry?.priority).toBe(0.8);
      expect(sampleEntry?.lastModified).toBeInstanceOf(Date);
    });
  });
});
