import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { loadEnv } from '../support/env'

loadEnv()

describe('forward schema-drift repair', () => {
  let client: pg.Client
  let transactionOpen = false

  beforeAll(async () => {
    client = new pg.Client({
      connectionString: process.env.NUXT_DATABASE_URL_TEST,
      connectionTimeoutMillis: 5_000,
    })
    await client.connect()
    await client.query('BEGIN')
    transactionOpen = true
  })

  afterAll(async () => {
    if (transactionOpen) await client.query('ROLLBACK')
    await client?.end()
  })

  it('restores missing workspace/folder schema while preserving shared project data', async () => {
    const suffix = `drift-${Date.now()}`
    const userA = `${suffix}-user-a`
    const userB = `${suffix}-user-b`
    const workspaceA = `${suffix}-workspace-a`
    const workspaceB = `${suffix}-workspace-b`
    const projectA = `${suffix}-project-a`
    const projectB = `${suffix}-project-b`
    const testCase = `${suffix}-test`
    const noBaselineTest = `${suffix}-test-no-baseline`

    await client.query(
      `INSERT INTO "User" (id,"accountId","createdAt","updatedAt") VALUES
       ($1,$3,now(),now()),($2,$4,now(),now())`,
      [userA, userB, `${userA}@account`, `${userB}@account`],
    )
    await client.query(
      `INSERT INTO "Workspace" (id,"ownerId","cloudId","siteOrigin","siteUrl",name,"createdAt","updatedAt") VALUES
       ($1,$3,'drift-cloud-a','https://drift-a.atlassian.net','https://drift-a.atlassian.net','Drift A',now(),now()),
       ($2,$4,'drift-cloud-b','https://drift-b.atlassian.net','https://drift-b.atlassian.net','Drift B',now(),now())`,
      [workspaceA, workspaceB, userA, userB],
    )
    await client.query(
      `INSERT INTO "Project" (id,"tenantIdentityKind","tenantIdentity","jiraProjectId","jiraProjectKey","jiraProjectName","testIssueTypeId","testIssueTypeName","projectStatuses","updatedAt") VALUES
       ($1,'CLOUD_ID','drift-cloud-a','77','DRIFTA','Drift A Project','100','Test','[{"id":"1","name":"Ready"}]',now()),
       ($2,'CLOUD_ID','drift-cloud-b','77','DRIFTB','Drift B Project','200','Test','[]',now())`,
      [projectA, projectB],
    )
    await client.query(
      `INSERT INTO "WorkspaceProject" (id,"workspaceId","projectId") VALUES
       ($1,$3,$5),($2,$4,$6)`,
      [`${suffix}-access-a`, `${suffix}-access-b`, workspaceA, workspaceB, projectA, projectB],
    )
    await client.query(
      `INSERT INTO "JiraConnection" (id,"workspaceId","authMethod","accessToken","refreshToken","createdAt","updatedAt")
       VALUES ($1,$2,'OAUTH','encrypted-access-fixture','encrypted-refresh-fixture',now(),now())`,
      [`${suffix}-jira`, workspaceA],
    )
    await client.query(
      `INSERT INTO "Folder" (id,"projectId",path,name) VALUES ($1,$2,'/preserved','Preserved')`,
      [`${suffix}-folder`, projectA],
    )
    await client.query(
      `INSERT INTO "TestCase" (id,"projectId","issueId",key,summary,origin,"updatedAt")
       VALUES ($1,$2,$3,'DRIFTA-1','Preserved summary','REMOTE',now())`,
      [testCase, projectA, `${suffix}-issue`],
    )
    await client.query(
      `INSERT INTO "TestCaseSnapshot" (id,"testCaseId",summary,fingerprint)
       VALUES ($1,$2,'Immutable base','base-fingerprint')`,
      [`${suffix}-snapshot`, testCase],
    )
    await client.query(
      `INSERT INTO "TestCaseDraft" (id,"userId","testCaseId",summary,"baseSummary","baseFingerprint","updatedAt")
       VALUES ($1,$2,$3,'Draft edit','Immutable base','base-fingerprint',now())`,
      [`${suffix}-draft`, userA, testCase],
    )
    await client.query(
      `INSERT INTO "TestCase" (id,"projectId","issueId",key,origin,"updatedAt") VALUES ($1,$2,$3,'DRIFTA-2','REMOTE',now())`,
      [noBaselineTest, projectA, `${suffix}-issue-no-baseline`],
    )
    await client.query(
      `INSERT INTO "TestCaseDraft" (id,"userId","testCaseId",summary,"baseAvailable","updatedAt")
       VALUES ($1,$2,$3,'Draft without baseline',false,now())`,
      [`${suffix}-draft-no-baseline`, userA, noBaselineTest],
    )

    await client.query(`
      ALTER TABLE "Workspace"
        DROP COLUMN "jiraProjectKey", DROP COLUMN "jiraProjectId", DROP COLUMN "jiraProjectName",
        DROP COLUMN "projectReadyAt", DROP COLUMN "testIssueTypeId", DROP COLUMN "testIssueTypeName",
        DROP COLUMN "projectStatuses", DROP COLUMN "foldersPulledAt";
      ALTER TABLE "Folder"
        DROP COLUMN "workspaceId", DROP COLUMN "jiraProjectId",
        ALTER COLUMN "projectId" SET NOT NULL;
    `)

    const repairPath = resolve(
      process.cwd(),
      'prisma/migrations/20261002100000_repair_workspace_schema_drift/migration.sql',
    )
    const nullabilityPath = resolve(
      process.cwd(),
      'prisma/migrations/20261002110000_repair_folder_project_nullability/migration.sql',
    )
    const repair = (await readFile(repairPath, 'utf8')).replace(/^BEGIN;\s*|COMMIT;\s*$/gm, '')
    const nullability = (await readFile(nullabilityPath, 'utf8')).replace(
      /^BEGIN;\s*|COMMIT;\s*$/gm,
      '',
    )
    await client.query(repair)
    await client.query(nullability)

    const workspaceRows = await client.query(
      `SELECT w."jiraProjectId",w."jiraProjectKey",w."jiraProjectName",w."testIssueTypeId",w."projectStatuses"
       FROM "Workspace" w WHERE w.id IN ($1,$2) ORDER BY w.id`,
      [workspaceA, workspaceB],
    )
    expect(workspaceRows.rows).toEqual([
      {
        jiraProjectId: '77',
        jiraProjectKey: 'DRIFTA',
        jiraProjectName: 'Drift A Project',
        testIssueTypeId: '100',
        projectStatuses: [{ id: '1', name: 'Ready' }],
      },
      {
        jiraProjectId: '77',
        jiraProjectKey: 'DRIFTB',
        jiraProjectName: 'Drift B Project',
        testIssueTypeId: '200',
        projectStatuses: [],
      },
    ])

    const folder = await client.query(
      `SELECT "projectId","jiraProjectId","workspaceId" FROM "Folder" WHERE id=$1`,
      [`${suffix}-folder`],
    )
    expect(folder.rows).toEqual([
      { projectId: projectA, jiraProjectId: '77', workspaceId: workspaceA },
    ])

    const preserved = await client.query(
      `SELECT tc.summary,s.summary AS base,d.summary AS draft,d."baseSummary",d."baseFingerprint",
              jc."accessToken",jc."refreshToken"
       FROM "TestCase" tc JOIN "TestCaseSnapshot" s ON s."testCaseId"=tc.id
       JOIN "TestCaseDraft" d ON d."testCaseId"=tc.id
       JOIN "JiraConnection" jc ON jc."workspaceId"=$2 WHERE tc.id=$1`,
      [testCase, workspaceA],
    )
    expect(preserved.rows).toEqual([
      {
        summary: 'Preserved summary',
        base: 'Immutable base',
        draft: 'Draft edit',
        baseSummary: 'Immutable base',
        baseFingerprint: 'base-fingerprint',
        accessToken: 'encrypted-access-fixture',
        refreshToken: 'encrypted-refresh-fixture',
      },
    ])
    const unavailableBaseline = await client.query(
      `SELECT d."baseAvailable",s.id AS "snapshotId" FROM "TestCaseDraft" d
       LEFT JOIN "TestCaseSnapshot" s ON s."testCaseId"=d."testCaseId" WHERE d."testCaseId"=$1`,
      [noBaselineTest],
    )
    expect(unavailableBaseline.rows).toEqual([{ baseAvailable: false, snapshotId: null }])

    const issueCollision = await client.query(
      `SELECT count(DISTINCT "tenantIdentity")::int AS tenants FROM "Project" WHERE "jiraProjectId"='77' AND id IN ($1,$2)`,
      [projectA, projectB],
    )
    expect(issueCollision.rows[0]?.tenants).toBe(2)

    const projectNullability = await client.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Folder' AND column_name='projectId'`,
    )
    expect(projectNullability.rows[0]?.is_nullable).toBe('YES')
  })
})
