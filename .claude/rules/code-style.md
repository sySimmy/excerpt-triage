---
paths:
  - src/**
---

# Code Style Rules

- TypeScript strict mode — no `any` unless absolutely necessary
- Use `const` over `let`; never use `var`
- Path imports via `@/*` alias (maps to `./src/*`)
- Component files: PascalCase (`ReadingPanel.tsx`)
- Lib/utility files: kebab-case (`tag-vocab.ts`)
- API routes: `src/app/api/<resource>/route.ts` (Next.js App Router convention)
- Prefer named exports over default exports (except page/layout components)
- Use `interface` for object shapes; use `type` for unions and intersections
- Tailwind CSS 4 for all styling — no inline style objects unless dynamic values required
- SWR for client-side data fetching; fetch API for server-side
- Keep components focused — extract logic into `src/lib/` when reusable
