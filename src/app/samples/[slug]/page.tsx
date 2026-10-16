import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSampleBySlug, getAllSampleSlugs } from '../sampleData';
import { sanitizeAndMaskPII } from '../../../core/security/piiFilter';
import { SideBySideView } from '../../../components/diff/SideBySideView';

export interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ielts.academic-engine.com';

/**
 * Next.js Dynamic SEO Metadata Generator for Sample Essay Pages
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const sample = getSampleBySlug(slug);

  if (!sample) {
    return {
      title: 'Sample Essay Not Found | IELTS Academic Engine',
      description: 'The requested IELTS sample essay could not be found.',
    };
  }

  const title = `${sample.title} | IELTS Writing Task 2 Band Upgrade Sample`;
  const description = `Read full Band 7.5+ evaluation and sentence-by-sentence diff analysis for IELTS Writing: "${sample.topic}". Improve lexical resource and academic syntax.`;
  const canonicalUrl = `${BASE_URL}/samples/${sample.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'IELTS Academic Engine',
      type: 'article',
      publishedTime: sample.datePublished,
      modifiedTime: sample.datePublished,
      authors: ['IELTS Academic Engine'],
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    other: {
      'educational-level': 'IELTS Band 6.5 - 8.5',
      'learning-resource-type': 'EducationalWebPage',
      'article:section': 'IELTS Writing Task 2',
    },
  };
}

/**
 * Statically pre-render known sample slugs
 */
export async function generateStaticParams() {
  const slugs = getAllSampleSlugs();
  return slugs.map((slug) => ({ slug }));
}

/**
 * Server Component for /samples/[slug]
 */
export default async function SampleEssayPage({ params }: PageProps) {
  const { slug } = await params;
  const sample = getSampleBySlug(slug);

  if (!sample) {
    notFound();
  }

  // Sanitize the raw draft and topic text through the PII filter
  const { cleanText: sanitizedDraft, hasPII } = sanitizeAndMaskPII(sample.rawEssay);
  const { cleanText: sanitizedTopic } = sanitizeAndMaskPII(sample.topic);

  const canonicalUrl = `${BASE_URL}/samples/${sample.slug}`;

  // Structured Data (Schema.org EducationalWebPage + Article)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'EducationalWebPage',
        '@id': `${canonicalUrl}#educationalwebpage`,
        url: canonicalUrl,
        name: `${sample.title} | IELTS Writing Task 2 Band Upgrade Sample`,
        description: `Comprehensive sentence-by-sentence evaluation and Band 7.5+ revision for IELTS Writing: "${sample.topic}"`,
        inLanguage: 'en',
        educationalLevel: 'IELTS Band 6.5 - 8.5',
        learningResourceType: 'Academic Writing Sample & Diff Analysis',
        provider: {
          '@type': 'Organization',
          name: 'IELTS Academic Engine',
          url: BASE_URL,
        },
      },
      {
        '@type': 'Article',
        '@id': `${canonicalUrl}#article`,
        isPartOf: {
          '@id': `${canonicalUrl}#educationalwebpage`,
        },
        headline: `${sample.title} - IELTS Band Upgrade Sample & Analysis`,
        description: `Sentence-level Myers diff comparison, lexical upgrades, and mistake explanations for IELTS essay prompt: "${sample.topic}"`,
        mainEntityOfPage: canonicalUrl,
        datePublished: sample.datePublished,
        dateModified: sample.datePublished,
        author: {
          '@type': 'Organization',
          name: 'IELTS Academic Engine',
        },
        publisher: {
          '@type': 'Organization',
          name: 'IELTS Academic Engine',
          logo: {
            '@type': 'ImageObject',
            url: `${BASE_URL}/logo.png`,
          },
        },
      },
    ],
  };

  return (
    <>
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

      <main className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center space-x-2 text-sm text-neutral-500">
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-neutral-400">Samples</span>
          <span>/</span>
          <span className="text-neutral-900 font-medium truncate max-w-xs sm:max-w-md">
            {sample.title}
          </span>
        </nav>

        {/* Top Header Card */}
        <header className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-neutral-200 mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="px-3 py-1 text-xs font-bold bg-blue-100 text-blue-700 rounded-full uppercase tracking-wider">
              {sample.essayType}
            </span>
            <span className="px-3 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">
              Baseline: {sample.originalBand}
            </span>
            <span className="px-3 py-1 text-xs font-bold bg-green-100 text-green-700 rounded-full">
              Target Upgrade: {sample.targetBand}
            </span>
            {hasPII && (
              <span className="px-3 py-1 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full">
                PII Masked
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight mb-3">
            {sample.title}
          </h1>

          {/* IELTS Prompt Box */}
          <div className="bg-neutral-50 border-l-4 border-blue-600 p-4 rounded-r-xl my-4">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">
              IELTS Writing Task 2 Prompt
            </div>
            <p className="text-neutral-800 font-medium leading-relaxed italic">
              "{sanitizedTopic}"
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-neutral-100 text-center">
            <div className="p-3 bg-neutral-50 rounded-xl">
              <div className="text-xs text-neutral-500">Task Achievement</div>
              <div className="text-lg font-extrabold text-blue-600">
                {sample.bandBreakdown.taskAchievement.toFixed(1)}
              </div>
            </div>
            <div className="p-3 bg-neutral-50 rounded-xl">
              <div className="text-xs text-neutral-500">Coherence & Cohesion</div>
              <div className="text-lg font-extrabold text-blue-600">
                {sample.bandBreakdown.coherenceCohesion.toFixed(1)}
              </div>
            </div>
            <div className="p-3 bg-neutral-50 rounded-xl">
              <div className="text-xs text-neutral-500">Lexical Resource</div>
              <div className="text-lg font-extrabold text-blue-600">
                {sample.bandBreakdown.lexicalResource.toFixed(1)}
              </div>
            </div>
            <div className="p-3 bg-neutral-50 rounded-xl">
              <div className="text-xs text-neutral-500">Grammatical Range</div>
              <div className="text-lg font-extrabold text-blue-600">
                {sample.bandBreakdown.grammaticalRange.toFixed(1)}
              </div>
            </div>
          </div>
        </header>

        {/* Key Takeaways Section */}
        <section aria-labelledby="takeaways-heading" className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 mb-8">
          <h2 id="takeaways-heading" className="text-lg font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
            Band 7.5+ Upgrade Key Takeaways
          </h2>
          <ul className="space-y-2 text-sm text-neutral-700">
            {sample.keyTakeaways.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="text-blue-600 font-bold">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Side-by-Side Sentence Evaluation & Word Diff */}
        <section aria-label="Sentence-by-Sentence Evaluation" className="mb-12">
          <SideBySideView sentences={sample.sentences} defaultBand="7.5" />
        </section>

        {/* Original Draft Display (PII Sanitized) */}
        <section aria-labelledby="raw-draft-heading" className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 id="raw-draft-heading" className="text-base font-bold text-neutral-900">
              Original Student Draft (Sanitized)
            </h2>
            <span className="text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full font-medium">
              Zero PII Leakage Guaranteed
            </span>
          </div>
          <p className="text-sm text-neutral-700 leading-relaxed bg-neutral-50 p-4 rounded-xl border border-neutral-200/60 font-serif">
            {sanitizedDraft}
          </p>
        </section>

        {/* Call-to-Action Card */}
        <section className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-md text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Evaluate Your Own IELTS Writing Task 2 Essay
            </h2>
            <p className="text-blue-100 text-sm mt-1 max-w-xl">
              Get instant sentence-by-sentence Myers diff, academic collocations, and save mistakes directly into your personal SM-2 spaced repetition quiz deck.
            </p>
          </div>
          <Link
            href="/"
            className="px-6 py-3 bg-white text-blue-700 font-bold rounded-xl shadow hover:bg-blue-50 transition-all shrink-0 text-sm"
          >
            Start Free Evaluation
          </Link>
        </section>
      </main>
    </>
  );
}
