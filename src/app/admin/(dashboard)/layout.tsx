import { requireAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/admin/shell';

/**
 * Every page in this route group is behind authentication.
 *
 * `requireAdmin()` redirects to the sign-in page when there is no valid
 * session. This is the convenience layer; it is NOT the only check. Server
 * actions re-verify independently, because an action can be POSTed directly
 * without a page ever rendering.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  return <AdminShell adminName={admin.displayName}>{children}</AdminShell>;
}
