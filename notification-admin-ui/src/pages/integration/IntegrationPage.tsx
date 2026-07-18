import { Panel } from '../../components/Panel';
import { IntegrationGuide } from './IntegrationGuide';

export function IntegrationPage() {
  return (
    <Panel title="Integration Guide">
      <IntegrationGuide endpoint="/admin/api/v1/integration" />
    </Panel>
  );
}
