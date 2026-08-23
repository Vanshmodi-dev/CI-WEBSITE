import { NextResponse } from 'next/server';
import { signOut } from '@/lib/auth';
import { SITE_URL } from '@/lib/seo';

/**
 * Sign out. POST only.
 *
 * A GET would let any page log the admin out with an <img> tag, and would be
 * triggered by link prefetching. Clearing a session is a state change, so it
 * takes a POST.
 */
export async function POST() {
  await signOut();
  return NextResponse.redirect(new URL('/admin/login', SITE_URL), {
    status: 303,
  });
}
