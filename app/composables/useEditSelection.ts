export interface EditSelectionItem {
  id: string
  key: string
  summary: string
  folderPath: string | null
  hasDraft: boolean
}

export interface EditSelection {
  projectId: string
  items: EditSelectionItem[]
}

const STORAGE_KEY = 'xray-tool:edit-selection'

/** Edit selection handed from the repository; mirrored to sessionStorage so it survives a reload in the same tab. */
export function useEditSelection() {
  const selection = useState<EditSelection | null>('edit-selection', () => null)

  function load(): EditSelection | null {
    if (!import.meta.client) return selection.value
    if (selection.value === null) {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        selection.value = raw ? (JSON.parse(raw) as EditSelection) : null
      } catch {
        selection.value = null
      }
    }
    return selection.value
  }

  function save(next: EditSelection) {
    selection.value = next
    if (import.meta.client) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function patchItem(id: string, patch: Partial<EditSelectionItem>) {
    if (!selection.value) return
    selection.value = {
      ...selection.value,
      items: selection.value.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }
    if (import.meta.client) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection.value))
  }

  return { selection, load, save, patchItem }
}
