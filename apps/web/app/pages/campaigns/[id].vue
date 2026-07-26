<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { navigateTo, useRoute } from '#imports';
import { ApiRequestError } from '@ward-comms/api-client';
import type {
  AudienceGroupSummaryDto,
  CampaignAssetDto,
  CampaignDetailDto,
  CampaignPreviewResponse,
  CampaignValidationResponse,
  CommunicationChannel,
  DeliveryBatchDetailDto,
  DeliveryBatchSummaryDto,
  OverlapResolutionStrategyDto,
} from '@ward-comms/validation';
import { useApiClient } from '~/composables/useApiClient';
import { useAuth } from '~/composables/useAuth';

definePageMeta({ layout: 'authenticated' });

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; campaign: CampaignDetailDto };

const CHANNELS: CommunicationChannel[] = ['Email', 'Sms', 'FacebookPage'];

const route = useRoute();
const campaignId = route.params.id as string;
const client = useApiClient();
const { state: authState, refreshSession } = useAuth();

const pageState = ref<PageState>({ kind: 'loading' });
const actionError = ref<string | null>(null);

const editName = ref('');
const editBaseMessage = ref('');
const editBaseImageAssetId = ref('');

const channelDrafts = ref<Record<CommunicationChannel, string>>({ Email: '', Sms: '', FacebookPage: '' });

const availableAudiences = ref<AudienceGroupSummaryDto[]>([]);
const newAudienceGroupId = ref('');
const newAudienceOverrideText = ref('');
const newAudienceOverrideImageAssetId = ref('');

const assetStorageReference = ref('');
const assetContentType = ref('image/jpeg');
const assetAltText = ref('');
const createdAssetIds = ref<string[]>([]);

const aiPrompt = ref('');
const aiAltText = ref('');
const pendingAsset = ref<CampaignAssetDto | null>(null);

const overlapStrategy = ref<OverlapResolutionStrategyDto>('FirstAudienceWins');
const preferAudienceGroupId = ref('');

const approvalComment = ref('');
const scheduleAt = ref('');

const previewState = ref<{ kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'loaded'; preview: CampaignPreviewResponse }>({
  kind: 'idle',
});
const validationState = ref<
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'loaded'; result: CampaignValidationResponse }
>({ kind: 'idle' });

const deliveryBatches = ref<DeliveryBatchSummaryDto[]>([]);
const selectedBatch = ref<DeliveryBatchDetailDto | null>(null);
const deliveryLoading = ref(false);
const deliveryError = ref<string | null>(null);

function permissions(): string[] {
  return authState.value.kind === 'authenticated' ? authState.value.user.permissions : [];
}

function canDraft(): boolean {
  return permissions().includes('campaigns.create');
}

function canApprove(): boolean {
  return permissions().includes('campaigns.approve');
}

function canSend(): boolean {
  return permissions().includes('campaigns.send');
}

const isEditable = computed(() => pageState.value.kind === 'loaded' && pageState.value.campaign.status === 'Draft');

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const campaign = await client.getCampaign(campaignId);
    pageState.value = { kind: 'loaded', campaign };
    editName.value = campaign.name;
    editBaseMessage.value = campaign.currentVersion.baseMessage ?? '';
    editBaseImageAssetId.value = campaign.currentVersion.baseImageAssetId ?? '';
    overlapStrategy.value = campaign.currentVersion.overlapResolutionStrategy ?? 'FirstAudienceWins';
    preferAudienceGroupId.value = campaign.currentVersion.preferSpecificAudienceGroupId ?? '';
    for (const channel of CHANNELS) {
      channelDrafts.value[channel] = campaign.currentVersion.channelVersions.find((c) => c.channel === channel)?.text ?? '';
    }
  } catch (error) {
    pageState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load campaign.',
    };
  }
}

async function loadAudienceOptions(): Promise<void> {
  try {
    const { audiences } = await client.searchAudiences({});
    availableAudiences.value = audiences;
  } catch {
    // The audience picker is a convenience; the page still works without it.
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  await Promise.all([load(), loadAudienceOptions(), loadDeliveryBatches()]);
});

function withActionErrorHandling(action: () => Promise<CampaignDetailDto>): () => Promise<void> {
  return async () => {
    actionError.value = null;
    try {
      const campaign = await action();
      pageState.value = { kind: 'loaded', campaign };
    } catch (error) {
      actionError.value = error instanceof ApiRequestError ? error.message : 'Action failed.';
    }
  };
}

const saveName = withActionErrorHandling(() => client.updateCampaignName(campaignId, { name: editName.value }));

const saveContent = withActionErrorHandling(() =>
  client.updateCampaignContent(campaignId, {
    baseMessage: editBaseMessage.value || null,
    baseImageAssetId: editBaseImageAssetId.value || null,
  }),
);

async function createAsset(): Promise<void> {
  actionError.value = null;
  try {
    const { id } = await client.createCampaignAsset(campaignId, {
      storageReference: assetStorageReference.value,
      contentType: assetContentType.value,
      altText: assetAltText.value,
    });
    createdAssetIds.value = [...createdAssetIds.value, id];
    assetStorageReference.value = '';
    assetAltText.value = '';
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to register the image.';
  }
}

async function generateAiImage(): Promise<void> {
  actionError.value = null;
  try {
    pendingAsset.value = await client.generateCampaignImage(campaignId, {
      prompt: aiPrompt.value,
      altText: aiAltText.value,
    });
    aiPrompt.value = '';
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to generate image.';
  }
}

async function confirmPendingAsset(): Promise<void> {
  if (!pendingAsset.value) return;
  actionError.value = null;
  try {
    pendingAsset.value = await client.confirmCampaignAsset(campaignId, pendingAsset.value.id);
    createdAssetIds.value = [...createdAssetIds.value, pendingAsset.value.id];
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to confirm image.';
  }
}

async function rejectPendingAsset(): Promise<void> {
  if (!pendingAsset.value) return;
  actionError.value = null;
  try {
    await client.rejectCampaignAsset(campaignId, pendingAsset.value.id);
    pendingAsset.value = null;
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to discard image.';
  }
}

const saveOverlapResolution = withActionErrorHandling(() =>
  client.setCampaignOverlapResolution(campaignId, {
    overlapResolutionStrategy: overlapStrategy.value,
    preferSpecificAudienceGroupId:
      overlapStrategy.value === 'PreferSpecificAudience' ? preferAudienceGroupId.value || null : null,
  }),
);

function saveChannelText(channel: CommunicationChannel): Promise<void> {
  const text = channelDrafts.value[channel];
  if (!text.trim()) {
    return withActionErrorHandling(() => client.removeCampaignChannelText(campaignId, channel))();
  }
  return withActionErrorHandling(() => client.setCampaignChannelText(campaignId, { channel, text }))();
}

function removeChannelText(channel: CommunicationChannel): Promise<void> {
  channelDrafts.value[channel] = '';
  return withActionErrorHandling(() => client.removeCampaignChannelText(campaignId, channel))();
}

const addAudience = withActionErrorHandling(async () => {
  const result = await client.addCampaignAudience(campaignId, {
    audienceGroupId: newAudienceGroupId.value,
    overrideText: newAudienceOverrideText.value || undefined,
    overrideImageAssetId: newAudienceOverrideImageAssetId.value || undefined,
  });
  newAudienceGroupId.value = '';
  newAudienceOverrideText.value = '';
  newAudienceOverrideImageAssetId.value = '';
  return result;
});

function removeAudience(audienceGroupId: string): Promise<void> {
  return withActionErrorHandling(() => client.removeCampaignAudience(campaignId, audienceGroupId))();
}

async function runPreview(): Promise<void> {
  previewState.value = { kind: 'loading' };
  try {
    const preview = await client.previewCampaign(campaignId);
    previewState.value = { kind: 'loaded', preview };
  } catch (error) {
    previewState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load preview.',
    };
  }
}

async function runValidation(): Promise<void> {
  validationState.value = { kind: 'loading' };
  try {
    const result = await client.validateCampaign(campaignId);
    validationState.value = { kind: 'loaded', result };
  } catch (error) {
    validationState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to validate campaign.',
    };
  }
}

const submitForApproval = withActionErrorHandling(() => client.submitCampaignForApproval(campaignId));
const approve = withActionErrorHandling(async () => {
  const result = await client.approveCampaign(campaignId, approvalComment.value || undefined);
  approvalComment.value = '';
  return result;
});
const reject = withActionErrorHandling(async () => {
  const result = await client.rejectCampaign(campaignId, approvalComment.value || undefined);
  approvalComment.value = '';
  return result;
});
const revise = withActionErrorHandling(() => client.reviseCampaign(campaignId));
const sendNow = withActionErrorHandling(() => client.sendCampaignNow(campaignId));

async function loadDeliveryBatches(): Promise<void> {
  if (!canSend()) return;
  deliveryLoading.value = true;
  deliveryError.value = null;
  try {
    const { batches } = await client.listDeliveryBatches(campaignId);
    deliveryBatches.value = batches;
    if (batches.length > 0 && !selectedBatch.value) {
      selectedBatch.value = await client.getDeliveryBatch(campaignId, batches[0].id);
    }
  } catch (error) {
    deliveryError.value = error instanceof ApiRequestError ? error.message : 'Unable to load delivery results.';
  } finally {
    deliveryLoading.value = false;
  }
}

async function viewBatch(batchId: string): Promise<void> {
  deliveryError.value = null;
  try {
    selectedBatch.value = await client.getDeliveryBatch(campaignId, batchId);
  } catch (error) {
    deliveryError.value = error instanceof ApiRequestError ? error.message : 'Unable to load batch details.';
  }
}

async function sendNowAndRefresh(): Promise<void> {
  await sendNow();
  await loadDeliveryBatches();
}
const cancel = withActionErrorHandling(() => client.cancelCampaign(campaignId));

const schedule = withActionErrorHandling(() => {
  if (!scheduleAt.value) {
    throw new ApiRequestError('Choose a date and time first.', 400);
  }
  return client.scheduleCampaign(campaignId, new Date(scheduleAt.value).toISOString());
});

async function archiveCampaign(): Promise<void> {
  actionError.value = null;
  try {
    await client.archiveCampaign(campaignId);
    await load();
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Unable to archive campaign.';
  }
}
</script>

<template>
  <main class="campaign-page">
    <p><NuxtLink to="/campaigns">&larr; Back to campaigns</NuxtLink></p>

    <p v-if="pageState.kind === 'loading'">Loading…</p>
    <p v-else-if="pageState.kind === 'error'" role="alert" class="campaign-page__error">{{ pageState.message }}</p>

    <template v-else-if="pageState.kind === 'loaded'">
      <header class="campaign-page__header">
        <h1>{{ pageState.campaign.name }}</h1>
        <span class="campaign-page__tag">{{ pageState.campaign.status }}</span>
        <span v-if="!pageState.campaign.isActive" class="campaign-page__tag">Archived</span>
      </header>

      <p v-if="actionError" role="alert" class="campaign-page__error">{{ actionError }}</p>

      <section aria-labelledby="status-heading" class="campaign-page__status-actions">
        <h2 id="status-heading">Status actions</h2>
        <div class="campaign-page__button-row">
          <button v-if="canDraft() && pageState.campaign.status === 'Draft'" type="button" @click="submitForApproval">
            Submit for approval
          </button>
          <button v-if="canDraft() && pageState.campaign.status === 'Rejected'" type="button" @click="revise">
            Revise (reopen as draft)
          </button>
          <button
            v-if="canSend() && ['Approved', 'Scheduled'].includes(pageState.campaign.status)"
            type="button"
            @click="sendNowAndRefresh"
          >
            Send now
          </button>
          <button
            v-if="(canDraft() || canApprove() || canSend()) && !['Sent', 'Cancelled'].includes(pageState.campaign.status)"
            type="button"
            class="campaign-page__danger"
            @click="cancel"
          >
            Cancel campaign
          </button>
          <button v-if="canDraft() && pageState.campaign.status !== 'Sending'" type="button" @click="archiveCampaign">
            Archive
          </button>
        </div>

        <div v-if="canApprove() && pageState.campaign.status === 'PendingApproval'" class="campaign-page__approval-form">
          <label for="approval-comment">Approval comment (optional)</label>
          <textarea id="approval-comment" v-model="approvalComment" rows="2"></textarea>
          <div class="campaign-page__button-row">
            <button type="button" @click="approve">Approve</button>
            <button type="button" class="campaign-page__danger" @click="reject">Reject</button>
          </div>
        </div>

        <div v-if="canSend() && pageState.campaign.status === 'Approved'" class="campaign-page__approval-form">
          <label for="schedule-at">Schedule for later (optional)</label>
          <input id="schedule-at" v-model="scheduleAt" type="datetime-local" />
          <button type="button" @click="schedule">Schedule</button>
        </div>
      </section>

      <section aria-labelledby="info-heading">
        <h2 id="info-heading">Campaign info</h2>
        <form class="campaign-page__form" novalidate @submit.prevent="saveName">
          <label for="edit-name">Name</label>
          <input id="edit-name" v-model="editName" type="text" required />
          <button type="submit">Save name</button>
        </form>
      </section>

      <section aria-labelledby="content-heading">
        <h2 id="content-heading">Base content (version {{ pageState.campaign.currentVersion.versionNumber }})</h2>
        <p v-if="!isEditable" class="campaign-page__hint">
          This version can only be edited while the campaign is a Draft.
        </p>
        <form class="campaign-page__form" novalidate @submit.prevent="saveContent">
          <label for="base-message">Base message</label>
          <textarea id="base-message" v-model="editBaseMessage" rows="4" :disabled="!isEditable"></textarea>

          <label for="base-image-asset-id">Base image asset ID (optional)</label>
          <input id="base-image-asset-id" v-model="editBaseImageAssetId" type="text" :disabled="!isEditable" />

          <button type="submit" :disabled="!isEditable">Save content</button>
        </form>

        <details class="campaign-page__assets">
          <summary>Register an image asset</summary>
          <form class="campaign-page__form" novalidate @submit.prevent="createAsset">
            <label for="asset-storage-reference">Storage reference</label>
            <input id="asset-storage-reference" v-model="assetStorageReference" type="text" required :disabled="!isEditable" />

            <label for="asset-content-type">Content type</label>
            <input id="asset-content-type" v-model="assetContentType" type="text" required :disabled="!isEditable" />

            <label for="asset-alt-text">Alt text</label>
            <input id="asset-alt-text" v-model="assetAltText" type="text" required :disabled="!isEditable" />

            <button type="submit" :disabled="!isEditable">Register image</button>
          </form>
          <ul v-if="createdAssetIds.length > 0" class="campaign-page__list">
            <li v-for="id in createdAssetIds" :key="id">{{ id }}</li>
          </ul>
        </details>

        <details class="campaign-page__assets" open>
          <summary>Generate image with AI (requires confirmation before use)</summary>
          <p class="campaign-page__hint">
            Generated images are saved as drafts. Confirm before attaching as base or audience override.
            Ward ContactConsent is separate from
            <a href="https://account.churchofjesuschrist.org/subscriptions" rel="noopener noreferrer" target="_blank">
              Church Account subscription preferences
            </a>.
          </p>
          <form class="campaign-page__form" novalidate @submit.prevent="generateAiImage">
            <label for="ai-prompt">Image prompt</label>
            <textarea id="ai-prompt" v-model="aiPrompt" rows="2" required :disabled="!isEditable"></textarea>
            <label for="ai-alt-text">Alt text for generated image</label>
            <input id="ai-alt-text" v-model="aiAltText" type="text" required :disabled="!isEditable" />
            <button type="submit" :disabled="!isEditable">Generate draft</button>
          </form>
          <div v-if="pendingAsset" class="campaign-page__ai-preview">
            <p>
              <strong>Pending draft:</strong> {{ pendingAsset.storageReference }}
              ({{ pendingAsset.confirmationStatus }})
            </p>
            <img
              v-if="pendingAsset.storageReference.startsWith('http')"
              :src="pendingAsset.storageReference"
              :alt="pendingAsset.altText"
              class="campaign-page__ai-preview-image"
            />
            <div class="campaign-page__button-row">
              <button type="button" :disabled="!isEditable" @click="confirmPendingAsset">Confirm</button>
              <button type="button" class="campaign-page__danger" :disabled="!isEditable" @click="rejectPendingAsset">
                Discard
              </button>
            </div>
            <p class="campaign-page__hint">Confirming does not auto-attach — paste the asset ID into base content manually.</p>
          </div>
        </details>
      </section>

      <section aria-labelledby="overlap-heading">
        <h2 id="overlap-heading">Overlap content resolution</h2>
        <p class="campaign-page__hint">
          When someone belongs to multiple selected audiences, choose which override content applies.
        </p>
        <form class="campaign-page__form" novalidate @submit.prevent="saveOverlapResolution">
          <label for="overlap-strategy">Strategy</label>
          <select id="overlap-strategy" v-model="overlapStrategy" :disabled="!isEditable">
            <option value="FirstAudienceWins">First audience in list wins</option>
            <option value="PreferBase">Prefer base campaign content</option>
            <option value="PreferSpecificAudience">Prefer a specific audience</option>
          </select>
          <template v-if="overlapStrategy === 'PreferSpecificAudience'">
            <label for="prefer-audience">Preferred audience</label>
            <select id="prefer-audience" v-model="preferAudienceGroupId" :disabled="!isEditable">
              <option value="" disabled>Choose audience</option>
              <option
                v-for="audience in pageState.kind === 'loaded' ? pageState.campaign.currentVersion.audiences : []"
                :key="audience.audienceGroupId"
                :value="audience.audienceGroupId"
              >
                {{ audience.audienceGroupName }}
              </option>
            </select>
          </template>
          <button type="submit" :disabled="!isEditable">Save strategy</button>
        </form>
      </section>

      <section aria-labelledby="channels-heading">
        <h2 id="channels-heading">Channel-specific text</h2>
        <div v-for="channel in CHANNELS" :key="channel" class="campaign-page__channel">
          <label :for="`channel-${channel}`">{{ channel }} (optional override; falls back to the base message)</label>
          <textarea :id="`channel-${channel}`" v-model="channelDrafts[channel]" rows="2" :disabled="!isEditable"></textarea>
          <div class="campaign-page__button-row">
            <button type="button" :disabled="!isEditable" @click="saveChannelText(channel)">Save</button>
            <button type="button" :disabled="!isEditable" @click="removeChannelText(channel)">Clear</button>
          </div>
        </div>
      </section>

      <section aria-labelledby="audiences-heading">
        <h2 id="audiences-heading">Audiences ({{ pageState.campaign.currentVersion.audiences.length }})</h2>
        <ul class="campaign-page__list">
          <li v-for="audience in pageState.campaign.currentVersion.audiences" :key="audience.audienceGroupId">
            <div class="campaign-page__audience-info">
              <strong>{{ audience.audienceGroupName }}</strong>
              <span v-if="audience.overrideText" class="campaign-page__hint">Override: {{ audience.overrideText }}</span>
            </div>
            <button type="button" :disabled="!isEditable" @click="removeAudience(audience.audienceGroupId)">Remove</button>
          </li>
          <li v-if="pageState.campaign.currentVersion.audiences.length === 0">No audiences selected yet.</li>
        </ul>

        <form class="campaign-page__form" novalidate @submit.prevent="addAudience">
          <label for="audience-select">Add audience</label>
          <select id="audience-select" v-model="newAudienceGroupId" required :disabled="!isEditable">
            <option value="" disabled>Choose an audience</option>
            <option v-for="audience in availableAudiences" :key="audience.id" :value="audience.id">
              {{ audience.name }}
            </option>
          </select>

          <label for="audience-override-text">Override text for this audience (optional)</label>
          <textarea id="audience-override-text" v-model="newAudienceOverrideText" rows="2" :disabled="!isEditable"></textarea>

          <label for="audience-override-image">Override image asset ID (optional)</label>
          <input id="audience-override-image" v-model="newAudienceOverrideImageAssetId" type="text" :disabled="!isEditable" />

          <button type="submit" :disabled="!isEditable">Add audience</button>
        </form>
      </section>

      <section aria-labelledby="destinations-heading">
        <h2 id="destinations-heading">Destinations (auto-computed from selected audiences)</h2>
        <ul class="campaign-page__list">
          <li v-for="destination in pageState.campaign.currentVersion.destinations" :key="destination.destinationId">
            {{ destination.name }} ({{ destination.channel }})
            <span v-if="!destination.isActive" class="campaign-page__tag">Archived</span>
          </li>
          <li v-if="pageState.campaign.currentVersion.destinations.length === 0">No destinations yet.</li>
        </ul>
      </section>

      <section aria-labelledby="preview-heading">
        <h2 id="preview-heading">Preview</h2>
        <button type="button" @click="runPreview">Load preview</button>
        <p v-if="previewState.kind === 'loading'">Loading preview…</p>
        <p v-else-if="previewState.kind === 'error'" role="alert" class="campaign-page__error">{{ previewState.message }}</p>
        <template v-else-if="previewState.kind === 'loaded'">
          <p>
            {{ previewState.preview.totalUniqueRecipients }} unique recipient(s) across selected audiences
            ({{ previewState.preview.overlapCount }} overlapping).
            <span v-if="previewState.preview.overlapResolutionStrategy">
              Strategy: {{ previewState.preview.overlapResolutionStrategy }}
            </span>
          </p>
          <div v-if="previewState.preview.overlapConflicts?.length" class="campaign-page__overlap-conflicts">
            <h3>Overlap conflicts</h3>
            <ul class="campaign-page__list">
              <li v-for="conflict in previewState.preview.overlapConflicts" :key="conflict.personId">
                {{ conflict.displayName }} —
                <span v-if="conflict.usesBaseContent">uses base content</span>
                <span v-else>won by {{ conflict.winningAudienceGroupName ?? conflict.winningAudienceGroupId }}</span>
                (in {{ conflict.audienceGroupIds.length }} audiences)
              </li>
            </ul>
          </div>
          <div v-for="audience in previewState.preview.audiences" :key="audience.audienceGroupId" class="campaign-page__preview-audience">
            <h3>{{ audience.audienceGroupName }} — {{ audience.recipientCount }} recipient(s)</h3>
            <ul class="campaign-page__list">
              <li v-for="channel in audience.channels" :key="channel.channel">
                <strong>{{ channel.channel }}:</strong>
                <span v-if="channel.text">{{ channel.text }} ({{ channel.length }} chars)</span>
                <span v-else class="campaign-page__hint">No text resolved for this channel.</span>
                <span v-if="channel.exceedsLimit" class="campaign-page__tag campaign-page__tag--warning">Exceeds limit</span>
              </li>
            </ul>
          </div>
        </template>
      </section>

      <section aria-labelledby="validation-heading">
        <h2 id="validation-heading">Submission validation</h2>
        <button type="button" @click="runValidation">Check readiness</button>
        <p v-if="validationState.kind === 'loading'">Checking…</p>
        <p v-else-if="validationState.kind === 'error'" role="alert" class="campaign-page__error">{{ validationState.message }}</p>
        <template v-else-if="validationState.kind === 'loaded'">
          <p v-if="validationState.result.valid" class="campaign-page__success">Ready to submit for approval.</p>
          <ul v-else class="campaign-page__list">
            <li v-for="(err, index) in validationState.result.errors" :key="index" role="alert" class="campaign-page__error">
              {{ err }}
            </li>
          </ul>
        </template>
      </section>

      <section v-if="canSend()" aria-labelledby="delivery-heading">
        <h2 id="delivery-heading">Delivery results</h2>
        <p v-if="deliveryLoading">Loading delivery batches…</p>
        <p v-if="deliveryError" role="alert" class="campaign-page__error">{{ deliveryError }}</p>
        <template v-else-if="deliveryBatches.length > 0">
          <ul class="campaign-page__list">
            <li v-for="batch in deliveryBatches" :key="batch.id">
              <button type="button" @click="viewBatch(batch.id)">
                Batch {{ batch.id.slice(0, 8) }}… — {{ batch.status }}
                ({{ batch.sentCount }}/{{ batch.totalRecipients }} sent)
              </button>
            </li>
          </ul>
          <div v-if="selectedBatch" class="campaign-page__delivery-detail">
            <h3>Recipient outcomes</h3>
            <ul class="campaign-page__list">
              <li v-for="recipient in selectedBatch.recipients" :key="recipient.id">
                <span>{{ recipient.channel }}</span>
                <span class="campaign-page__tag">{{ recipient.status }}</span>
                <span v-if="recipient.skipReason" class="campaign-page__hint">{{ recipient.skipReason }}</span>
                <span v-if="recipient.attempts.length > 0" class="campaign-page__hint">
                  Last: {{ recipient.attempts[recipient.attempts.length - 1].errorCode ?? 'ok' }}
                </span>
              </li>
            </ul>
          </div>
        </template>
        <p v-else-if="!deliveryLoading">No delivery batches yet.</p>
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading">Approval &amp; schedule history</h2>
        <ul class="campaign-page__list">
          <li v-for="approval in pageState.campaign.approvals" :key="approval.id">
            {{ approval.decision }} at {{ approval.decidedAt }}
            <span v-if="approval.comment" class="campaign-page__hint">— {{ approval.comment }}</span>
          </li>
          <li v-for="scheduleItem in pageState.campaign.schedules" :key="scheduleItem.id">
            Scheduled for {{ scheduleItem.scheduledFor }}
            <span v-if="scheduleItem.cancelledAt" class="campaign-page__tag">Cancelled</span>
          </li>
          <li v-if="pageState.campaign.approvals.length === 0 && pageState.campaign.schedules.length === 0">
            No history yet.
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.campaign-page {
  max-width: 48rem;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.campaign-page__header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.campaign-page__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 28rem;
  margin-bottom: 0.75rem;
}

.campaign-page__form input,
.campaign-page__form textarea,
.campaign-page__form select {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-family: inherit;
}

.campaign-page__button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.campaign-page__status-actions {
  padding: 1rem;
  border: 1px solid #d0d7de;
  border-radius: 0.5rem;
  background: #f6f8fa;
}

.campaign-page__approval-form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 28rem;
  margin-top: 1rem;
}

.campaign-page__approval-form textarea,
.campaign-page__approval-form input {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
}

.campaign-page__channel {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-width: 28rem;
  margin-bottom: 1rem;
}

.campaign-page__channel textarea {
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-family: inherit;
}

.campaign-page__assets {
  margin-top: 1rem;
}

.campaign-page__danger {
  color: #cf222e;
  border-color: #cf222e;
}

.campaign-page__hint {
  color: #57606a;
  font-size: 0.875rem;
}

.campaign-page__success {
  color: #1a7f37;
  font-weight: 600;
}

.campaign-page__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.campaign-page__list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
  flex-wrap: wrap;
}

.campaign-page__audience-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  margin-right: auto;
}

.campaign-page__preview-audience {
  margin-top: 0.75rem;
}

.campaign-page__ai-preview {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #d0d7de;
  border-radius: 0.375rem;
}

.campaign-page__ai-preview-image {
  max-width: 100%;
  height: auto;
  border-radius: 0.375rem;
}

.campaign-page__overlap-conflicts {
  margin: 0.75rem 0;
}

.campaign-page__tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #eaeef2;
  border: 1px solid #57606a;
}

.campaign-page__tag--warning {
  background: #fff8c5;
  border-color: #9a6700;
}

.campaign-page__error {
  color: #cf222e;
  font-weight: 600;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
