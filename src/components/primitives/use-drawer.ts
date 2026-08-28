'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Modal-drawer keyboard behaviour: Escape, a focus trap, and a scroll lock.
 *
 * =============================================================================
 * WHY THIS IS SHARED
 * =============================================================================
 * This project has two navigation drawers. The public one, built in Phase 11,
 * does all of the below and has the assertions to prove it. The admin one,
 * built later, did NONE of it — Topic 11 measured both in the same run:
 *
 *   public drawer   Escape closed it: true
 *   admin drawer    Escape closed it: false, 15 focusable controls behind it
 *
 * So the institute owner, who is the one person guaranteed to use the admin,
 * got the worse of the two. Nobody decided that; the second drawer was simply
 * written without looking at the first, which is the failure mode a shared
 * primitive exists to prevent.
 *
 * =============================================================================
 * WHY THE TAB HANDLING IS NOT OPTIONAL
 * =============================================================================
 * `aria-modal="true"` tells assistive technology that everything behind the
 * dialog is inert. It does NOT stop the browser moving keyboard focus there.
 * Phase 11 measured that on the public drawer: tabbing walked straight out into
 * the page underneath, which is still rendered, still focusable and completely
 * hidden behind the panel — so a keyboard or switch-control user ended up
 * operating controls they could not see.
 *
 * The wrap below is the ARIA authoring-practices modal pattern: from the last
 * control Tab goes to the first, from the first Shift+Tab goes to the last.
 */
export function useDrawer({
  open,
  onClose,
  dialogRef,
  triggerRef,
  initialFocusRef,
}: {
  open: boolean;
  /** Must be referentially stable, or the listener re-subscribes every render. */
  onClose: () => void;
  /** The panel. Everything focusable inside it is what the trap cycles through. */
  dialogRef: RefObject<HTMLElement | null>;
  /** Focus goes back here on close, so the keyboard does not land at the top. */
  triggerRef?: RefObject<HTMLElement | null>;
  /** Where focus goes on open. Usually the close button. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!open) return;

    function focusable(): HTMLElement[] {
      const root = dialogRef.current;
      if (!root) return [];
      return [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null || el === document.activeElement);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        triggerRef?.current?.focus();
        return;
      }

      if (e.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // Focus outside the dialog at all (it can drift there on open) is pulled
      // back to the first control rather than left where it is.
      if (!active || !dialogRef.current?.contains(active)) {
        e.preventDefault();
        first?.focus();
        return;
      }
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first?.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last?.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    initialFocusRef?.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // `onClose` is required to be stable; the refs are refs.
  }, [open, onClose, dialogRef, triggerRef, initialFocusRef]);
}
