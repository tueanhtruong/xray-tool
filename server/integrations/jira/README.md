# server/integrations/jira

Jira REST client (arrives in US-02/US-03). It receives already-resolved base URLs
from `server/utils/integration-urls.ts` and never reads `integrationTarget` itself.

See [docs/architecture.md](../../../docs/architecture.md).
