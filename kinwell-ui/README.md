# Kinwell UI — React + Tailwind hand-off

The patient app's user interface from Kinwell (a family health assistant), exported as plain **React 19 +
Tailwind CSS 4 + TypeScript** with no Next.js dependency. It runs on its own as a Vite project with a working
demo, and the components can be dropped into any React app.

```bash
npm install
npm run dev        # http://localhost:5173 — the demo: real app shell + chat on sample data
npm run build      # type-check and production build
```

In the demo, type anything in the chat, then tap a spot on the body map. Everything else (menu, Emergency panel,
dialogs) is the real UI; calls that need a backend show a friendly "not available" message.

## What's in here

| Folder | Contents |
| --- | --- |
| `src/components/ui` | Design-system primitives: `Button`, `Dialog`, form fields, `Card`, `Badge`, menus, page layout |
| `src/components/charts` | `TrendChart` (Recharts) for readings and lab trends |
| `src/features/shell` | App frame: `AppShell` (sidebar, top bar, mobile drawer, bottom tabs), Emergency panel, upload / camera / reading / folder / profile dialogs, `ShellProvider` |
| `src/features/chat` | `ChatView`, `Composer`, `MessageList`, `HomeEmpty`, and every chat card: guided questions (chips, scales, multi-select, number entry, **body map**), care level, emergency, doctor recommendation, measurement, report summary, info cards |
| `src/features/reports` | `ReportsBrowser` (folders, filters, grid/list), result confirmation, file buttons, report settings |
| `src/features/family` | Profile editor, conditions and allergies editors, emergency contacts, "Chat about …" |
| `src/features/my-doctor` | The family's regular doctor: details card and form |
| `src/features/settings` | Account form, privacy controls, sign-out |
| `src/lib/ai/types.ts` | **The chat card contract** — every card type the backend can send (`ChatCard` union) |
| `src/types` | Domain types and the data shapes from the backend (`server.ts`: `Message`, `ReportRow`, …) |
| `src/adapters` | Stand-ins for `next/link` and `next/navigation` |
| `src/api` | Typed stubs for every backend call the components make |
| `src/styles/index.css` | Tailwind v4 theme: colours, radii, shadows, animations |
| `src/demo` | Demo app, sample data and a scripted mock backend |
| `reference/next-pages` | The original Next.js pages, for reference only (not compiled) |

## Using the components in your app

1. **Copy** `src/components`, `src/features`, `src/lib`, `src/types`, `src/adapters`, `src/api` and `src/styles`.
2. **Path alias:** the code imports with `@/…` meaning `src/…`. Add the alias to your bundler and `tsconfig.json`
   (see `vite.config.ts` and `tsconfig.json` here).
3. **Styles:** import `src/styles/index.css` once at your app root. It uses Tailwind v4's CSS-first `@theme`, so
   you need `@tailwindcss/vite` (or `@tailwindcss/postcss`) — there is no `tailwind.config.js`. Load the **Inter**
   font (see `index.html`).
4. **Routing:** `src/adapters/navigation.ts` and `link.tsx` use the browser History API. With React Router, replace
   their bodies as shown in the comments at the top of each file. Keep `useRouter()` returning a **stable** object
   (`useMemo`) — components list it in effect dependencies.
5. **Backend:** see *Connecting the backend* below.
6. **Dependencies:** the ones in `package.json` — `react`, `react-dom`, `lucide-react`, `recharts`,
   `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `clsx`, `tailwind-merge`, `zod`.

## Screens and the data they need

The page files in `reference/next-pages` show each screen's layout. They load data on the server, so in your app
fetch the same data from your API and pass it in:

| Screen (original route) | Built from | Needs |
| --- | --- | --- |
| Every screen | `AppShell` | `ShellData` (`src/features/shell/types.ts`): user, family, profiles, folders, recent chats, My Doctor, country — see `src/demo/sample-data.ts` |
| Chat home (`/app`) | `ChatView` + `HomeEmpty` | `profileId`; optional check-ins |
| A chat (`/app/chat/:id`) | `ChatView` | `conversationId`, `profileId`, `initialMessages: Message[]` |
| Reports (`/reports`, `/reports/folder/:id`) | `ReportsBrowser` | folders, reports (`ReportRow[]`), profiles, filters, and `thumbs` — a map of report id → thumbnail URL |
| A report (`/reports/:id`) | `OpenFileButtons`, `ResultConfirm`, `MedicationResultConfirm`, `ReportSettings`, `DeleteReportInline`, `ReportStatusBadge`, `AskAboutReport` | the report, its extracted results and files |
| Family (`/family`, `/family/:id`) | `AddProfileButton`, `EditProfileButton`, `PhotoButton`, `ConditionsEditor`, `AllergiesEditor`, `EmergencyContacts`, `DeleteProfile`, `ChatAboutButton` | the profile, conditions, allergies, contacts, timeline |
| My Doctor (`/my-doctor`) | `MyDoctorDetails`, `MyDoctorEmpty`, the form in `my-doctor-form.tsx` | the saved doctor |
| Profile (`/profile`, `/profile/privacy`) | `AccountForm`, `PrivacyControls`, `SignOutButton` | the account and consent settings |

## Connecting the backend

Every call the components make goes through `src/api/*` → `call()` in `src/api/client.ts`. By default it sends:

```
POST {VITE_API_BASE ?? "/api"}/actions/{name}
Content-Type: application/json
Body: the arguments as a JSON array, e.g. ["conversation-id", "I have pain", { "key": "pain_location", "value": "left:knee:front" }]
```

File uploads (`uploadReportAction`, photo uploads) are sent as multipart form data: the original form fields plus
`__args` (the other arguments as JSON). Every response must be JSON in this shape:

```ts
{ ok: true, data?: T, message?: string } | { ok: false, error: string, fieldErrors?: Record<string, string> }
```

The functions, their arguments and their `data` types are in `src/api/*.ts`. The most important are
`startConversationAction` and `sendMessageAction`: they return the user's message and the assistant's reply, whose
`cards` drive the whole guided experience (questions, care levels, emergencies, doctor suggestions).

To use your own API client instead, call `setTransport((name, args) => …)` once at startup (the demo does this in
`src/demo/mock-api.ts`).

### Where the intelligence lives

This package is the **interface only**. The symptom checks, safety and emergency rules, Hindi/Hinglish
understanding, report reading and AI calls run on the Kinwell server (the original Next.js project: `lib/ai`,
`lib/clinical`, `lib/services`, `database/`). Either run that server and expose the calls above, or port that code
to your backend. Emergency numbers shown in the UI come from `src/lib/clinical/emergency-config.ts`.

## Notes for the developer

- The components came from Next.js "client components"; the `"use client"` lines were removed and nothing else
  about them changed, so they stay in sync with the original app.
- `router.refresh()` in Next.js re-fetches server data. Here it calls the listeners in `refreshListeners`
  (`src/adapters/navigation.ts`) — register your data re-fetch there.
- Dates from the API arrive as ISO strings; the components handle both strings and `Date` objects.
- Accessibility is built in (labels, focus styles, reduced motion, large text and high-contrast modes via
  `data-*` attributes on `<html>`); keep those when restyling.
- All clinical wording is demo content pending clinical review.

To regenerate this package after UI changes, run `npm run export:ui` in the Kinwell project.
