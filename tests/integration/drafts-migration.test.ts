import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { fingerprintTestCase } from '../../shared/fingerprint'
import { loadEnv } from '../support/env'

loadEnv()

describe('US-09.1 draft-field migration', () => {
  let client: pg.Client
  let transactionOpen = false
  const suffix = `draft-migration-${Date.now()}`

  beforeAll(async () => {
    client = new pg.Client({
      connectionString: process.env.NUXT_DATABASE_URL_TEST,
      connectionTimeoutMillis: 5_000,
    })
    await client.connect()
    await client.query('BEGIN')
    transactionOpen = true
    await client.query(`
      ALTER TABLE "TestCaseDraft"
        ADD COLUMN "labels" jsonb,
        ADD COLUMN "status" text,
        ADD COLUMN "baseLabels" text[] NOT NULL DEFAULT ARRAY[]::text[],
        ADD COLUMN "baseStatus" text;
      ALTER TABLE "TestCaseSnapshot"
        ADD COLUMN "labels" text[] NOT NULL DEFAULT ARRAY[]::text[],
        ADD COLUMN "status" text NOT NULL DEFAULT '';
    `)
  })

  afterAll(async () => {
    if (transactionOpen) await client.query('ROLLBACK')
    await client?.end()
  })

  it('deletes removed-field-only drafts, keeps other edits, recomputes fingerprints, and drops old columns', async () => {
    const userId = `${suffix}-user`
    const projectId = `${suffix}-project`
    const testCases = [
      { id: `${suffix}-labels`, key: `${suffix.toUpperCase()}-1`, issueId: `${suffix}-issue-1` },
      { id: `${suffix}-status`, key: `${suffix.toUpperCase()}-2`, issueId: `${suffix}-issue-2` },
      { id: `${suffix}-mixed`, key: `${suffix.toUpperCase()}-3`, issueId: `${suffix}-issue-3` },
    ]

    await client.query(
      `INSERT INTO "User" (id,"accountId","createdAt","updatedAt") VALUES ($1,$2,now(),now())`,
      [userId, `${userId}@account`],
    )
    await client.query(
      `INSERT INTO "Project" (id,"tenantIdentityKind","tenantIdentity","jiraProjectId","jiraProjectKey","jiraProjectName","testIssueTypeId","testIssueTypeName","projectStatuses","updatedAt")
       VALUES ($1,'SITE_ORIGIN',$2,$3,$4,'Migration fixture','100','Test','[]',now())`,
      [projectId, `https://${suffix}.atlassian.net`, suffix, suffix.toUpperCase()],
    )
    for (const testCase of testCases) {
      await client.query(
        `INSERT INTO "TestCase" (id,"projectId","issueId",key,summary,origin,"updatedAt")
         VALUES ($1,$2,$3,$4,'Base summary','REMOTE',now())`,
        [testCase.id, projectId, testCase.issueId, testCase.key],
      )
      await client.query(
        `INSERT INTO "TestCaseSnapshot" (id,"testCaseId",summary,labels,status,gherkin,fingerprint)
         VALUES ($1,$2,'Base summary',ARRAY['legacy'],'Ready','Scenario: base','old-fingerprint')`,
        [`${testCase.id}-snapshot`, testCase.id],
      )
    }
    await client.query(
      `INSERT INTO "TestCaseDraft" (id,"userId","testCaseId",labels,"baseLabels","baseSummary","baseGherkin","baseFingerprint","updatedAt")
       VALUES ($1,$2,$3,'["legacy"]'::jsonb,ARRAY[]::text[],'Base summary','Scenario: base','old-fingerprint',now())`,
      [`${suffix}-labels-draft`, userId, testCases[0]!.id],
    )
    await client.query(
      `INSERT INTO "TestCaseDraft" (id,"userId","testCaseId",status,"baseStatus","baseSummary","baseGherkin","baseFingerprint","updatedAt")
       VALUES ($1,$2,$3,'Done','Ready','Base summary','Scenario: base','old-fingerprint',now())`,
      [`${suffix}-status-draft`, userId, testCases[1]!.id],
    )
    await client.query(
      `INSERT INTO "TestCaseDraft" (id,"userId","testCaseId",summary,labels,status,gherkin,"baseSummary","baseLabels","baseStatus","baseGherkin","baseFingerprint","updatedAt")
       VALUES ($1,$2,$3,'Changed summary','["legacy"]'::jsonb,'Done','Scenario: changed','Base summary',ARRAY['legacy'],'Ready','Scenario: base','old-fingerprint',now())`,
      [`${suffix}-mixed-draft`, userId, testCases[2]!.id],
    )

    const notices: string[] = []
    client.on('notice', (notice) => notices.push(notice.message))
    const migration = await readFile(
      resolve(process.cwd(), 'prisma/migrations/20261010100000_remove_labels_and_status/migration.sql'),
      'utf8',
    )
    await client.query(migration)

    const remainingDrafts = await client.query<{ id: string; summary: string | null; gherkin: string | null }>(
      `SELECT id,summary,gherkin FROM "TestCaseDraft" WHERE id LIKE $1 ORDER BY id`,
      [`${suffix}-%-draft`],
    )
    expect(remainingDrafts.rows).toEqual([
      {
        id: `${suffix}-mixed-draft`,
        summary: 'Changed summary',
        gherkin: 'Scenario: changed',
      },
    ])

    const expectedFingerprint = await fingerprintTestCase({
      summary: 'Base summary',
      gherkin: 'Scenario: base',
    })
    const fingerprints = await client.query<{ fingerprint: string }>(
      `SELECT fingerprint FROM "TestCaseSnapshot" WHERE "testCaseId" = ANY($1::text[])`,
      [testCases.map((testCase) => testCase.id)],
    )
    expect(fingerprints.rows).toHaveLength(3)
    expect(fingerprints.rows.every((row) => row.fingerprint === expectedFingerprint)).toBe(true)
    expect(notices).toContain(
      'US-09.1 migration: deleted 2 label/status-only drafts, changed 1 drafts',
    )

    const legacyColumns = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name,column_name FROM information_schema.columns
       WHERE table_schema=current_schema()
         AND table_name IN ('TestCaseDraft','TestCaseSnapshot')
         AND column_name IN ('labels','status','baseLabels','baseStatus')`,
    )
    expect(legacyColumns.rows).toEqual([])
  })
})