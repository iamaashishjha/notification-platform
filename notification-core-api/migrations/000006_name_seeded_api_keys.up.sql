UPDATE tenant_api_keys ak
SET name = t.name || ' API Key', updated_at = now()
FROM tenants t
WHERE ak.tenant_id = t.id
  AND ak.name IN ('Sample API Key', 'Local Demo API Key', 'Test Tenant API Key');
