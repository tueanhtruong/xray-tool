## MODIFIED Requirements

### Requirement: Protect local work when changing the selected project
The system SHALL block changing a workspace's selected project while that workspace has persisted unsynced local drafts, and SHALL tell the owner to sync or discard those drafts first. The draft guard SHALL use workspace ownership and project association so drafts for another workspace cannot block or authorize a switch. When no drafts exist, the system SHALL require explicit confirmation before switching projects and SHALL atomically clear project-scoped local cache belonging to the previous project with the successful selection update. A rejected or failed switch SHALL preserve the prior selection and all prior project cache data.

#### Scenario: Block project change while persisted drafts exist
- **WHEN** an owner tries to change the selected project while the active workspace has one or more persisted unsynced drafts
- **THEN** the system rejects the change and tells the owner to sync or discard drafts first
- **AND** the selected project and project-scoped cache remain unchanged

#### Scenario: Drafts in another workspace do not block a project change
- **WHEN** an owner changes a project in a workspace that has no drafts but another workspace owned by the same user has drafts
- **THEN** the project change proceeds if the owner confirms it and readiness checks succeed
- **AND** cache data for the selected workspace's previous project is cleared without affecting the other workspace

#### Scenario: Confirm and complete a project change without drafts
- **WHEN** no persisted unsynced drafts exist and the owner confirms a change to a project that passes readiness checks
- **THEN** the system replaces the selected project and atomically clears all project-owned cache data for the previous project
- **AND** the onboarding checklist reports the new project as ready

#### Scenario: Cancel or fail a project change
- **WHEN** the owner cancels confirmation, readiness validation fails, or persistence fails during a project change
- **THEN** the prior selected project and its project-scoped cache remain unchanged

#### Scenario: First project selection does not clear unrelated workspace data
- **WHEN** an owner selects the first ready project for a workspace
- **THEN** the system saves the selection without deleting workspace data that is not owned by a previous project
