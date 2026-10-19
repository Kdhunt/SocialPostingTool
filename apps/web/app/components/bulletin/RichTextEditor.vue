<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';

/**
 * Rich text for one bulletin section: paragraphs, headings, bold/italic/
 * underline, lists, links and tables. It only produces elements on the
 * bulletin allowlist (packages/domain bulletin-content.ts); the API
 * sanitizes again on save.
 */
const props = defineProps<{
  modelValue: string;
  /** id of the visible label, for screen readers. */
  labelledBy: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      heading: { levels: [3, 4] },
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ['mailto', 'tel'],
        defaultProtocol: 'https',
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
  ],
  editorProps: {
    attributes: {
      class: 'rte__content',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-labelledby': props.labelledBy,
    },
  },
  onUpdate: ({ editor: instance }) => {
    emit('update:modelValue', instance.isEmpty ? '' : instance.getHTML());
  },
});

watch(
  () => props.modelValue,
  (value) => {
    const instance = editor.value;
    if (!instance) return;
    const current = instance.isEmpty ? '' : instance.getHTML();
    if (value !== current) instance.commands.setContent(value, { emitUpdate: false });
  },
);

onBeforeUnmount(() => editor.value?.destroy());

function setLink(): void {
  const instance = editor.value;
  if (!instance) return;
  const previous = (instance.getAttributes('link').href as string | undefined) ?? '';
  const answer = window.prompt(
    'Link address (leave empty to remove the link)',
    previous || 'https://',
  );
  if (answer === null) return;
  const url = answer.trim();
  if (url === '' || url === 'https://') {
    instance.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
    window.alert('Links must start with https://, http://, mailto: or tel:');
    return;
  }
  instance.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

const inTable = (): boolean => editor.value?.isActive('table') ?? false;
</script>

<template>
  <div class="rte">
    <div v-if="editor" class="rte__toolbar" role="toolbar" aria-label="Formatting">
      <button
        type="button"
        class="rte__tool"
        :aria-pressed="editor.isActive('bold')"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <strong>B</strong><span class="visually-hidden"> Bold</span>
      </button>
      <button
        type="button"
        class="rte__tool"
        :aria-pressed="editor.isActive('italic')"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <em>I</em><span class="visually-hidden"> Italic</span>
      </button>
      <button
        type="button"
        class="rte__tool"
        :aria-pressed="editor.isActive('underline')"
        @click="editor.chain().focus().toggleUnderline().run()"
      >
        <u>U</u><span class="visually-hidden"> Underline</span>
      </button>
      <span class="rte__divider" aria-hidden="true" />
      <button
        type="button"
        class="rte__tool"
        :aria-pressed="editor.isActive('heading', { level: 3 })"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        Heading
      </button>
      <button
        type="button"
        class="rte__tool"
        :aria-pressed="editor.isActive('bulletList')"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        Bullets
      </button>
      <button
        type="button"
        class="rte__tool"
        :aria-pressed="editor.isActive('orderedList')"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        Numbers
      </button>
      <button
        type="button"
        class="rte__tool"
        :aria-pressed="editor.isActive('link')"
        @click="setLink"
      >
        Link
      </button>
      <span class="rte__divider" aria-hidden="true" />
      <button
        v-if="!inTable()"
        type="button"
        class="rte__tool"
        @click="editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()"
      >
        Table
      </button>
      <template v-else>
        <button type="button" class="rte__tool" @click="editor.chain().focus().addRowAfter().run()">
          + Row
        </button>
        <button
          type="button"
          class="rte__tool"
          @click="editor.chain().focus().addColumnAfter().run()"
        >
          + Column
        </button>
        <button type="button" class="rte__tool" @click="editor.chain().focus().deleteRow().run()">
          − Row
        </button>
        <button
          type="button"
          class="rte__tool"
          @click="editor.chain().focus().deleteColumn().run()"
        >
          − Column
        </button>
        <button type="button" class="rte__tool" @click="editor.chain().focus().deleteTable().run()">
          Remove table
        </button>
      </template>
      <span class="rte__spacer" />
      <button
        type="button"
        class="rte__tool"
        :disabled="!editor.can().undo()"
        @click="editor.chain().focus().undo().run()"
      >
        Undo
      </button>
      <button
        type="button"
        class="rte__tool"
        :disabled="!editor.can().redo()"
        @click="editor.chain().focus().redo().run()"
      >
        Redo
      </button>
    </div>
    <EditorContent :editor="editor" />
  </div>
</template>

<style scoped>
.rte {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.rte:focus-within {
  border-color: var(--color-brand);
}

.rte__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-muted);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.rte__tool {
  min-width: 2rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.rte__tool:hover:not(:disabled) {
  background: var(--color-surface);
  border-color: var(--color-border);
}

.rte__tool[aria-pressed='true'] {
  background: var(--color-brand-soft);
  border-color: var(--color-brand);
  color: var(--color-brand);
}

.rte__tool:disabled {
  color: var(--color-text-subtle);
  cursor: default;
}

.rte__divider {
  width: 1px;
  height: 1.25rem;
  background: var(--color-border);
  margin: 0 0.25rem;
}

.rte__spacer {
  flex: 1;
}

.rte :deep(.rte__content) {
  min-height: 7rem;
  padding: 0.75rem;
  outline: none;
  line-height: 1.5;
}

.rte :deep(.rte__content p) {
  margin: 0 0 0.5rem;
}

.rte :deep(.rte__content table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
}

.rte :deep(.rte__content th),
.rte :deep(.rte__content td) {
  border: 1px solid var(--color-border-strong);
  padding: 0.25rem 0.5rem;
  vertical-align: top;
}

.rte :deep(.rte__content th) {
  background: var(--color-surface-muted);
}

.rte :deep(.rte__content .selectedCell) {
  background: var(--color-brand-soft);
}
</style>
