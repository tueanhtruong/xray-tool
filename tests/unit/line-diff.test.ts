// @vitest-environment happy-dom
import { Chunk, MergeView } from '@codemirror/merge'
import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'

describe('Gherkin merge view', () => {
  it('keeps independent edits as separate aligned chunks', () => {
    const base = Text.of(['Feature: example', '  Scenario: first', '    Given original', '  Scenario: second', '    Then finish'])
    const draft = Text.of([
      'Feature: example',
      '  Scenario: first',
      '    Given changed',
      '    And added',
      '  Scenario: second',
      '    Then finished',
    ])

    const chunks = Chunk.build(base, draft)

    expect(chunks).toHaveLength(2)
    expect(
      chunks.map((chunk) => [base.lineAt(chunk.fromA).number, draft.lineAt(chunk.fromB).number]),
    ).toEqual([
      [3, 3],
      [5, 6],
    ])
  })

  it('reverts a changed hunk from the baseline into the editable draft', async () => {
    const parent = document.createElement('div')
    const base = 'Feature: example\n  Scenario: original\n    Given a condition'
    const draft = 'Feature: example\n  Scenario: revised\n    Given a condition'
    const view = new MergeView({
      a: { doc: base },
      b: { doc: draft },
      parent,
      revertControls: 'a-to-b',
      renderRevertControl: () => document.createElement('button'),
    })

    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const revert = parent.querySelector<HTMLButtonElement>('.cm-merge-revert button')
      expect(revert).not.toBeNull()
      revert!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      expect(view.a.state.doc.toString()).toBe(base)
      expect(view.b.state.doc.toString()).toBe(base)
    } finally {
      view.destroy()
    }
  })
})