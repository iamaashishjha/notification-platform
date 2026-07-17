# React Admin UI Agent Instructions

These instructions apply to all work under `notification-admin-ui/`.

## Verified Frontend Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- `lucide-react`

Follow the existing routing, API client, component, layout, and permission
patterns.

## Important Files

- `src/app/main.tsx`
  - route registration

- `src/layouts/AppLayout.tsx`
  - authenticated layout
  - navigation
  - platform-admin and tenant-user menu separation

- `src/auth/AuthContext.tsx`
  - authentication state
  - user permissions
  - `can(...)` permission helper

- `src/api/client.ts`
  - API wrapper

- `src/components`
  - shared UI components

- `src/pages`
  - application feature pages

## Permission Rules

Every protected UI action must use the existing permission system:

```ts
can("permission.key")
Apply permission checks to:
page access
navigation
create buttons
edit buttons
delete buttons
action menus
bulk actions
export actions
sensitive configuration controls
Frontend permission checks improve user experience but do not replace backend authorization.
Platform-admin and tenant-user experiences must remain separated.
API Integration
Use src/api/client.ts and existing request patterns.
Every API-driven page should handle:
loading state
success state
empty state
validation errors
authentication failure
authorization failure
not-found response
conflict response
server failure
network failure
Do not invent API fields.
Inspect:
backend handlers
response models
related documentation
existing frontend usage
Tenant Safety
Tenant users must not be able to:
select another tenant
submit another tenant's ID
access platform-only controls
view cross-tenant records
manipulate provider configuration outside their tenant
Cross-tenant controls must be restricted to authorized platform users.
Never expose provider secrets, API keys, private keys, or signing credentials in frontend code or browser state.
Shared Components
Reuse existing shared components before creating new ones.
Inspect available:
modal
panel
select
table enhancer
status badge
form controls
confirmation patterns
Preserve established visual and interaction behavior.
Forms
Forms should include:
validation aligned with backend validation
disabled submission while processing
duplicate-submit prevention
field-level errors where possible
meaningful server errors
destructive action confirmation
permission-aware controls
appropriate empty and loading states
Notification Status Rules
Do not treat notification acceptance or queue publication as successful provider delivery.
Distinguish between statuses such as:
accepted
scheduled
queued
processing
delivered
failed
retrying
dead-lettered
read
acknowledged
Use the backend's actual status values and documented meanings.
Authentication
Preserve:
JWT authentication
refresh behavior
logout behavior
permission loading
session handling
platform and tenant navigation separation
Do not store sensitive token information beyond existing project conventions.
Validation
After frontend changes, run:
npm run build
Also run configured lint, type-check, and test commands when available.
Frontend unit and component tests may be limited or missing.
Document manual verification performed for changed flows.
Never claim the build passed unless it was actually executed.
