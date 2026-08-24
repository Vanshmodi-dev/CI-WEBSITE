'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { signIn } from '@/lib/auth';
import { clientIpFrom } from '@/lib/enquiry';
import { peekBurst, recordBurstHit } from '@/lib/rate-limit';
import { hashIp } from '@/lib/crypto';
import { log, ipHashPrefix } from '@/lib/log';
import type { LoginState } from './state';

/**
 * Sign-in action.
 *
 * Rate limited by hashed IP, reusing the same burst limiter the public enquiry
 * form uses — an unthrottled sign-in endpoint is a password-guessing oracle.
 *
 * ⚠ ONLY FAILURES ARE CHARGED AGAINST THE LIMIT. The limiter used to consume a
 * slot on every attempt, so three CORRECT sign-ins inside a minute locked the
 * owner out of their own admin panel — measured in Phase 11, and realistic
 * because the institute's devices share one public IP and signing out now
 * revokes every session. An attacker sending wrong passwords is throttled
 * exactly as hard as before; someone who knows their password is never
 * throttled at all.
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

  const limitKey = `admin-login:${ipHash}`;
  const burst = peekBurst(limitKey);
  if (!burst.allowed) {
    log.warn('admin.signin.rate_limited', { ip: ipHashPrefix(ipHash) });
    return {
      status: 'error',
      message: 'Too many attempts. Please wait a minute and try again.',
    };
  }

  if (!email || !password) {
    // A blank form is a mistake, not an attempt. It costs no hashing and no
    // database round trip, so it charges nothing.
    return { status: 'error', message: 'Enter your email and password.' };
  }

  const result = await signIn(email, password);

  if (!result.ok) {
    // Charge the slot here, not before the attempt: a wrong password is what
    // this limit exists to make expensive.
    if (result.reason === 'invalid') recordBurstHit(limitKey);
    if (result.reason === 'unavailable') {
      return {
        status: 'unavailable',
        message: 'Sign-in is unavailable right now. Please try again shortly.',
      };
    }
    // Throttled must NOT be reported as a credential failure. Telling the owner
    // their password is wrong when it is merely rate-limited sends them off to
    // reset a password that works — and it hides from them that something is
    // hammering their account.
    if (result.reason === 'throttled') {
      return {
        status: 'error',
        message:
          'Too many attempts. For safety this account is paused for a few minutes — please try again shortly.',
      };
    }
    return { status: 'error', message: 'That email or password is not correct.' };
  }

  redirect('/admin');
}
