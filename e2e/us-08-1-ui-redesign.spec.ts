import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import pg from 'pg'
import {
  connectXrayAndSelectProject,
  control,
  expectLoginWithNext,
  signInWithOAuth,
  writeRequestCount,
} from './support'

// One workspace is shared across these tests, so they run in order and build on each other.
test.describe.configure({ mode: 'serial' })

async function queryRows<T extends pg.QueryResultRow>(query: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL_TEST })
  await client.connect()
  try {
    return (await client.query<T>(query, params)).rows
  } finally {
    await client.end()
  }
}

/** Waits for Vue to hydrate so client-side handlers (theme toggle, tabs) are attached. */
async function hydrated(page: Page) {
  await page.waitForLoadState('networkidle')
}

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)
const brandToken = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim())

async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  )
  expect(
    serious.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
    `${label}: ${JSON.stringify(serious.map((v) => v.id))}`,
  ).toEqual([])
}

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext()
  await control(request, {
    mode: 'single',
    projectMode: 'valid',
    xrayMode: 'valid',
    xrayFolderMode: 'flat',
    xrayTestMode: 'five',
    xrayTestFailureStart: -1,
    xrayDelayMs: 0,
    resetXrayCounts: true,
    resetWriteRequestCount: true,
  })
  await request.dispose()
  // Start without verified project associations so readiness-dependent scenarios are deterministic.
  await queryRows('DELETE FROM "WorkspaceProject"')
  await queryRows('DELETE FROM "Project"')
  await queryRows('DELETE FROM "TestCase"')
  await queryRows('DELETE FROM "Folder"')
})

test.describe('design tokens and theme', () => {
  test('uses the light tokens, then the dark tokens after toggling, and remembers the choice', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await hydrated(page)
    expect(await bodyBackground(page)).toBe('rgb(250, 250, 249)')
    expect(await brandToken(page)).toBe('#4f46e5')

    await page.getByTestId('theme-toggle').click()
    await expect.poll(() => bodyBackground(page)).toBe('rgb(12, 10, 9)')
    expect(await brandToken(page)).toBe('#818cf8')

    await page.reload()
    await hydrated(page)
    expect(await bodyBackground(page)).toBe('rgb(12, 10, 9)')
  })

  test('follows the system preference when no choice is stored', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await hydrated(page)
    expect(await bodyBackground(page)).toBe('rgb(12, 10, 9)')
  })
})

test.describe('landing and login', () => {
  test('signed-out landing shows the badge, six features and six workflow steps, and makes no workspace API call', async ({
    page,
  }) => {
    const apiCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/session')) apiCalls.push(request.url())
    })
    await page.goto('/')
    await hydrated(page)
    await expect(page.getByText('Jira + Xray Cloud')).toBeVisible()
    await expect(page.getByTestId('feature-card')).toHaveCount(6)
    await expect(page.getByTestId('workflow-steps').locator('li')).toHaveCount(6)
    await expect(page.getByRole('link', { name: 'View demo' })).toHaveCount(0)
    await page.getByTestId('landing-cta').click()
    await expect(page).toHaveURL('/login')
    expect(apiCalls).toEqual([])
  })

  test('login shows tabs, validates the site URL, and supports arrow-key navigation', async ({ page }) => {
    await page.goto('/login')
    await hydrated(page)
    const oauth = page.getByRole('tab', { name: 'Atlassian OAuth' })
    const token = page.getByRole('tab', { name: 'Email + API token' })
    await expect(oauth).toHaveAttribute('aria-selected', 'true')
    await oauth.focus()
    await page.keyboard.press('ArrowRight')
    await expect(token).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByLabel('Jira site URL')).toBeVisible()
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await expect(page.getByLabel('API token', { exact: true })).toBeVisible()
    await expect(page.getByTestId('api-token-submit')).toBeDisabled()
    await page.getByLabel('Jira site URL').fill('http://acme.example.com')
    await expect(page.getByText('Use https://<your-site>.atlassian.net')).toBeVisible()
    await page.keyboard.press('Shift+Tab')
    await token.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(oauth).toHaveAttribute('aria-selected', 'true')
  })

  test('protected pages redirect to login with next, and sign-in lands on the requested page', async ({
    page,
  }) => {
    await page.goto('/repository?folder=/Autocomplete')
    await expectLoginWithNext(page, '/repository?folder=/Autocomplete')
    await expect(page.getByTestId('jira-login')).toHaveAttribute(
      'href',
      `/auth/jira/login?next=${encodeURIComponent('/repository?folder=/Autocomplete')}`,
    )
  })

  test('a fresh workspace lands on /settings after sign-in and the landing offers Continue setup', async ({
    page,
  }) => {
    await signInWithOAuth(page)
    await expect(page).toHaveURL('/settings')
    await page.goto('/')
    await expect(page.getByTestId('landing-cta')).toHaveText('Continue setup')
    await page.getByTestId('landing-cta').click()
    await expect(page).toHaveURL('/settings')
  })

  test('settings keeps the onboarding behavior: connect Xray, select a project', async ({ page }) => {
    await signInWithOAuth(page)
    await connectXrayAndSelectProject(page)
    await expect(page).toHaveURL(/\/repository\?project=/)
    await expect(page.getByTestId('header-project')).toContainText('ONEDS')
  })

  test('signed-in landing offers Open repository; /login bounces to the repository', async ({ page }) => {
    await signInWithOAuth(page)
    await page.goto('/')
    await expect(page.getByTestId('landing-cta')).toHaveText('Open repository')
    await page.goto('/login')
    await expect(page).toHaveURL(/\/repository\?project=/)
  })

  test('sign-in lands on next, and an external next is ignored', async ({ page }) => {
    await signInWithOAuth(page, '/repository?folder=/Autocomplete')
    await expect(page).toHaveURL(/\/repository\?folder=\/Autocomplete&project=/)

    const other = await page.context().browser()!.newContext()
    const evil = await other.newPage()
    await evil.goto('/login?next=https://evil.example/x')
    await expect(evil.getByTestId('jira-login')).toHaveAttribute('href', '/auth/jira/login')
    await evil.getByTestId('jira-login').click()
    await expect(evil).toHaveURL(/\/repository\?project=/)
    await other.close()
  })

  test('the API token never lingers in the form, storage, or page text', async ({ page }) => {
    const token = 'mock-valid-api-token'
    await page.goto('/login')
    await hydrated(page)
    await page.getByRole('tab', { name: 'Email + API token' }).click()
    await page.getByLabel('Jira site URL').fill('https://one.atlassian.net')
    await page.getByLabel('Email', { exact: true }).fill('qa@example.com')
    await page.getByLabel('API token', { exact: true }).fill(token)
    await page.getByTestId('api-token-submit').click()
    await expect(page).toHaveURL(/\/(settings|repository)/)
    const storage = await page.evaluate(
      () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    )
    expect(storage).not.toContain(token)
    expect(await page.locator('body').innerText()).not.toContain(token)
    // Clean up so the API-token connection does not block OAuth sign-in elsewhere.
    await page.goto('/settings')
    await page.getByTestId('disconnect').click()
    await expect(page).toHaveURL('/login')
  })
})

test.describe('repository', () => {
  async function openRepository(page: Page) {
    await signInWithOAuth(page, '/repository')
    await expect(page).toHaveURL(/\/repository\?project=/)
  }

  test('pulls from Xray and shows the never-pulled state first', async ({ page }) => {
    await openRepository(page)
    await expect(page.getByTestId('never-pulled')).toContainText('Refresh all project tests')
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByTestId('pull-cta').click()
    await expect(page.getByTestId('pull-success')).toContainText('Pulled 5 tests, 4 folders')
    await expect(page.getByRole('table')).toContainText('ONEDS-14043')
  })

  test('has a 260px sidebar and a list with Select, Key, Summary and Folder only', async ({ page }) => {
    await openRepository(page)
    const sidebar = page.getByTestId('repository').locator('aside')
    expect((await sidebar.boundingBox())?.width).toBe(260)
    const header = page.getByRole('table').locator('thead')
    for (const name of ['Key', 'Summary', 'Folder']) await expect(header).toContainText(name)
    await expect(page.getByRole('checkbox', { name: 'Select all visible tests' })).toBeVisible()
    for (const name of ['Labels', 'Status', 'Review']) {
      await expect(page.getByTestId('repository')).not.toContainText(new RegExp(`\\b${name}\\b`))
    }
  })

  test('folder and search are deep-linkable and survive a reload', async ({ page }) => {
    await openRepository(page)
    await page.getByRole('treeitem', { name: /^Autocomplete/ }).click()
    await page.getByLabel('Search tests').fill('ONEDS-14043')
    await expect(page).toHaveURL(/folder=\/Autocomplete/)
    await expect(page).toHaveURL(/q=ONEDS-14043/)
    await page.reload()
    await expect(page.getByLabel('Search tests')).toHaveValue('ONEDS-14043')
    await expect(page.getByRole('table')).toContainText('ONEDS-14043')
    await expect(page.getByRole('table')).not.toContainText('ONEDS-14044')
  })

  test('the folder tree is keyboard operable: Down, Right, Enter', async ({ page }) => {
    await openRepository(page)
    await hydrated(page)
    const tree = page.getByRole('tree')
    await tree.getByRole('treeitem', { name: /^All tests/ }).focus()
    await page.keyboard.press('ArrowDown')
    const autocomplete = tree.getByRole('treeitem', { name: /^Autocomplete/ })
    await expect(autocomplete).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(autocomplete).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Enter')
    await expect(autocomplete).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/folder=\/Autocomplete/)
  })

  test('select-all selects every visible row', async ({ page }) => {
    await openRepository(page)
    await page.getByRole('checkbox', { name: 'Select all visible tests' }).check()
    await expect(page.getByTestId('selected-count')).toHaveText('5 selected')
    await expect(page.getByTestId('open-selected')).toBeDisabled()
    await page.getByTestId('clear-selection').click()
    await expect(page.getByTestId('selection-bar')).toHaveCount(0)
  })

  test('opens a test read-only with fresh details, persists nothing, and goes back with the query', async ({
    page,
  }) => {
    const snapshots = () =>
      queryRows(`SELECT count(*)::int AS n FROM "TestCaseSnapshot" s JOIN "TestCase" t ON t.id = s."testCaseId" WHERE t.key = 'ONEDS-14043'`)
    const before = await snapshots()
    await openRepository(page)
    await page.getByRole('treeitem', { name: /^Autocomplete/ }).click()
    await page.getByLabel('Search tests').fill('ONEDS-14043')
    await expect(page).toHaveURL(/q=ONEDS-14043/)
    await page.getByRole('link', { name: 'ONEDS-14043' }).click()
    await expect(page).toHaveURL(/\/tests\/ONEDS-14043/)
    await expect(page.getByTestId('test-gherkin')).toContainText('Scenario: ONEDS-14043')
    await expect(page.locator('main input, main textarea, main select')).toHaveCount(0)
    expect(await snapshots()).toEqual(before)
    await page.getByTestId('back-to-repository').click()
    await expect(page).toHaveURL(/folder=\/Autocomplete/)
    await expect(page).toHaveURL(/q=ONEDS-14043/)
  })

  test('an unknown key shows Test not found with a way back', async ({ page }) => {
    await signInWithOAuth(page, '/tests/NOPE-1')
    await expect(page.getByTestId('test-not-found')).toContainText('Test not found')
    await page.getByTestId('test-not-found').getByRole('link', { name: 'Back to repository' }).click()
    await expect(page).toHaveURL(/\/repository\?project=/)
  })

  test('shows loading, error with retry, and renders remote markup as text', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.dismiss()
    })
    await signInWithOAuth(page, '/')
    await page.route('**/api/tests?*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await page.getByTestId('landing-cta').click()
    await expect(page.getByRole('status', { name: 'Loading tests' })).toBeVisible()
    await expect(page.getByRole('table')).toContainText('ONEDS-14045')
    await expect(page.getByRole('table')).toContainText('<img src=x onerror=alert(1)>')
    await expect(page.locator('main img, [data-testid="repository"] img')).toHaveCount(0)

    await page.unroute('**/api/tests?*')
    await page.route('**/api/tests?*', (route) => route.fulfill({ status: 500, body: '{}' }))
    await page.getByLabel('Search tests').fill('ONEDS-1404')
    await expect(page.getByRole('alert')).toContainText('Tests could not be loaded')
    await page.unroute('**/api/tests?*')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('table')).toContainText('ONEDS-14043')

    await page.getByRole('link', { name: 'ONEDS-14045' }).click()
    await expect(page.getByTestId('test-details')).toContainText('<img src=x onerror=alert(1)>')
    await expect(page.locator('main img')).toHaveCount(0)
    expect(dialogs).toEqual([])
  })
})

test.describe('responsive and accessible', () => {
  const pages: Array<[string, string]> = [
    ['landing', '/'],
    ['login', '/login'],
    ['repository', '/repository'],
    ['test page', '/tests/ONEDS-14043'],
  ]

  test('stacks the layouts and has no page-level horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await signInWithOAuth(page, '/repository')
    await expect(page).toHaveURL(/\/repository\?project=/)
    for (const [name, path] of pages) {
      await page.goto(path)
      await hydrated(page)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${name} overflows horizontally`).toBeLessThanOrEqual(0)
    }
    await page.goto('/repository')
    const sidebar = await page.getByTestId('repository').locator('aside').boundingBox()
    expect(sidebar?.width).toBeGreaterThan(300)
    await page.goto('/tests/ONEDS-14043')
    const details = await page.getByTestId('test-details').boundingBox()
    const gherkin = await page.getByTestId('test-gherkin').boundingBox()
    expect(details!.x).toBe(gherkin!.x)
    expect(gherkin!.y).toBeGreaterThan(details!.y)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`has no serious or critical accessibility violations in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/')
      await hydrated(page)
      await expectNoSeriousViolations(page, `landing (${scheme})`)
      await page.goto('/login')
      await hydrated(page)
      await expectNoSeriousViolations(page, `login (${scheme})`)
      await page.getByRole('tab', { name: 'Email + API token' }).click()
      await expectNoSeriousViolations(page, `login token tab (${scheme})`)
      await signInWithOAuth(page, '/settings')
      await expect(page).toHaveURL('/settings')
      await hydrated(page)
      await expectNoSeriousViolations(page, `settings (${scheme})`)
      for (const [name, path] of pages.slice(2)) {
        await page.goto(path)
        await hydrated(page)
        await expectNoSeriousViolations(page, `${name} (${scheme})`)
      }
    })
  }
})

test('no write request reached the mock Jira or Xray during the whole spec', async ({ request }) => {
  expect(await writeRequestCount(request)).toBe(0)
})
