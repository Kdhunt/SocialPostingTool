<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import QRCode from 'qrcode';
import { orderBulletinSections } from '@ward-comms/domain';
import type { BulletinDocumentModel } from '~/utils/bulletin-document';

/**
 * Renders a bulletin as the printed newsletter: header, then sections laid
 * out by the template. Used for the live preview in the editor, the public
 * page at /{slug}/{id}, and printing to PDF. Section bodies are HTML that
 * the API has already reduced to the bulletin allowlist.
 */

const props = defineProps<{
  bulletin: BulletinDocumentModel;
  /** Public address of this bulletin; adds a "read online" QR code at the end. */
  pageUrl?: string | null;
}>();

const ordered = computed(() => orderBulletinSections(props.bulletin.sections));
const isNewsletter = computed(() => props.bulletin.template === 'Newsletter');
const mainSections = computed(() =>
  isNewsletter.value ? ordered.value.filter((s) => s.column === 'Main') : ordered.value,
);
const sideSections = computed(() =>
  isNewsletter.value ? ordered.value.filter((s) => s.column === 'Side') : [],
);

const formattedDate = computed(() => {
  try {
    return new Intl.DateTimeFormat(props.bulletin.language, {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${props.bulletin.issueDate}T00:00:00Z`));
  } catch {
    return props.bulletin.issueDate;
  }
});

const readOnlineLabel = computed(() =>
  props.bulletin.language.startsWith('es') ? 'Escanee para leer en línea' : 'Scan to read online',
);

/** SVG markup per URL. QRCode encodes the URL as module paths; the URL text is not embedded. */
const qrSvgs = ref<Record<string, string>>({});

watch(
  () => [props.pageUrl, ...props.bulletin.sections.map((s) => s.linkUrl)],
  async (urls) => {
    const next: Record<string, string> = {};
    for (const url of urls) {
      if (!url || next[url]) continue;
      next[url] =
        qrSvgs.value[url] ??
        (await QRCode.toString(url, {
          type: 'svg',
          margin: 0,
          errorCorrectionLevel: 'M',
          color: { dark: '#1e3a66' },
        }));
    }
    qrSvgs.value = next;
  },
  { immediate: true },
);
</script>

<template>
  <div class="bulletin-frame">
    <article
      class="bulletin-doc"
      :class="{ 'bulletin-doc--single': !isNewsletter }"
      :lang="bulletin.language"
    >
      <header class="bulletin-doc__masthead">
        <p v-if="bulletin.kicker" class="bulletin-doc__kicker">{{ bulletin.kicker }}</p>
        <h1 class="bulletin-doc__title">{{ bulletin.title }}</h1>
        <p class="bulletin-doc__date">
          <time :datetime="bulletin.issueDate">{{ formattedDate }}</time>
        </p>
      </header>

      <div class="bulletin-doc__columns">
        <div class="bulletin-doc__main">
          <section v-for="section in mainSections" :key="section.key" class="bulletin-doc__section">
            <header v-if="section.heading || section.subheading" class="bulletin-doc__band">
              <p v-if="section.organizationName" class="bulletin-doc__org">
                {{ section.organizationName }}
              </p>
              <h2 v-if="section.heading" class="bulletin-doc__heading">{{ section.heading }}</h2>
              <p v-if="section.subheading" class="bulletin-doc__subheading">
                {{ section.subheading }}
              </p>
            </header>
            <div class="bulletin-doc__content">
              <img
                v-if="section.imageUrl"
                class="bulletin-doc__image"
                :src="section.imageUrl"
                :alt="section.imageAltText ?? ''"
                loading="lazy"
              />
              <!-- eslint-disable-next-line vue/no-v-html -- sanitized to the bulletin allowlist by the API -->
              <div v-if="section.bodyHtml" class="bulletin-doc__body" v-html="section.bodyHtml" />
              <div v-if="section.linkUrl" class="bulletin-doc__link">
                <!-- eslint-disable-next-line vue/no-v-html -- QR library output (path data only) -->
                <span
                  v-if="qrSvgs[section.linkUrl]"
                  class="bulletin-doc__qr"
                  aria-hidden="true"
                  v-html="qrSvgs[section.linkUrl]"
                />
                <a :href="section.linkUrl" target="_blank" rel="noopener noreferrer">{{
                  section.linkLabel || section.linkUrl
                }}</a>
              </div>
            </div>
          </section>
        </div>

        <aside v-if="sideSections.length > 0" class="bulletin-doc__side">
          <section
            v-for="section in sideSections"
            :key="section.key"
            class="bulletin-doc__side-section"
          >
            <p v-if="section.organizationName" class="bulletin-doc__org">
              {{ section.organizationName }}
            </p>
            <h2 v-if="section.heading" class="bulletin-doc__side-heading">{{ section.heading }}</h2>
            <p v-if="section.subheading" class="bulletin-doc__subheading">
              {{ section.subheading }}
            </p>
            <img
              v-if="section.imageUrl"
              class="bulletin-doc__image"
              :src="section.imageUrl"
              :alt="section.imageAltText ?? ''"
              loading="lazy"
            />
            <!-- eslint-disable-next-line vue/no-v-html -- sanitized to the bulletin allowlist by the API -->
            <div v-if="section.bodyHtml" class="bulletin-doc__body" v-html="section.bodyHtml" />
            <div v-if="section.linkUrl" class="bulletin-doc__link">
              <!-- eslint-disable-next-line vue/no-v-html -- QR library output (path data only) -->
              <span
                v-if="qrSvgs[section.linkUrl]"
                class="bulletin-doc__qr"
                aria-hidden="true"
                v-html="qrSvgs[section.linkUrl]"
              />
              <a :href="section.linkUrl" target="_blank" rel="noopener noreferrer">{{
                section.linkLabel || section.linkUrl
              }}</a>
            </div>
          </section>
        </aside>
      </div>

      <footer v-if="pageUrl && qrSvgs[pageUrl]" class="bulletin-doc__footer">
        <!-- eslint-disable-next-line vue/no-v-html -- QR library output (path data only) -->
        <span
          class="bulletin-doc__qr bulletin-doc__qr--page"
          aria-hidden="true"
          v-html="qrSvgs[pageUrl]"
        />
        <p>
          {{ readOnlineLabel }}<br /><span class="bulletin-doc__url">{{ pageUrl }}</span>
        </p>
      </footer>
    </article>
  </div>
</template>

<style scoped>
/* Sizes to its container (editor preview pane, public page, phone), not the viewport. */
.bulletin-frame {
  container-type: inline-size;
}

/* Newsletter palette, taken from the unit's printed newsletter. */
.bulletin-doc {
  --bulletin-red: #a8232c;
  --bulletin-navy: #1e3a66;
  --bulletin-band: #dfe3e8;
  --bulletin-ink: #23262b;
  --bulletin-rule: #c9ced6;
  --bulletin-serif: Georgia, 'Times New Roman', Times, serif;

  background: #ffffff;
  color: var(--bulletin-ink);
  padding: 2.5rem 2.25rem 2rem;
  font-size: 0.9375rem;
  line-height: 1.5;
  max-width: 8.5in;
  margin: 0 auto;
}

.bulletin-doc__masthead {
  text-align: center;
  margin-bottom: 1.75rem;
}

.bulletin-doc__kicker {
  margin: 0;
  color: var(--bulletin-navy);
  font-family: var(--bulletin-serif);
  font-size: 0.9375rem;
}

.bulletin-doc__title {
  margin: 0.125rem 0 0;
  color: var(--bulletin-red);
  font-family: var(--bulletin-serif);
  font-weight: 400;
  font-size: clamp(1.75rem, 4.5vw, 2.5rem);
  line-height: 1.1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.bulletin-doc__date {
  margin: 0.25rem 0 0;
  color: var(--bulletin-navy);
  font-family: var(--bulletin-serif);
  font-weight: 700;
}

.bulletin-doc__columns {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 1.75rem;
  align-items: start;
}

.bulletin-doc--single .bulletin-doc__columns {
  grid-template-columns: minmax(0, 1fr);
  max-width: 38rem;
  margin: 0 auto;
}

.bulletin-doc__main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.bulletin-doc__section {
  break-inside: avoid;
}

.bulletin-doc__band {
  background: var(--bulletin-band);
  text-align: center;
  padding: 0.625rem 1rem 0.75rem;
  margin-bottom: 0.75rem;
}

.bulletin-doc__org {
  margin: 0 0 0.125rem;
  color: var(--bulletin-navy);
  font-size: 0.8125rem;
  opacity: 0.8;
}

.bulletin-doc__heading {
  margin: 0;
  color: var(--bulletin-navy);
  font-family: var(--bulletin-serif);
  font-size: 1.1875rem;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
}

.bulletin-doc__subheading {
  margin: 0.25rem 0 0;
  color: var(--bulletin-navy);
  font-weight: 600;
}

.bulletin-doc__content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bulletin-doc__image {
  display: block;
  width: 100%;
  max-height: 16rem;
  object-fit: contain;
}

.bulletin-doc__body :deep(p),
.bulletin-doc__body :deep(ul),
.bulletin-doc__body :deep(ol),
.bulletin-doc__body :deep(blockquote) {
  margin: 0 0 0.625rem;
}

.bulletin-doc__body :deep(h3),
.bulletin-doc__body :deep(h4) {
  margin: 0.75rem 0 0.375rem;
  color: var(--bulletin-navy);
  font-family: var(--bulletin-serif);
  font-size: 1.0625rem;
}

.bulletin-doc__body :deep(a),
.bulletin-doc__link a {
  color: var(--bulletin-navy);
  overflow-wrap: anywhere;
}

.bulletin-doc__body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0 0.75rem;
  font-size: 0.875rem;
}

.bulletin-doc__body :deep(th),
.bulletin-doc__body :deep(td) {
  border: 1px solid var(--bulletin-rule);
  padding: 0.375rem 0.5rem;
  text-align: left;
  vertical-align: top;
}

.bulletin-doc__body :deep(th) {
  background: var(--bulletin-band);
  color: var(--bulletin-navy);
}

.bulletin-doc__body :deep(td p),
.bulletin-doc__body :deep(th p) {
  margin: 0;
}

.bulletin-doc__link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.bulletin-doc__qr {
  flex: none;
  width: 4.5rem;
  height: 4.5rem;
}

.bulletin-doc__qr :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.bulletin-doc__side {
  border: 1px solid var(--bulletin-rule);
  padding: 1.25rem 1.125rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  text-align: center;
}

.bulletin-doc__side-section {
  break-inside: avoid;
}

.bulletin-doc__side-section + .bulletin-doc__side-section {
  border-top: 1px solid var(--bulletin-rule);
  padding-top: 1.25rem;
}

.bulletin-doc__side-heading {
  margin: 0;
  color: var(--bulletin-navy);
  font-family: var(--bulletin-serif);
  font-size: 1.0625rem;
  font-weight: 700;
  text-transform: uppercase;
}

.bulletin-doc__side .bulletin-doc__image {
  margin: 0.75rem auto;
}

.bulletin-doc__side .bulletin-doc__body {
  margin-top: 0.5rem;
}

.bulletin-doc__side .bulletin-doc__link {
  justify-content: center;
  flex-direction: column;
  gap: 0.375rem;
}

.bulletin-doc__footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--bulletin-rule);
  color: var(--bulletin-navy);
  font-size: 0.875rem;
}

.bulletin-doc__footer p {
  margin: 0;
}

.bulletin-doc__url {
  color: var(--bulletin-ink);
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}

@container (max-width: 640px) {
  .bulletin-doc {
    padding: 1.5rem 1rem;
  }

  .bulletin-doc__columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media print {
  .bulletin-doc {
    padding: 0;
    max-width: none;
    font-size: 10.5pt;
  }

  .bulletin-doc__columns {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }

  .bulletin-doc--single .bulletin-doc__columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .bulletin-doc__image {
    max-height: 2.25in;
  }

  .bulletin-doc__qr {
    width: 0.8in;
    height: 0.8in;
  }

  .bulletin-doc__band,
  .bulletin-doc__body :deep(th) {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
</style>
