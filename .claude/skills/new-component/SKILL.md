---
name: new-component
description: Scaffold a new src/components/ui/ design-system component that matches this project's established conventions (forwardRef, cn() from @/lib/utils, semantic design tokens, lucide-react icons, "use client").
disable-model-invocation: true
---

# New UI Component

Scaffolds a `src/components/ui/` component that reads like the rest of the design system.

## Conventions to follow (from existing components: Button.tsx, Modal.tsx, Select.tsx, etc.)

1. **Directive**: components that use hooks or browser APIs start with `"use client";`.
2. **Class merging**: use `cn(...)` from `@/lib/utils` (clsx + tailwind-merge). Never
   hand-concatenate class strings.
3. **Design tokens**: use the semantic palette, NOT hardcoded hex:
   - Backgrounds: `bg-white/[0.03]`, `bg-white/5`, `bg-white/[0.05]`
   - Text: `text-paper` (primary), `text-dim` (muted), `text-dim/70` (faint)
   - Accent: `chartreuse` (actions/active), `coral` (danger), `amber` (warn)
   - Borders/separators: `border-line`, `hover:border-line/60`, `focus:border-chartreuse/50`
   - Raise layer: `bg-[var(--ink-soft)]`, `bg-[var(--paper)]`
4. **Extensible**: use `className` props (and optional `*ClassName` props) merged last via
   `cn(...)` so callers can override.
5. **Forwarded refs**: functional components use `forwardRef` (see Button.tsx).
6. **Icons**: import from `lucide-react` (e.g. `ChevronDown`, `Check`).
7. **File placement & naming**: `src/components/ui/<Name>.tsx`, PascalCase, default or named
   export consistent with sibling usage.
8. **Accessibility**: include `aria-*` attributes appropriate to the control (see
   Select.tsx: `aria-haspopup`, `aria-expanded`, `aria-selected`).
9. **Sizing**: follow existing `sizes`/`variants` record-map pattern when the component has
   variants (see Button.tsx).
10. **JSDoc**: include a short doc comment explaining the component's purpose and why it
    exists in the kit (see Select.tsx header).

## Template

```tsx
"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Short description of the component and its role in the design system. */
export interface <Name>Props extends React.HTMLAttributes<HTMLDivElement> {
  // props here
}

export const <Name> = forwardRef<HTMLDivElement, <Name>Props>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "base styles using semantic tokens…",
          className
        )}
        {...props}
      />
    );
  }
);

<Name>.displayName = "<Name>";
```

## Steps

1. Ask the user for the component name and any props/interactions they want (or infer from
   context). If type-generic (like Select), expose a generic `<T>`.
2. Create `src/components/ui/<Name>.tsx` from the template.
3. If a variant/size system is needed, mirror Button.tsx's `Record<Variant, string>` map.
4. Confirm it imports only from `@/lib/utils`, `react`, and `lucide-react` (or existing deps).

## Anti-patterns

- ✗ Hardcoded colors like `text-[#fff]` — use the token palette.
- ✗ Manual `\`${a} ${b}${c}\`` class concat instead of `cn()`.
- ✗ Forgetting `forwardRef` when the component integrates with forms/DOM returns.
- ✗ Adding new files outside `src/components/ui/` for a generic design-system primitive.