'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { signIn } from '@/lib/auth';
import { clientIpFrom } from '@/lib/enquiry';
import { checkBurst } from '@/lib/rate-limit';
import { hashIp } from '@/lib/crypto';
import { log, ipHashPrefix } from '@/lib/log';
import type { LoginState } from './state';

/**
 * Sign-in action.
 *
 * Rate limited by hashed IP, reusing the same burst limiter the public enquiry
 * form uses — an unthrottled sign-in endpoint is a password-guessing oracle.
 *
 * Every failure returns the SAME message. Distinguishing "no such account"
 * from "wrong password" would let anyone enumerate which accounts exist.
 */
export async function signInAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const ip = clientIpFrom(await headers());
  const ipHash = hashIp(ip);

  const burst = checkBurst(`admin-login:${ipHash}`);
  if (!burst.allowed) {
    log.warn('admin.signin.rate_limited', { ip: ipHashPrefix(ipHash) });
    return {
      status: 'error',
      message: 'Too many attempts. Please wait a minute and try again.',
    };
  }

  if (!email || !password) {
    return { status: 'error', message: 'Enter your email and password.' };
  }

  const result = await signIn(email, password);

  if (!result.ok) {
    if (result.reason === 'unavailable') {
      return {
        status: 'unavailable',
        message: 'Sign-in is unavailable right now. Please try again shortly.',
      };
    }
    return { status: 'error', message: 'That email or password is not correct.' };
  }

  redirect('/admin');
}
