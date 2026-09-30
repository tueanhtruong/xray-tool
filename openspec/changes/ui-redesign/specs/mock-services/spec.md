## ADDED Requirements

### Requirement: Count write requests in the mock
The mock services SHALL count requests that would modify remote data: Jira REST requests other than GET, and Xray GraphQL requests whose operation is a mutation. Token exchange and Xray authentication requests SHALL NOT be counted. The control endpoint SHALL expose the count in its state response and SHALL support resetting it.

#### Scenario: Read-only traffic
- **WHEN** a workflow issues only Jira GET requests, Xray queries, OAuth token exchange, and Xray authentication
- **THEN** the write-request count is 0

#### Scenario: Count a mutation
- **WHEN** a client sends an Xray GraphQL mutation to the mock
- **THEN** the write-request count increases by one

#### Scenario: Reset the count
- **WHEN** a test sends the reset instruction through the control endpoint
- **THEN** the write-request count returns to 0
