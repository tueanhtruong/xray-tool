export interface DraftFields {
  summary: string
  gherkin: string | null
}

/** A null field means "no change from the base". */
export interface DraftOverrides {
  summary: string | null
  gherkin: string | null
}

export interface DraftValidationResult {
  valid: boolean
  errors: Partial<Record<keyof DraftFields, string>>
}

export function validateDraftFields(fields: DraftFields): DraftValidationResult {
  const errors: DraftValidationResult['errors'] = {}
  if (!fields.summary.trim()) errors.summary = 'Summary is required.'
  else if (fields.summary.length > 255) errors.summary = 'Summary must be 255 characters or fewer.'
  return { valid: Object.keys(errors).length === 0, errors }
}

export function composeDraftFields(base: DraftFields, overrides: DraftOverrides): DraftFields {
  return {
    summary: overrides.summary ?? base.summary,
    gherkin: overrides.gherkin ?? base.gherkin,
  }
}

export function diffDraftFields(base: DraftFields, value: DraftFields): DraftOverrides {
  return {
    summary: value.summary === base.summary ? null : value.summary,
    gherkin: value.gherkin === base.gherkin ? null : value.gherkin,
  }
}

export function hasDraftChanges(overrides: DraftOverrides): boolean {
  return overrides.summary !== null || overrides.gherkin !== null
}
