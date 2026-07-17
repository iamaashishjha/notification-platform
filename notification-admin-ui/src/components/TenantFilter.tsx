import { SearchSelect } from './SearchSelect';

export type TenantFilterOption = { id: string; name: string; slug?: string; status?: string };

export function TenantFilter({
  value,
  onChange,
  tenants,
  className = 'w-64',
}: {
  value: string;
  onChange: (value: string) => void;
  tenants: TenantFilterOption[];
  className?: string;
}) {
  return (
    <div className={`block text-sm ${className}`}>
      <label className="mb-1 block font-medium text-slate-700">Tenant</label>
      <SearchSelect
        value={value}
        onChange={onChange}
        placeholder="All tenants"
        options={[
          { value: '', label: 'All tenants' },
          ...tenants.map((tenant) => ({
            value: tenant.id,
            label: tenant.slug ? `${tenant.name} (${tenant.slug})` : tenant.name,
          })),
        ]}
      />
    </div>
  );
}
