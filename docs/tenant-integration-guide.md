# Tenant Integration Guide

The admin portal now includes a tenant-scoped **Integration Guide** for technical users and platform support users.

## Portal Locations

- Tenant users: **Access → Integration**
- Platform admins: **Tenants → Tenant Details → Integration**

Both views are backed by tenant-scoped backend APIs and do not expose existing API key secrets.

## Backend APIs

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/admin/api/v1/integration` | `integration.view` | Current tenant integration overview, checklist, credentials metadata, limits, examples context, and recent errors |
| `GET` | `/admin/api/v1/tenants/{id}/integration` | `integration.view` | Platform-admin tenant integration support view |

The backend resolves the tenant from the authenticated session for `/integration`. For `/tenants/{id}/integration`, non-platform users are denied unless the route tenant matches their tenant.

## Tenant-Facing Notification API

The currently supported tenant-facing submit endpoint is:

```http
POST /api/v1/notifications
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

Example body:

```json
{
  "event": "integration.test",
  "channels": ["email"],
  "template": "welcome",
  "target": {
    "type": "single",
    "recipient": {
      "email": "developer@example.com"
    }
  },
  "data": {
    "customer_name": "Developer"
  },
  "priority": 5,
  "schedule": { "type": "instant" },
  "idempotency_key": "integration-test-001"
}
```

Success returns `202 Accepted` with a `notification_id`. Acceptance means the platform accepted and queued the notification; provider delivery status must be checked in Notification Logs.

## Authentication

The platform currently supports tenant API-key authentication for tenant-facing notification submission. The API key is created in the portal and shown once. After creation, only metadata is displayed; the stored key value is hashed.

Use:

```http
Authorization: Bearer YOUR_API_KEY
```

Credential operations are controlled by existing API key permissions:

- `api_keys.view`
- `api_keys.create`
- `api_keys.revoke`

Integration guide visibility uses:

- `integration.view`
- `integration.test`
- `integration.view_api_docs`

Backward compatibility maps `integration.view` to `api_keys.view` and `integration.test` to `notifications.send`.

## Checklist Calculation

The checklist is computed from real tenant state:

- Tenant active
- Active API credential exists
- API key has been used at least once
- At least one channel is enabled
- At least one provider is active
- At least one active template exists
- At least one notification has been queued
- At least one delivery has been sent

No checklist item is manually marked complete by the frontend.

## Security

The integration APIs return only safe credential metadata:

- Key ID
- Name
- Scopes
- Status
- Last-used timestamp
- Expiry timestamp
- Created timestamp

They never return key hashes, raw API keys, provider secrets, webhook secrets, access tokens, refresh tokens, or authorization headers.

## Provider Configuration UI

Tenant users manage provider settings from **Configuration → Providers**. The portal uses provider-specific fields instead of a single raw JSON input for common providers.

Current first-class provider forms include:

- SMTP: host, port, username, password, from address.
- SendGrid: API key, verified sender, sender name, base URL.
- Mailgun: API key, sending domain, region, from address.
- Postmark: server token, from address, message stream.
- Brevo: API key, sender email/name, template ID.
- Resend: API key, from address.
- Generic HTTP SMS: URL, method, token, token header, phone/message field keys, timeout, body pattern.
- Sparrow SMS: URL, token, sender identity, body pattern.
- Twilio SMS: Account SID, auth token, from number or messaging service SID, status callback.
- Infobip SMS: base URL, API key, sender.
- Firebase Cloud Messaging: service account JSON or service account path.
- OneSignal, Web Push VAPID, mock providers, WebSocket, and in-app providers.

Providers without a known public schema fall back to custom key/value rows. Existing secret values are never loaded back into the form. When editing, leave secret fields blank to keep existing encrypted values unless rotating them.

## Current Limitations

- OpenAPI generation is not implemented yet.
- Postman/Insomnia collection generation is not implemented yet.
- Webhook configuration, webhook signatures, and webhook test delivery are not implemented yet.
- The test console is represented by copyable examples and the existing Send Notification page; it is not yet a full request builder.
- Existing API errors are still mostly `{ "error": "message" }`; a fully normalized public error-code model remains future work.
