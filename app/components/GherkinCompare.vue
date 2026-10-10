<script setup lang="ts">
type MergeModule = typeof import('@codemirror/merge')

const props = defineProps<{ base: string; modelValue: string; readOnly: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement>()
let merge: MergeModule | undefined
let view: InstanceType<MergeModule['MergeView']> | undefined
let applyingExternal = false
let collapsed = false
const SHARED_CONFIG = { gutter: true, highlightChanges: true, revertControls: 'a-to-b' } as const

// Collapsing with no changes hides the whole document, so it is applied only while a change exists.
function syncCollapse() {
  if (!view || !merge) return
  const hasChanges = (merge.getChunks(view.b.state)?.chunks.length ?? 0) > 0
  if (hasChanges === collapsed) return
  collapsed = hasChanges
  view.reconfigure({
    ...SHARED_CONFIG,
    collapseUnchanged: hasChanges ? { margin: 3, minSize: 4 } : undefined,
  })
}

async function mount() {
  if (!host.value || view) return
  const [mergeModule, state, viewModule] = await Promise.all([
    import('@codemirror/merge'),
    import('@codemirror/state'),
    import('@codemirror/view'),
  ])
  merge = mergeModule
  view = new mergeModule.MergeView({
    a: {
      doc: props.base,
      extensions: [
        state.EditorState.readOnly.of(true),
        viewModule.EditorView.editable.of(false),
        viewModule.lineNumbers(),
      ],
    },
    b: {
      doc: props.modelValue,
      extensions: [
        state.EditorState.readOnly.of(props.readOnly),
        viewModule.lineNumbers(),
        viewModule.EditorView.updateListener.of((update) => {
          if (update.docChanged && !applyingExternal) {
            emit('update:modelValue', update.state.doc.toString())
            setTimeout(syncCollapse, 0)
          }
        }),
      ],
    },
    parent: host.value,
    gutter: true,
    highlightChanges: true,
    revertControls: 'a-to-b',
  })
  syncCollapse()
}

function destroy() {
  view?.destroy()
  view = undefined
  collapsed = false
}

async function remount() {
  destroy()
  await mount()
}

watch(
  () => props.modelValue,
  (value) => {
    if (!view || view.b.state.doc.toString() === value) return
    applyingExternal = true
    view.b.dispatch({ changes: { from: 0, to: view.b.state.doc.length, insert: value } })
    applyingExternal = false
    setTimeout(syncCollapse, 0)
  },
)
watch(
  () => [props.base, props.readOnly] as const,
  () => {
    void remount()
  },
)

function nextChange() {
  if (view && merge) merge.goToNextChunk(view.b)
}

function previousChange() {
  if (view && merge) merge.goToPreviousChunk(view.b)
}

defineExpose({ nextChange, previousChange })

onMounted(() => {
  void mount()
})
onBeforeUnmount(destroy)
</script>

<template>
  <div
    ref="host"
    class="gherkin-compare min-h-[280px] overflow-hidden rounded-md border border-default"
    data-testid="gherkin-compare"
  />
</template>

<style scoped>
.gherkin-compare :deep(.cm-editor) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
}

.dark .gherkin-compare :deep(.cm-cursor),
.dark .gherkin-compare :deep(.cm-dropCursor) {
  border-left-color: #ffffff;
}
</style>
