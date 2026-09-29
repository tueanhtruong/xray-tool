import { describe, expect, it } from 'vitest'
import { assertSafeTestDatabaseUrl, UnsafeTestDatabaseError } from '../support/test-db'

const DEV = 'postgresql://xray:xray@localhost:5432/xray_dev'
const TEST = 'postgresql://xray:xray@localhost:5432/xray_test'

describe('assertSafeTestDatabaseUrl', () => {
  it('accepts a separate database whose name ends in _test', () => {
    expect(assertSafeTestDatabaseUrl(TEST, DEV)).toBe(TEST)
  })

  it('refuses when NUXT_DATABASE_URL_TEST is missing', () => {
    expect(() => assertSafeTestDatabaseUrl(undefined, DEV)).toThrow(
      /NUXT_DATABASE_URL_TEST is not set/,
    )
  })

  it('refuses a database name that does not end in _test', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://xray:xray@localhost:5432/xray_dev2', DEV),
    ).toThrow(/does not end in "_test"/)
  })

  it('refuses when the test URL points at the development database', () => {
    const devNamedTest = 'postgresql://xray:xray@localhost:5432/xray_test'
    expect(() => assertSafeTestDatabaseUrl(TEST, devNamedTest)).toThrow(UnsafeTestDatabaseError)
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://other:pw@LOCALHOST/xray_test', devNamedTest),
    ).toThrow(/points at the development database/)
  })

  it('refuses an unparseable URL', () => {
    expect(() => assertSafeTestDatabaseUrl('not a url', DEV)).toThrow(/not a valid database URL/)
  })

  it('explains how to fix it', () => {
    expect(() => assertSafeTestDatabaseUrl(undefined, DEV)).toThrow(/\.env\.example/)
  })
})
