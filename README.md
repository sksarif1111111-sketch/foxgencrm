# Foxgencrm

I have uploaded 5 complete documentation files for a Digital Products CRM + Telegram Bot Store:

1. PRD.md - Product Requirements

2. DESIGN.md - System Architecture

3. TECH.md - Technical Stack & Code Examples

4. RULES.md - Development Guidelines

5. MEMORY.md - Project Context

Please build the complete system following these documents exactly.

Start with Phase 1 - CRM Dashboard:

1. Set up Supabase database schema from DESIGN.md

2. Create Next.js 14 project structure from TECH.md

3. Build authentication (owner login)

4. Build dashboard page with today's revenue/profit stats

5. Build orders list page with filters

6. Build manual order form

7. Build customer management

8. Build product pricing configuration

9. Build reports page

Then Phase 2 - Telegram Bot:

1. Set up Grammy bot with conversations

2. Implement shopping flow from DESIGN.md

3. Integrate with Reseller API

4. Connect to Supabase database

5. Test end-to-end order flow

Follow all patterns from TECH.md and rules from RULES.md.

Use TypeScript strict mode, Tailwind CSS, shadcn/ui components.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://foxgencrm.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/89ef405a-3b92-4a46-a34f-3186c0336acf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
