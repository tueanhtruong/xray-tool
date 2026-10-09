export interface DraftFields {
  summary: string
  labels: string[]
  status: string
}

export interface DraftOverrides {
  summary: string | null
  labels: string[] | null
  status: string | null
}

export interface DraftValidationResult {
  valid: boolean
  errors: Partial<Record<keyof DraftFields, string>>
}

export function normalizeLabels(labels: readonly string[]): string[] {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function validateDraftFields(
  fields: DraftFields,
  allowedStatuses: readonly string[],
): DraftValidationResult {
  const errors: DraftValidationResult['errors'] = {}
  if (!fields.summary.trim()) errors.summary = 'Summary is required.'
  else if (fields.summary.length > 255) errors.summary = 'Summary must be 255 characters or fewer.'
  if (fields.labels.some((label) => /\s/.test(label))) errors.labels = 'Jira labels cannot contain spaces'
  if (!fields.status || !allowedStatuses.includes(fields.status)) errors.status = 'Choose a status available for the Test issue type.'
  return { valid: Object.keys(errors).length === 0, errors }
}

export function composeDraftFields(base: DraftFields, overrides: DraftOverrides): DraftFields {
  return {
    summary: overrides.summary ?? base.summary,
    labels: overrides.labels === null ? [...base.labels] : normalizeLabels(overrides.labels),
    status: overrides.status ?? base.status,
  }
}

export function diffDraftFields(base: DraftFields, value: DraftFields): DraftOverrides {
  const normalizedBase = { ...base, labels: normalizeLabels(base.labels) }
  const normalizedValue = { ...value, labels: normalizeLabels(value.labels) }
  return {
    summary: normalizedValue.summary === normalizedBase.summary ? null : normalizedValue.summary,
    labels: JSON.stringify(normalizedValue.labels) === JSON.stringify(normalizedBase.labels)
      ? null
      : normalizedValue.labels,
    status: normalizedValue.status === normalizedBase.status ? null : normalizedValue.status,
  }
}

export function hasDraftChanges(overrides: DraftOverrides): boolean {
  return overrides.summary !== null || overrides.labels !== null || overrides.status !== null
}
