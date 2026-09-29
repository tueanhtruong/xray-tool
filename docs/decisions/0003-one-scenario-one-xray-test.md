# 0003 — One scenario = one Xray Cucumber test

- Status: accepted (assumption, revisable before US-06/US-08)
- Date: 2026-09-29
- Source: [user-stories README, assumption 1](../user-stories/README.md#assumptions-to-confirm)

## Context

The app has to map between Markdown/Gherkin files and Xray Cloud tests without losing anything.

## Decision

Each Gherkin `Scenario` / `Scenario Outline` maps to exactly one Xray test of type **Cucumber**:

- Jira summary = scenario name.
- Xray Gherkin definition = the scenario's steps, plus its `Examples` table for outlines.
- The `@xray-KEY` tag links the scenario to an existing test. Scenarios without it are new tests.

## Consequences

- A `Feature` is only a grouping and container on import/export; it isn't an Xray entity.
- The parser (US-06), pull (US-08), and sync (US-18/US-19) all assume this 1:1 mapping.
