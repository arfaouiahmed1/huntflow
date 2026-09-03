# Task 19 — Evidence: Harden responsive NotificationCenter and toast placement

**Date:** 2026-08-29
**Scope:** `src/components/NotificationCenter.tsx` (133 lines, was 282) + `src/components/ui/Toaster.tsx` (140, was 128)

## Implementation

- Shrunk `NotificationCenter.tsx` 282 → 133 lines (-53%) via bounded rewrite.
- Responsive: single column at 375px (`grid-cols-1` for notification list; control row stacks via `flex flex-wrap`; panel width `w-[calc(100vw-1rem)] sm:w-96`).
- Keyboard: `Esc` closes panel, focus trap via `getFocusable` + `Tab`/`Shift+Tab` loop, `prevFocusRef` restores trigger on close, `role="dialog"` + `aria-modal`.
- Safe-area: toast viewport in `Toaster.tsx` uses `bottom-[calc(1rem+env(safe-area-inset-bottom))]` and `right-[calc(1rem+env(safe-area-inset-right))]`; NotificationCenter dropdown offset avoids sidebar footer (`bottom-4` vs footer `bottom-0` with `lg:pl-[236px]` shell).
- Toast viewport does not cover sidebar footer: `PageShell` `lg:pl-[236px]` reserves sidebar width; toasts anchored to viewport edge with `max-w-[420px]` and `pointer-events-none` container.

## Verification

- `npx tsc --noEmit` 0.
- Bounded sizes: 133 + 140 + 67 = 340 total <500.
- Manual check: panel at 375px renders single column (no horizontal scroll), Esc works, focus cycles inside panel.

## Files

- Modify `src/components/NotificationCenter.tsx` (282→133)
- Modify `src/components/ui/Toaster.tsx` (adds `useMemo` + safe-area calc)
