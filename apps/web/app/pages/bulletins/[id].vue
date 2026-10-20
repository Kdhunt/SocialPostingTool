<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { navigateTo, onBeforeRouteLeave, useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import {
  saveBulletinRequestSchema,
  type BulletinDetailDto,
  type SaveBulletinRequest,
  type UnitOrganizationDto,
} from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';
import { BULLETIN_LANGUAGES, bulletinLanguageName } from '~/utils/bulletin-languages';
import type { BulletinDocumentModel } from '~/utils/bulletin-document';

definePageMeta({ layout: 'authenticated' });

interface SectionDraft {
  key: string;
  organizationId: string | null;
  column: 'Main' | 'Side';
  heading: string;
  subheading: string;
  bodyHtml: string;
  imageUrl: string;
  imageAltText: string;
  linkUrl: string;
  linkLabel: string;
}

interface BulletinDraft {
  title: string;
  kicker: string;
  issueDate: string;
  template: 'Newsletter' | 'SingleColumn';
  language: string;
  sections: SectionDraft[];
}

const route = useRoute();
const client = useApiClient();
const { state: authState, refreshSession } = useAuth();
const bulletinId = computed(() => String(route.params.id ?? ''));

const loading = ref(true);
const loadError = ref<string | null>(null);
const saved = ref<BulletinDetailDto | null>(null);
const draft = ref<BulletinDraft | null>(null);
const savedSnapshot = ref('');
const organizations = ref<UnitOrganizationDto[]>([]);
const busy = ref<'save' | 'publish' | 'unpublish' | 'edition' | 'delete' | null>(null);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);
const editionLanguage = ref('es');

/** The preview shows a real letter-width page, scaled down to fit the pane. */
const PAGE_WIDTH_PX = 816;
const previewPane = ref<HTMLElement | null>(null);
const previewScale = ref(1);
let resizeObserver: ResizeObserver | null = null;

watch(previewPane, (pane) => {
  resizeObserver?.disconnect();
  if (!pane) return;
  resizeObserver = new ResizeObserver(([entry]) => {
    const available = (entry?.contentRect.width ?? PAGE_WIDTH_PX) - 32;
    previewScale.value = Math.min(1, Math.max(0.35, available / PAGE_WIDTH_PX));
  });
  resizeObserver.observe(pane);
});

onBeforeUnmount(() => resizeObserver?.disconnect());

let keySeed = 0;
const nextKey = (): string => `section-${(keySeed += 1)}`;

function permissions(): string[] {
  return authState.value.kind === 'authenticated' ? authState.value.user.permissions : [];
}
const canEdit = computed(() => permissions().includes('campaigns.create'));
const canPublish = computed(() => permissions().includes('campaigns.send'));
const isPublished = computed(() => saved.value?.status === 'Published');
const readOnly = computed(() => !canEdit.value || (isPublished.value && !canPublish.value));
/** Also locked while a request is running, so nothing typed meanwhile is overwritten by the response. */
const editingLocked = computed(() => readOnly.value || busy.value !== null);

function toDraft(bulletin: BulletinDetailDto): BulletinDraft {
  return {
    title: bulletin.title,
    kicker: bulletin.kicker ?? '',
    issueDate: bulletin.issueDate,
    template: bulletin.template,
    language: bulletin.language,
    sections: bulletin.sections.map((section) => ({
      key: nextKey(),
      organizationId: section.organizationId,
      column: section.column,
      heading: section.heading,
      subheading: section.subheading ?? '',
      bodyHtml: section.bodyHtml,
      imageUrl: section.imageUrl ?? '',
      imageAltText: section.imageAltText ?? '',
      linkUrl: section.linkUrl ?? '',
      linkLabel: section.linkLabel ?? '',
    })),
  };
}

function toRequest(value: BulletinDraft): SaveBulletinRequest {
  return {
    title: value.title,
    kicker: value.kicker,
    issueDate: value.issueDate,
    template: value.template,
    language: value.language,
    sections: value.sections.map((section) => ({
      organizationId: section.organizationId,
      // Kept even in the single-column layout, so switching back restores it.
      column: section.column,
      heading: section.heading,
      subheading: section.subheading,
      bodyHtml: section.bodyHtml,
      imageUrl: section.imageUrl,
      imageAltText: section.imageAltText,
      linkUrl: section.linkUrl,
      linkLabel: section.linkLabel,
    })),
  };
}

const dirty = computed(
  () => draft.value !== null && JSON.stringify(toRequest(draft.value)) !== savedSnapshot.value,
);

function adopt(bulletin: BulletinDetailDto): void {
  saved.value = bulletin;
  draft.value = toDraft(bulletin);
  savedSnapshot.value = JSON.stringify(toRequest(draft.value));
}

const organizationName = (id: string | null): string | null =>
  organizations.value.find((org) => org.id === id)?.name ??
  saved.value?.sections.find((section) => section.organizationId === id)?.organizationName ??
  null;

/** Organizations offered for a section: active ones, plus an archived one the section already uses. */
function organizationOptions(section: SectionDraft): UnitOrganizationDto[] {
  const options = [...organizations.value];
  if (section.organizationId && !options.some((org) => org.id === section.organizationId)) {
    options.push({
      id: section.organizationId,
      name: organizationName(section.organizationId) ?? 'Archived',
      sortOrder: 999,
    });
  }
  return options;
}

const previewModel = computed<BulletinDocumentModel | null>(() => {
  if (!draft.value) return null;
  const value = draft.value;
  return {
    title: value.title || 'Untitled bulletin',
    kicker: value.kicker || null,
    issueDate: value.issueDate,
    language: value.language,
    template: value.template,
    sections: value.sections.map((section, index) => ({
      key: section.key,
      organizationName: organizationName(section.organizationId),
      column: value.template === 'Newsletter' ? section.column : 'Main',
      sortOrder: index,
      heading: section.heading,
      subheading: section.subheading || null,
      bodyHtml: section.bodyHtml,
      imageUrl: /^https?:\/\//i.test(section.imageUrl) ? section.imageUrl : null,
      imageAltText: section.imageAltText || null,
      linkUrl: /^https?:\/\//i.test(section.linkUrl) ? section.linkUrl : null,
      linkLabel: section.linkLabel || null,
    })),
  };
});

const publicUrl = computed(() => {
  if (!saved.value || typeof window === 'undefined') return null;
  return `${window.location.origin}/${saved.value.unitSlug}/${saved.value.id}`;
});

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) return error.message;
  // Validation errors from the shared schemas (thrown before any request is sent).
  const issues = (
    error as { issues?: Array<{ path: Array<string | number>; message: string }> } | null
  )?.issues;
  if (Array.isArray(issues)) {
    return describeIssues(issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  return fallback;
}

/** Turns "sections.2.imageAltText: message" into "Section 3: message". */
function describeIssues(issues: string[]): string {
  return issues
    .map((issue) => {
      const match = /^sections\.(\d+)\.[^:]*:\s*(.*)$/.exec(issue);
      return match
        ? `Section ${Number(match[1]) + 1}: ${match[2]}`
        : issue.replace(/^[^:]*:\s*/, '');
    })
    .join(' ');
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const [bulletin, orgList] = await Promise.all([
      client.getBulletin(bulletinId.value),
      client.listUnitOrganizations(),
    ]);
    organizations.value = orgList.organizations;
    adopt(bulletin);
  } catch (error) {
    loadError.value =
      error instanceof ApiRequestError && error.status === 404
        ? 'This bulletin no longer exists.'
        : errorMessage(error, 'Unable to load this bulletin.');
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<boolean> {
  if (!draft.value) return false;
  actionError.value = null;
  notice.value = null;
  const request = toRequest(draft.value);
  const check = saveBulletinRequestSchema.safeParse(request);
  if (!check.success) {
    actionError.value = describeIssues(
      check.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
    return false;
  }
  busy.value = 'save';
  try {
    adopt(
      await client.saveBulletin(bulletinId.value, {
        ...request,
        expectedUpdatedAt: saved.value?.updatedAt,
      }),
    );
    notice.value = 'Saved.';
    return true;
  } catch (error) {
    actionError.value = errorMessage(error, 'Unable to save.');
    return false;
  } finally {
    busy.value = null;
  }
}

async function publish(): Promise<void> {
  if (dirty.value && !(await save())) return;
  busy.value = 'publish';
  actionError.value = null;
  try {
    adopt(await client.publishBulletin(bulletinId.value));
    notice.value = 'Published. Anyone with the link can read it.';
  } catch (error) {
    actionError.value = errorMessage(error, 'Unable to publish.');
  } finally {
    busy.value = null;
  }
}

async function unpublish(): Promise<void> {
  busy.value = 'unpublish';
  actionError.value = null;
  try {
    adopt(await client.unpublishBulletin(bulletinId.value));
    notice.value = 'Unpublished. The public page no longer shows it.';
  } catch (error) {
    actionError.value = errorMessage(error, 'Unable to unpublish.');
  } finally {
    busy.value = null;
  }
}

async function addEdition(): Promise<void> {
  if (dirty.value && !(await save())) return;
  busy.value = 'edition';
  actionError.value = null;
  try {
    const edition = await client.copyBulletinAsLanguage(bulletinId.value, editionLanguage.value);
    await navigateTo({ path: `/bulletins/${edition.id}`, query: { started: edition.language } });
  } catch (error) {
    actionError.value = errorMessage(error, 'Unable to start that edition.');
  } finally {
    busy.value = null;
  }
}

async function removeBulletin(): Promise<void> {
  if (
    !window.confirm(
      'Delete this bulletin? Its public page stops working. This cannot be undone from here.',
    )
  )
    return;
  busy.value = 'delete';
  try {
    await client.deleteBulletin(bulletinId.value);
    savedSnapshot.value = draft.value ? JSON.stringify(toRequest(draft.value)) : '';
    await navigateTo('/bulletins');
  } catch (error) {
    actionError.value = errorMessage(error, 'Unable to delete.');
  } finally {
    busy.value = null;
  }
}

function addSection(column: 'Main' | 'Side' = 'Main'): void {
  if (!draft.value) return;
  draft.value.sections.push({
    key: nextKey(),
    organizationId: organizations.value[0]?.id ?? null,
    column,
    heading: '',
    subheading: '',
    bodyHtml: '',
    imageUrl: '',
    imageAltText: '',
    linkUrl: '',
    linkLabel: '',
  });
}

function moveSection(index: number, delta: -1 | 1): void {
  const sections = draft.value?.sections;
  if (!sections) return;
  const target = index + delta;
  if (target < 0 || target >= sections.length) return;
  const [moved] = sections.splice(index, 1);
  if (moved) sections.splice(target, 0, moved);
}

function removeSection(index: number): void {
  draft.value?.sections.splice(index, 1);
}

async function copyLink(): Promise<void> {
  if (!publicUrl.value) return;
  try {
    await navigator.clipboard.writeText(publicUrl.value);
    notice.value = 'Link copied.';
  } catch {
    notice.value = publicUrl.value;
  }
}

function printPdf(): void {
  window.print();
}

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('You have unsaved changes. Leave without saving?'))
    return false;
  return true;
});

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  await load();
  const started = route.query.started;
  if (typeof started === 'string' && saved.value) {
    notice.value = `Started the ${bulletinLanguageName(started)} edition as a copy. Translate each section, then publish it.`;
  }
});
</script>

<template>
  <LayoutPageContainer>
    <UiLoadingState v-if="loading" message="Loading bulletin…" />
    <UiAlertBanner v-else-if="loadError">{{ loadError }}</UiAlertBanner>

    <template v-else-if="draft && saved">
      <LayoutPageHeader :title="draft.title || 'Untitled bulletin'">
        <template #actions>
          <span class="editor__status" :class="{ 'editor__status--live': isPublished }">
            {{ isPublished ? 'Published' : 'Draft' }}{{ dirty ? ', unsaved changes' : '' }}
          </span>
          <UiAppButton
            v-if="!readOnly"
            type="button"
            variant="secondary"
            :disabled="!dirty || busy !== null"
            @click="save"
          >
            {{ busy === 'save' ? 'Saving…' : 'Save' }}
          </UiAppButton>
          <UiAppButton
            v-if="canPublish && !isPublished"
            type="button"
            :disabled="busy !== null"
            @click="publish"
          >
            {{ busy === 'publish' ? 'Publishing…' : 'Publish' }}
          </UiAppButton>
          <UiAppButton
            v-if="canPublish && isPublished"
            type="button"
            variant="secondary"
            :disabled="busy !== null"
            @click="unpublish"
          >
            {{ busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish' }}
          </UiAppButton>
        </template>
      </LayoutPageHeader>

      <UiAlertBanner v-if="actionError">{{ actionError }}</UiAlertBanner>
      <UiAlertBanner v-if="notice" tone="success">{{ notice }}</UiAlertBanner>
      <UiAlertBanner v-if="isPublished && !canPublish" tone="info">
        This bulletin is live. Only someone who can publish can change it.
      </UiAlertBanner>

      <section v-if="isPublished && publicUrl" class="editor__share" aria-label="Share">
        <p>
          Public page:
          <a :href="publicUrl" target="_blank" rel="noopener noreferrer">{{ publicUrl }}</a>
        </p>
        <UiAppButton type="button" variant="ghost" @click="copyLink">Copy link</UiAppButton>
      </section>

      <div class="editor">
        <form class="editor__form" novalidate @submit.prevent="save">
          <fieldset class="editor__panel" :disabled="editingLocked">
            <legend class="editor__legend">Header</legend>
            <UiFormField label="Title" input-id="bulletin-title">
              <input
                id="bulletin-title"
                v-model="draft.title"
                class="form-control"
                type="text"
                maxlength="200"
              />
            </UiFormField>
            <UiFormField
              label="Line above the title (optional)"
              input-id="bulletin-kicker"
              hint="For example your church or unit name."
            >
              <input
                id="bulletin-kicker"
                v-model="draft.kicker"
                class="form-control"
                type="text"
                maxlength="200"
              />
            </UiFormField>
            <div class="editor__grid">
              <UiFormField label="Date" input-id="bulletin-date">
                <input
                  id="bulletin-date"
                  v-model="draft.issueDate"
                  class="form-control"
                  type="date"
                />
              </UiFormField>
              <UiFormField label="Layout" input-id="bulletin-template">
                <select id="bulletin-template" v-model="draft.template" class="form-control">
                  <option value="Newsletter">Newsletter, two columns</option>
                  <option value="SingleColumn">Single column</option>
                </select>
              </UiFormField>
              <UiFormField label="Language" input-id="bulletin-language">
                <select id="bulletin-language" v-model="draft.language" class="form-control">
                  <option
                    v-for="language in BULLETIN_LANGUAGES"
                    :key="language.code"
                    :value="language.code"
                  >
                    {{ language.name }}
                  </option>
                </select>
              </UiFormField>
            </div>
          </fieldset>

          <fieldset
            v-for="(section, index) in draft.sections"
            :key="section.key"
            class="editor__panel editor__section"
            :disabled="editingLocked"
          >
            <legend class="editor__legend">
              Section {{ index + 1 }}<span v-if="section.heading">: {{ section.heading }}</span>
            </legend>
            <div class="editor__section-tools">
              <UiAppButton
                type="button"
                variant="ghost"
                :disabled="index === 0"
                @click="moveSection(index, -1)"
              >
                Move up
              </UiAppButton>
              <UiAppButton
                type="button"
                variant="ghost"
                :disabled="index === draft.sections.length - 1"
                @click="moveSection(index, 1)"
              >
                Move down
              </UiAppButton>
              <UiAppButton type="button" variant="ghost" @click="removeSection(index)"
                >Remove</UiAppButton
              >
            </div>

            <div class="editor__grid">
              <UiFormField label="Organization" :input-id="`section-org-${section.key}`">
                <select
                  :id="`section-org-${section.key}`"
                  v-model="section.organizationId"
                  class="form-control"
                >
                  <option :value="null">None</option>
                  <option v-for="org in organizationOptions(section)" :key="org.id" :value="org.id">
                    {{ org.name }}
                  </option>
                </select>
              </UiFormField>
              <UiFormField
                v-if="draft.template === 'Newsletter'"
                label="Column"
                :input-id="`section-col-${section.key}`"
              >
                <select
                  :id="`section-col-${section.key}`"
                  v-model="section.column"
                  class="form-control"
                >
                  <option value="Main">Main column</option>
                  <option value="Side">Side column</option>
                </select>
              </UiFormField>
            </div>

            <UiFormField label="Heading" :input-id="`section-heading-${section.key}`">
              <input
                :id="`section-heading-${section.key}`"
                v-model="section.heading"
                class="form-control"
                type="text"
                maxlength="200"
              />
            </UiFormField>
            <UiFormField
              label="Subheading (optional)"
              :input-id="`section-sub-${section.key}`"
              hint="Dates, times or a short line under the heading."
            >
              <input
                :id="`section-sub-${section.key}`"
                v-model="section.subheading"
                class="form-control"
                type="text"
                maxlength="200"
              />
            </UiFormField>

            <div class="field">
              <p :id="`section-body-label-${section.key}`" class="form-label">Text</p>
              <ClientOnly>
                <BulletinRichTextEditor
                  v-model="section.bodyHtml"
                  :labelled-by="`section-body-label-${section.key}`"
                  :editable="!editingLocked"
                />
              </ClientOnly>
            </div>

            <div class="editor__grid">
              <UiFormField
                label="Image link (optional)"
                :input-id="`section-img-${section.key}`"
                hint="Address of an image that is already online."
              >
                <input
                  :id="`section-img-${section.key}`"
                  v-model="section.imageUrl"
                  class="form-control"
                  type="url"
                  placeholder="https://"
                />
              </UiFormField>
              <UiFormField
                v-if="section.imageUrl"
                label="Describe the image"
                :input-id="`section-alt-${section.key}`"
                hint="Read aloud for people who can’t see it."
              >
                <input
                  :id="`section-alt-${section.key}`"
                  v-model="section.imageAltText"
                  class="form-control"
                  type="text"
                  maxlength="300"
                />
              </UiFormField>
            </div>

            <div class="editor__grid">
              <UiFormField
                label="More information link (optional)"
                :input-id="`section-link-${section.key}`"
                hint="Printed with a QR code so readers can scan it."
              >
                <input
                  :id="`section-link-${section.key}`"
                  v-model="section.linkUrl"
                  class="form-control"
                  type="url"
                  placeholder="https://"
                />
              </UiFormField>
              <UiFormField
                v-if="section.linkUrl"
                label="Link text"
                :input-id="`section-link-label-${section.key}`"
              >
                <input
                  :id="`section-link-label-${section.key}`"
                  v-model="section.linkLabel"
                  class="form-control"
                  type="text"
                  maxlength="120"
                  placeholder="Sign up"
                />
              </UiFormField>
            </div>
          </fieldset>

          <div v-if="!readOnly" class="editor__add">
            <UiAppButton type="button" variant="secondary" @click="addSection('Main')"
              >Add section</UiAppButton
            >
            <UiAppButton
              v-if="draft.template === 'Newsletter'"
              type="button"
              variant="ghost"
              @click="addSection('Side')"
            >
              Add side-column section
            </UiAppButton>
          </div>

          <fieldset class="editor__panel" :disabled="busy !== null">
            <legend class="editor__legend">Other languages</legend>
            <p v-if="saved.editions.length > 1" class="editor__hint">
              Editions:
              <template v-for="(edition, i) in saved.editions" :key="edition.id">
                <template v-if="i > 0">, </template>
                <strong v-if="edition.id === saved.id"
                  >{{ bulletinLanguageName(edition.language) }} (this one)</strong
                >
                <NuxtLink v-else :to="`/bulletins/${edition.id}`">
                  {{ bulletinLanguageName(edition.language)
                  }}{{ edition.status === 'Draft' ? ' (draft)' : '' }}
                </NuxtLink>
              </template>
            </p>
            <div v-if="canEdit" class="editor__inline">
              <UiFormField label="Start another edition in" input-id="edition-language">
                <select id="edition-language" v-model="editionLanguage" class="form-control">
                  <option
                    v-for="language in BULLETIN_LANGUAGES.filter(
                      (l) => !saved?.editions.some((e) => e.language === l.code),
                    )"
                    :key="language.code"
                    :value="language.code"
                  >
                    {{ language.name }}
                  </option>
                </select>
              </UiFormField>
              <UiAppButton type="button" variant="secondary" @click="addEdition">
                {{ busy === 'edition' ? 'Copying…' : 'Copy to translate' }}
              </UiAppButton>
            </div>
          </fieldset>

          <div v-if="canEdit && (!isPublished || canPublish)" class="editor__danger">
            <UiAppButton
              type="button"
              variant="danger"
              :disabled="busy !== null"
              @click="removeBulletin"
            >
              Delete bulletin
            </UiAppButton>
          </div>
        </form>

        <section ref="previewPane" class="editor__preview" aria-label="Preview">
          <div class="editor__preview-bar">
            <h2 class="editor__preview-title">Preview</h2>
            <UiAppButton type="button" variant="ghost" @click="printPdf"
              >Print or save as PDF</UiAppButton
            >
          </div>
          <div class="editor__paper print-root" :style="{ '--preview-scale': previewScale }">
            <BulletinDocument
              v-if="previewModel"
              :bulletin="previewModel"
              :page-url="isPublished ? publicUrl : null"
            />
          </div>
        </section>
      </div>
    </template>
  </LayoutPageContainer>
</template>

<style scoped>
.editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: var(--space-6);
  align-items: start;
}

.editor__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.editor__panel {
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding: var(--space-4) var(--space-5) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.editor__legend {
  padding: 0 var(--space-2);
  font-weight: 700;
}

.editor__section {
  position: relative;
}

.editor__section-tools {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-1);
  margin-top: calc(var(--space-2) * -1);
}

.editor__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--space-4);
}

.editor__add,
.editor__inline,
.editor__danger {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

.editor__inline :deep(.field) {
  flex: 1;
  min-width: 12rem;
}

.editor__hint {
  margin: 0;
  color: var(--color-text-muted);
}

.editor__status {
  align-self: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.editor__status--live {
  color: var(--color-accent);
  font-weight: 600;
}

.editor__share {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.editor__share p {
  margin: 0;
  overflow-wrap: anywhere;
}

.editor__preview {
  position: sticky;
  top: var(--space-4);
  max-height: calc(100vh - var(--space-8, 2rem));
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
}

.editor__preview-bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.editor__preview-title {
  font-size: 0.9375rem;
  font-weight: 700;
  margin: 0;
}

.editor__paper {
  width: 8.5in;
  /* Measured in script: fits a letter-width page into the pane. Print resets it. */
  zoom: var(--preview-scale, 1);
  margin: var(--space-4);
  box-shadow: 0 1px 3px rgb(26 35 50 / 0.12);
}

@media (max-width: 1100px) {
  .editor {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor__preview {
    position: static;
    max-height: none;
  }
}
</style>
