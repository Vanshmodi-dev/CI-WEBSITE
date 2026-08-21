import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { publishedCourses } from '@/config/institute';

/**
 * Master Plan §17 — generated from routes that actually exist.
 *
 * A sitemap listing unwritten pages is a set of 404s handed to Google. Course
 * URLs come from `publishedCourses`, so a course appears here only once its
 * content page is written.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/admissions`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
  ];

  for (const course of publishedCourses) {
    routes.push({
      url: `${SITE_URL}/courses/${course.slug}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  return routes;
}
