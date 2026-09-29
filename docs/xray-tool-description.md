# bdd-xray-testcases

## Overview

`bdd-xray-testcases` is a Nuxt web application that lets QA teams manage multiple Jira/Xray test cases at once and sync real changes back to Xray through a reviewable diff-and-sync workflow. It is a companion tool to Xray, not a competitor — it focuses on bulk editing, Markdown import/export, and safe synchronization rather than replacing Xray's test management or execution features.

## Problem

Teams using Jira + Xray Cloud for test management often fall back to spreadsheets, manually maintained Gherkin files, or one-at-a-time edits in the Xray UI when managing large numbers of test cases. There is no lightweight way to import multiple test cases from a Markdown file, bulk-edit them, preview exactly what will change, push only confirmed changes to Xray, and export them in the same portable format.

## Core Value Proposition

A spreadsheet-like bulk editor for Xray test cases, backed by Markdown import/export and a diff-before-sync workflow: pull test cases from Xray or import them from a Markdown file, edit many at once locally, review a field-level diff, then export the updated test cases or confirm and push them to Xray.

## Key Features

- **Dual authentication**: Jira OAuth 2.0 (3LO) as the primary method, with Jira email + API token as a fallback; Xray Cloud client ID/secret exchanged for a short-lived JWT.
- **Xray as source of truth**: fetches the full folder tree and test cases from Xray's Test Repository, cached locally for fast editing.
- **Bulk test case management**: grid-style interface for editing multiple test cases (fields, steps, labels, status) at the same time.
- **Markdown import/export**: imports multiple test cases from one `.md` file and exports selected or edited test cases to the same format. The format uses Gherkin syntax like the attached example, including tags, `Feature`, `Background`, `Scenario`, and `Given`/`When`/`Then` steps; Xray issue tags such as `@xray-ONEDS-14043` preserve test-case mapping.
- **Diff-before-sync**: every batch of local edits is compared against the last-synced snapshot and shown to the user as an explicit diff before anything is written to Xray.
- **Conflict awareness**: detects when a test case has changed in Xray since the last local pull, to avoid silently overwriting external edits.

## Target Users

QA engineers and SDETs managing test cases in Jira/Xray Cloud, particularly teams with large test suites who need to make coordinated bulk changes (e.g., updating labels, statuses, or steps across many cases at once).

## Technology

- **Frontend/Backend**: Nuxt 4.5.2 (latest stable version at the time of planning), using Vue 3 and Nitro
- **Database**: Postgres (via Prisma), storing workspaces, encrypted credentials, and cached test cases/folders
- **Integrations**: Jira REST/OAuth APIs, Xray Cloud APIs (GraphQL for Test Repository/folders)
- **File format**: Markdown files containing Gherkin-formatted features and multiple scenarios
- **Security**: encrypted-at-rest credential storage (AES-256-GCM), no raw secrets logged or returned after initial save

## Monetization

Planned as a standalone product (e.g., hosted SaaS or open-core model), explicitly positioned as a workflow layer on top of Xray rather than a replacement for it.
