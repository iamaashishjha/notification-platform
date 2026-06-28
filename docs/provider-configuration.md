# Provider configuration

Choose option 7 in `./run.sh` to prepare local provider settings. The runner hides secret input, never prints entered values, stores environment values in ignored `notification-core-api/.env.local`, and writes only non-secret provider names to ignored `notification-core-api/config/providers.local.json`.

The current email, SMS, FCM, and WebSocket workers use mock adapters in code. Real-provider settings below are configuration scaffolding for future adapters; setting them does not yet send a real message. This limitation keeps local behavior explicit and safe.

## Mock mode

Mock is the default and the only currently implemented delivery mode:

```env
PROVIDER_MODE=mock
EMAIL_PROVIDER=mock
SMS_PROVIDER=mock
```

The generated local JSON has this shape:

```json
{
  "mode": "mock",
  "email": { "provider": "mock" },
  "sms": { "provider": "mock" },
  "fcm": { "provider": "mock" },
  "websocket": { "enabled": true }
}
```

Mock delivery creates a provider message ID and a delivery attempt without contacting an external service.

## SMTP example

Put values only in `notification-core-api/.env.local`:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-secret
SMTP_FROM=notifications@example.com
```

The runner also recognizes `sendgrid` and `ses` placeholders. Their adapter implementation and production secret source are future work.

## Sparrow SMS example

```env
SMS_PROVIDER=sparrow
SPARROW_TOKEN=your-secret
SPARROW_FROM=YourBrand
```

## Twilio SMS example

```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-secret
TWILIO_FROM=+10000000000
```

`generic_http_sms` can be prepared with `GENERIC_HTTP_SMS_URL` and `GENERIC_HTTP_SMS_TOKEN`.

## FCM example

```env
FCM_PROJECT_ID=your-project-id
FCM_SERVICE_ACCOUNT_PATH=/absolute/path/to/fcm-service-account.json
```

Store the service-account JSON outside the repository. The path is consumed by the backend worker only; never place its contents in a Vite variable or browser bundle.

## Tenant mapping

`tenant_provider_configs` selects a provider per tenant and channel. Environment/local JSON configuration supplies the process-level provider implementation and its credentials. A future real adapter should resolve them in this order:

1. Validate the tenant's active default provider record.
2. Select the matching backend adapter.
3. Load credentials from backend environment or a production secret manager.
4. Store only redacted response metadata in delivery logs.

The local seed maps every demo-tenant channel to `mock`. Changing environment values alone must not silently override tenant policy.

## Security rules

- Never commit `.env`, `.env.local`, `*.local.json`, tokens, passwords, or service-account files.
- Never put provider credentials in `VITE_*`; those values are visible to browsers.
- Use the interactive runner's hidden prompts for tokens and passwords.
- Use a secret manager or mounted secrets in production, not checked-in environment files.
- Rotate any credential that was printed, logged, or committed accidentally.

