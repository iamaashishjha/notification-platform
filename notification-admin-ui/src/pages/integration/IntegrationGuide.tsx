import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, getErrorMessage } from '../../api/client';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { CheckCircle2, Clipboard, ExternalLink, KeyRound, Send, ShieldCheck, Terminal, XCircle } from 'lucide-react';

type IntegrationData = {
  tenant: { id: string; name: string; slug: string; status: string };
  environment: { name: string; api_base_url: string; admin_base_url: string; api_version: string };
  authentication: { method: string; header: string; secret_display: string };
  summary: {
    status: string;
    completion_percent: number;
    active_credentials: number;
    enabled_channels: number;
    active_providers: number;
    active_templates: number;
    rate_limit_per_second: number;
    daily_quota: number;
    last_successful_api_request: string;
    last_successful_notification: string;
    last_notification_queued: string;
    webhook_status: string;
    recommended_next_action: string;
  };
  checklist: { id: string; label: string; status: string; complete: boolean; description: string; why_it_matters: string; action_path: string }[];
  channels: { channel: string; enabled: boolean; direction: string; rate_limit_per_second: number; daily_quota: number }[];
  credentials: { id: string; name: string; scopes: string; status: string; last_used_at: string; expires_at: string; created_at: string }[];
  recent_errors: { notification_id: string; channel: string; provider: string; status: string; failure: { code: string; suggested_action: string }; updated_at: string }[];
};

export function IntegrationGuide({ endpoint, platformTenantId }: { endpoint: string; platformTenantId?: string }) {
  const [data, setData] = useState<IntegrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('curl');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    setLoading(true);
    apiRequest<{ data: IntegrationData }>(endpoint)
      .then((res) => { setData(res.data); setError(''); })
      .catch((err) => setError(getErrorMessage(err, 'Unable to load integration guide')))
      .finally(() => setLoading(false));
  }, [endpoint]);

  const examples = useMemo(() => data ? buildExamples(data) : {}, [data]);

  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(''), 1600);
  }

  if (loading) return <div className="py-8 text-center text-slate-400">Loading integration guide...</div>;
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
  if (!data) return <div className="py-8 text-center text-slate-400">No integration data found</div>;

  const credentialPath = platformTenantId ? `/tenants/${platformTenantId}` : '/api-keys';
  const notificationPath = '/notifications';

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{data.tenant.name} integration</h2>
              <p className="mt-1 text-sm text-slate-500">Tenant ID <code className="font-mono">{data.tenant.id}</code></p>
            </div>
            <StatusBadge status={data.summary.status} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label="Completion" value={`${data.summary.completion_percent}%`} />
            <Metric label="Active credentials" value={data.summary.active_credentials} />
            <Metric label="Enabled channels" value={data.summary.enabled_channels} />
          </div>
          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{data.summary.recommended_next_action}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Environment</h3>
          <dl className="mt-3 space-y-3 text-sm">
            <Info label="API base URL" value={data.environment.api_base_url} onCopy={() => copy('api-base', data.environment.api_base_url)} copied={copied === 'api-base'} />
            <Info label="Version" value={data.environment.api_version} />
            <Info label="Auth" value={data.authentication.header} />
          </dl>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Integration checklist</h3>
          <span className="text-xs font-medium text-slate-500">{data.checklist.filter((item) => item.complete).length}/{data.checklist.length} complete</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.checklist.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 px-4 py-3">
              <div className="flex items-start gap-3">
                {item.complete ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} /> : <XCircle className="mt-0.5 shrink-0 text-slate-300" size={18} />}
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{item.label}</div>
                  <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  <Link to={item.action_path} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">Open related page <ExternalLink size={12} /></Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <GuideCard icon={KeyRound} title="1. Create credentials" text="Create a tenant API key from API Keys. The raw key is shown once, then stored only as a hash." link={credentialPath} />
        <GuideCard icon={ShieldCheck} title="2. Authenticate" text="Send the key as Authorization: Bearer YOUR_API_KEY. Do not place API keys in browser code or mobile apps." />
        <GuideCard icon={Send} title="3. Send and inspect" text="POST a notification request, then open Notification Logs with the returned notification ID." link={notificationPath} />
      </section>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">First notification quick start</h3>
          <p className="mt-1 text-sm text-slate-500">Copy one example, replace `YOUR_API_KEY`, and run it from a trusted server environment.</p>
        </div>
        <div className="border-b border-slate-200 px-5 py-3">
          <div className="flex flex-wrap gap-1">
            {Object.keys(examples).map((key) => <button key={key} onClick={() => setTab(key)} className={`focus-ring rounded-md px-3 py-1.5 text-xs font-medium ${tab === key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{key}</button>)}
          </div>
        </div>
        <div className="p-5">
          <div className="mb-3 flex justify-end">
            <Button size="sm" icon={copied === tab ? CheckCircle2 : Clipboard} onClick={() => copy(tab, examples[tab] || '')}>{copied === tab ? 'Copied' : 'Copy'}</Button>
          </div>
          <pre className="overflow-x-auto rounded-md bg-slate-950 p-4 text-sm leading-6 text-slate-100"><code>{examples[tab]}</code></pre>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Success is HTTP `202 Accepted`. That means the platform accepted and queued the notification; it does not mean the provider delivered it yet. Use the returned `notification_id` in Notification Logs.
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Rate limits and quotas</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Metric label="Requests/sec across enabled channels" value={data.summary.rate_limit_per_second} />
            <Metric label="Daily quota across enabled channels" value={data.summary.daily_quota} />
          </div>
          <div className="mt-4 space-y-2">
            {data.channels.map((channel) => <div key={channel.channel} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"><span className="capitalize">{channel.channel.replace(/_/g, ' ')}</span><span className="text-slate-500">{channel.rate_limit_per_second}/s · {channel.daily_quota}/day</span></div>)}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Recent integration errors</h3>
          {data.recent_errors.length === 0 ? <p className="mt-4 rounded-md border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">No recent failed deliveries</p> : <div className="mt-3 space-y-2">{data.recent_errors.map((item) => <div key={`${item.notification_id}-${item.updated_at}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{item.notification_id}</span><StatusBadge status={item.status} /></div><p className="mt-1 text-slate-600">{item.failure.code}: {item.failure.suggested_action}</p></div>)}</div>}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Tenant-facing API reference</h3>
        <div className="mt-4 space-y-4 text-sm text-slate-700">
          <Endpoint method="POST" path="/api/v1/notifications" label="Submit notification" />
          <p><b>Authentication:</b> API key in `Authorization: Bearer YOUR_API_KEY`.</p>
          <p><b>Idempotency:</b> send `idempotency_key` in the JSON body. Use a unique business key such as `order-123-confirmation` when retrying after a client timeout.</p>
          <p><b>Correlation:</b> the API generates a request ID in logs. Store the returned `notification_id` and search it in Notification Logs.</p>
          <p><b>Errors:</b> `401` means the API key is invalid or revoked, `403` means scope or tenant access is denied, `400` means validation/configuration failed, and `429` means rate limit exceeded.</p>
          <p><b>Webhooks:</b> inbound/outbound webhook configuration is not implemented yet, so webhook signatures and payload delivery are documented as roadmap items rather than active APIs.</p>
        </div>
      </section>
    </div>
  );
}

function buildExamples(data: IntegrationData): Record<string, string> {
  const url = `${data.environment.api_base_url}/notifications`;
  const payload = `{
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
    "customer_name": "Developer",
    "message": "Hello from ${data.tenant.slug}"
  },
  "priority": 5,
  "schedule": { "type": "instant" },
  "idempotency_key": "integration-test-001"
}`;
  return {
    curl: `curl --request POST '${url}' \\
  --header 'Authorization: Bearer YOUR_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data '${payload}'`,
    JavaScript: `const response = await fetch('${url}', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${payload})
});
const body = await response.json();
if (!response.ok) throw new Error(body.error || 'Notification failed');
console.log(body.notification_id);`,
    Node: `import fetch from 'node-fetch';

const controller = new AbortController();
setTimeout(() => controller.abort(), 10000);

const response = await fetch('${url}', {
  method: 'POST',
  signal: controller.signal,
  headers: { Authorization: 'Bearer YOUR_API_KEY', 'Content-Type': 'application/json' },
  body: JSON.stringify(${payload})
});
console.log(response.status, await response.json());`,
    PHP: `<?php
$payload = ${phpArrayPayload(data.tenant.slug)};
$ch = curl_init('${url}');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer YOUR_API_KEY', 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS => json_encode($payload),
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 10,
]);
$body = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
echo $status . PHP_EOL . $body;`,
    Laravel: `use Illuminate\\Support\\Facades\\Http;

$response = Http::timeout(10)
    ->withToken('YOUR_API_KEY')
    ->post('${url}', ${phpArrayPayload(data.tenant.slug)});

if ($response->failed()) {
    throw new RuntimeException($response->body());
}

$notificationId = $response->json('notification_id');`,
    Python: `import requests

payload = ${pythonPayload(data.tenant.slug)}
response = requests.post(
    '${url}',
    headers={'Authorization': 'Bearer YOUR_API_KEY', 'Content-Type': 'application/json'},
    json=payload,
    timeout=10,
)
response.raise_for_status()
print(response.json()['notification_id'])`,
    Go: `package main

import (
  "bytes"
  "context"
  "fmt"
  "net/http"
  "time"
)

func main() {
  body := []byte(\`${payload}\`)
  ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
  defer cancel()
  req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "${url}", bytes.NewReader(body))
  req.Header.Set("Authorization", "Bearer YOUR_API_KEY")
  req.Header.Set("Content-Type", "application/json")
  resp, err := http.DefaultClient.Do(req)
  if err != nil { panic(err) }
  defer resp.Body.Close()
  fmt.Println(resp.Status)
}`,
  };
}

function phpArrayPayload(slug: string) {
  return `[
  'event' => 'integration.test',
  'channels' => ['email'],
  'template' => 'welcome',
  'target' => ['type' => 'single', 'recipient' => ['email' => 'developer@example.com']],
  'data' => ['customer_name' => 'Developer', 'message' => 'Hello from ${slug}'],
  'priority' => 5,
  'schedule' => ['type' => 'instant'],
  'idempotency_key' => 'integration-test-001',
]`;
}

function pythonPayload(slug: string) {
  return `{
    'event': 'integration.test',
    'channels': ['email'],
    'template': 'welcome',
    'target': {'type': 'single', 'recipient': {'email': 'developer@example.com'}},
    'data': {'customer_name': 'Developer', 'message': 'Hello from ${slug}'},
    'priority': 5,
    'schedule': {'type': 'instant'},
    'idempotency_key': 'integration-test-001',
}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"><div className="text-xs font-semibold uppercase text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold text-slate-900">{value}</div></div>;
}

function Info({ label, value, onCopy, copied }: { label: string; value: string; onCopy?: () => void; copied?: boolean }) {
  return <div><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700">{value || '-'}</code>{onCopy && <button onClick={onCopy} className="focus-ring rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title={copied ? 'Copied' : 'Copy'}>{copied ? <CheckCircle2 size={15} /> : <Clipboard size={15} />}</button>}</dd></div>;
}

function GuideCard({ icon: Icon, title, text, link }: { icon: typeof Terminal; title: string; text: string; link?: string }) {
  const body = <div className="rounded-md border border-slate-200 bg-white p-4"><Icon className="text-blue-600" size={20} /><h3 className="mt-3 font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div>;
  return link ? <Link to={link}>{body}</Link> : body;
}

function Endpoint({ method, path, label }: { method: string; path: string; label: string }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"><span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">{method}</span><code className="font-mono text-sm">{path}</code><span className="text-slate-500">{label}</span></div>;
}
