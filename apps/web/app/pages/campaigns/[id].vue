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
import {
  approvalDecisionLabel,
  campaignStatusLabel,
  channelLabel,
  overlapStrategyLabel,
} from '~/utils/display-labels';

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

const activeTab = ref('setup');

const CAMPAIGN_TABS = [
  { id: 'setup', label: 'Setup', description: 'Name your campaign and choose who should receive it.' },
  { id: 'content', label: 'Content', description: 'Write your message, add images, and configure channels.' },
  { id: 'review', label: 'Review', description: 'Preview recipients, resolve overlap, and validate readiness.' },
  { id: 'publish', label: 'Approve & send', description: 'Submit for approval, schedule, or send.' },
] as const;

const assetOptions = computed(() =>
  createdAssetIds.value.map((id) => ({
    id,
    label: `Registered image (${id.slice(0, 8)}…)`,
  })),
);

const breadcrumbs = computed(() => {
  if (pageState.value.kind !== 'loaded') {
    return [{ label: 'Campaigns', to: '/campaigns' }, { label: 'Campaign' }];
  }
  return [{ label: 'Campaigns', to: '/campaigns' }, { label: pageState.value.campaign.name }];
});

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
      const firstBatch = batches[0];
      if (firstBatch) {
        selectedBatch.value = await client.getDeliveryBatch(campaignId, firstBatch.id);
      }
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
  <LayoutPageContainer>
    <LayoutBreadcrumbs :items="breadcrumbs" />

    <UiLoadingState v-if="pageState.kind === 'loading'" />
    <UiAlertBanner v-else-if="pageState.kind === 'error'">{{ pageState.message }}</UiAlertBanner>

    <template v-else-if="pageState.kind === 'loaded'">
      <LayoutPageHeader :title="pageState.campaign.name">
        <template #actions>
          <span class="status-pill">{{ campaignStatusLabel(pageState.campaign.status) }}</span>
          <span v-if="!pageState.campaign.isActive" class="status-pill status-pill--muted">Archived</span>
        </template>
      </LayoutPageHeader>

      <UiAlertBanner v-if="actionError">{{ actionError }}</UiAlertBanner>

      <UiWorkflowTabs v-model="activeTab" :tabs="[...CAMPAIGN_TABS]">
        <template #setup>
          <section class="section">
            <h2 class="section__title">Campaign details</h2>
            <form class="form-stack" novalidate @submit.prevent="saveName">
              <UiFormField label="Campaign name" input-id="edit-name">
                <input id="edit-name" v-model="editName" class="form-control" type="text" required />
              </UiFormField>
              <UiAppButton type="submit">Save name</UiAppButton>
            </form>
          </section>

          <section class="section">
            <h2 class="section__title">Audiences ({{ pageState.campaign.currentVersion.audiences.length }})</h2>
            <p class="section__hint">Choose one or more audience groups. Destinations are added automatically from each group.</p>
            <ul class="item-list">
              <li v-for="audience in pageState.campaign.currentVersion.audiences" :key="audience.audienceGroupId" class="item-list__row">
                <div>
                  <strong>{{ audience.audienceGroupName }}</strong>
                  <p v-if="audience.overrideText" class="section__hint">Override: {{ audience.overrideText }}</p>
                </div>
                <UiAppButton variant="ghost" type="button" :disabled="!isEditable" @click="removeAudience(audience.audienceGroupId)">
                  Remove
                </UiAppButton>
              </li>
              <li v-if="pageState.campaign.currentVersion.audiences.length === 0" class="section__hint">No audiences selected yet.</li>
            </ul>
            <form class="form-stack" novalidate @submit.prevent="addAudience">
              <UiFormField label="Add audience" input-id="audience-select">
                <select id="audience-select" v-model="newAudienceGroupId" class="form-control" required :disabled="!isEditable">
                  <option value="" disabled>Choose an audience</option>
                  <option v-for="audience in availableAudiences" :key="audience.id" :value="audience.id">{{ audience.name }}</option>
                </select>
              </UiFormField>
              <UiFormField label="Override message for this audience (optional)" input-id="audience-override-text">
                <textarea id="audience-override-text" v-model="newAudienceOverrideText" class="form-control" rows="2" :disabled="!isEditable" />
              </UiFormField>
              <UiFormField v-if="assetOptions.length > 0" label="Override image (optional)" input-id="audience-override-image">
                <select id="audience-override-image" v-model="newAudienceOverrideImageAssetId" class="form-control" :disabled="!isEditable">
                  <option value="">None</option>
                  <option v-for="asset in assetOptions" :key="asset.id" :value="asset.id">{{ asset.label }}</option>
                </select>
              </UiFormField>
              <UiAppButton type="submit" :disabled="!isEditable">Add audience</UiAppButton>
            </form>
          </section>

          <section class="section">
            <h2 class="section__title">Destinations</h2>
            <ul class="item-list">
              <li v-for="destination in pageState.campaign.currentVersion.destinations" :key="destination.destinationId" class="item-list__row">
                {{ destination.name }} ({{ channelLabel(destination.channel) }})
                <span v-if="!destination.isActive" class="status-pill status-pill--muted">Archived</span>
              </li>
              <li v-if="pageState.campaign.currentVersion.destinations.length === 0" class="section__hint">Add audiences with linked destinations to see them here.</li>
            </ul>
          </section>
        </template>

        <template #content>
          <p v-if="!isEditable" class="section__hint">Content can only be edited while the campaign is a draft.</p>

          <section class="section">
            <h2 class="section__title">Base message (version {{ pageState.campaign.currentVersion.versionNumber }})</h2>
            <form class="form-stack" novalidate @submit.prevent="saveContent">
              <UiFormField label="Message" input-id="base-message">
                <textarea id="base-message" v-model="editBaseMessage" class="form-control" rows="5" :disabled="!isEditable" />
              </UiFormField>
              <UiFormField v-if="assetOptions.length > 0" label="Base image (optional)" input-id="base-image-asset-id">
                <select id="base-image-asset-id" v-model="editBaseImageAssetId" class="form-control" :disabled="!isEditable">
                  <option value="">None</option>
                  <option v-for="asset in assetOptions" :key="asset.id" :value="asset.id">{{ asset.label }}</option>
                </select>
              </UiFormField>
              <UiAppButton type="submit" :disabled="!isEditable">Save content</UiAppButton>
            </form>
          </section>

          <section class="section">
            <h2 class="section__title">Channel-specific text</h2>
            <p class="section__hint">Optional overrides per channel. Empty fields fall back to the base message.</p>
            <div v-for="channel in CHANNELS" :key="channel" class="channel-block">
              <UiFormField :label="channelLabel(channel)" :input-id="`channel-${channel}`">
                <textarea :id="`channel-${channel}`" v-model="channelDrafts[channel]" class="form-control" rows="3" :disabled="!isEditable" />
              </UiFormField>
              <div class="button-row">
                <UiAppButton variant="secondary" type="button" :disabled="!isEditable" @click="saveChannelText(channel)">Save</UiAppButton>
                <UiAppButton variant="ghost" type="button" :disabled="!isEditable" @click="removeChannelText(channel)">Clear</UiAppButton>
              </div>
            </div>
          </section>

          <section class="section">
            <h2 class="section__title">Overlap resolution</h2>
            <p class="section__hint">When someone is in multiple audiences, choose which message they receive.</p>
            <form class="form-stack" novalidate @submit.prevent="saveOverlapResolution">
              <UiFormField label="Strategy" input-id="overlap-strategy">
                <select id="overlap-strategy" v-model="overlapStrategy" class="form-control" :disabled="!isEditable">
                  <option value="FirstAudienceWins">{{ overlapStrategyLabel('FirstAudienceWins') }}</option>
                  <option value="PreferBase">{{ overlapStrategyLabel('PreferBase') }}</option>
                  <option value="PreferSpecificAudience">{{ overlapStrategyLabel('PreferSpecificAudience') }}</option>
                </select>
              </UiFormField>
              <UiFormField v-if="overlapStrategy === 'PreferSpecificAudience'" label="Preferred audience" input-id="prefer-audience">
                <select id="prefer-audience" v-model="preferAudienceGroupId" class="form-control" :disabled="!isEditable">
                  <option value="" disabled>Choose audience</option>
                  <option v-for="audience in pageState.campaign.currentVersion.audiences" :key="audience.audienceGroupId" :value="audience.audienceGroupId">
                    {{ audience.audienceGroupName }}
                  </option>
                </select>
              </UiFormField>
              <UiAppButton type="submit" :disabled="!isEditable">Save strategy</UiAppButton>
            </form>
          </section>

          <details class="section section--fold">
            <summary class="section__title">Images &amp; assets</summary>
            <form class="form-stack" novalidate @submit.prevent="createAsset">
              <UiFormField label="Image URL or storage reference" input-id="asset-storage-reference">
                <input id="asset-storage-reference" v-model="assetStorageReference" class="form-control" type="text" required :disabled="!isEditable" />
              </UiFormField>
              <UiFormField label="Alt text" input-id="asset-alt-text">
                <input id="asset-alt-text" v-model="assetAltText" class="form-control" type="text" required :disabled="!isEditable" />
              </UiFormField>
              <UiAppButton type="submit" :disabled="!isEditable">Register image</UiAppButton>
            </form>
            <details class="section--fold">
              <summary>Generate image with AI</summary>
              <form class="form-stack" novalidate @submit.prevent="generateAiImage">
                <UiFormField label="Prompt" input-id="ai-prompt">
                  <textarea id="ai-prompt" v-model="aiPrompt" class="form-control" rows="2" required :disabled="!isEditable" />
                </UiFormField>
                <UiFormField label="Alt text" input-id="ai-alt-text">
                  <input id="ai-alt-text" v-model="aiAltText" class="form-control" type="text" required :disabled="!isEditable" />
                </UiFormField>
                <UiAppButton type="submit" :disabled="!isEditable">Generate draft</UiAppButton>
              </form>
              <div v-if="pendingAsset" class="ai-preview">
                <p><strong>Pending draft:</strong> {{ pendingAsset.confirmationStatus }}</p>
                <img v-if="pendingAsset.storageReference.startsWith('http')" :src="pendingAsset.storageReference" :alt="pendingAsset.altText" class="ai-preview__image" />
                <div class="button-row">
                  <UiAppButton type="button" :disabled="!isEditable" @click="confirmPendingAsset">Confirm</UiAppButton>
                  <UiAppButton variant="danger" type="button" :disabled="!isEditable" @click="rejectPendingAsset">Discard</UiAppButton>
                </div>
              </div>
            </details>
          </details>
        </template>

        <template #review>
          <section class="section">
            <h2 class="section__title">Recipient preview</h2>
            <UiAppButton type="button" @click="runPreview">Load preview</UiAppButton>
            <UiLoadingState v-if="previewState.kind === 'loading'" />
            <UiAlertBanner v-else-if="previewState.kind === 'error'">{{ previewState.message }}</UiAlertBanner>
            <template v-else-if="previewState.kind === 'loaded'">
              <p class="section__hint">
                {{ previewState.preview.totalUniqueRecipients }} unique recipient(s),
                {{ previewState.preview.overlapCount }} overlapping.
                <span v-if="previewState.preview.overlapResolutionStrategy">
                  Strategy: {{ overlapStrategyLabel(previewState.preview.overlapResolutionStrategy) }}
                </span>
              </p>
              <div v-for="audience in previewState.preview.audiences" :key="audience.audienceGroupId" class="preview-block">
                <h3>{{ audience.audienceGroupName }} — {{ audience.recipientCount }} recipient(s)</h3>
                <ul class="item-list">
                  <li v-for="channel in audience.channels" :key="channel.channel" class="item-list__row">
                    <strong>{{ channelLabel(channel.channel) }}:</strong>
                    <span v-if="channel.text">{{ channel.text }}</span>
                    <span v-else class="section__hint">No text for this channel.</span>
                    <span v-if="channel.exceedsLimit" class="status-pill status-pill--warning">Exceeds limit</span>
                  </li>
                </ul>
              </div>
            </template>
          </section>

          <section class="section">
            <h2 class="section__title">Readiness check</h2>
            <UiAppButton type="button" @click="runValidation">Check readiness</UiAppButton>
            <UiLoadingState v-if="validationState.kind === 'loading'" />
            <UiAlertBanner v-else-if="validationState.kind === 'error'">{{ validationState.message }}</UiAlertBanner>
            <UiAlertBanner v-else-if="validationState.kind === 'loaded' && validationState.result.valid" tone="success">
              Ready to submit for approval.
            </UiAlertBanner>
            <ul v-else-if="validationState.kind === 'loaded'" class="item-list">
              <li v-for="(err, index) in validationState.result.errors" :key="index">
                <UiAlertBanner>{{ err }}</UiAlertBanner>
              </li>
            </ul>
          </section>
        </template>

        <template #publish>
          <section class="section section--highlight">
            <h2 class="section__title">Workflow actions</h2>
            <div class="button-row">
              <UiAppButton v-if="canDraft() && pageState.campaign.status === 'Draft'" type="button" @click="submitForApproval">
                Submit for approval
              </UiAppButton>
              <UiAppButton v-if="canDraft() && pageState.campaign.status === 'Rejected'" type="button" @click="revise">
                Reopen as draft
              </UiAppButton>
              <UiAppButton v-if="canSend() && ['Approved', 'Scheduled'].includes(pageState.campaign.status)" type="button" @click="sendNowAndRefresh">
                Send now
              </UiAppButton>
              <UiAppButton
                v-if="(canDraft() || canApprove() || canSend()) && !['Sent', 'Cancelled'].includes(pageState.campaign.status)"
                variant="danger"
                type="button"
                @click="cancel"
              >
                Cancel campaign
              </UiAppButton>
              <UiAppButton v-if="canDraft() && pageState.campaign.status !== 'Sending'" variant="secondary" type="button" @click="archiveCampaign">
                Archive
              </UiAppButton>
            </div>
          </section>

          <section v-if="canApprove() && pageState.campaign.status === 'PendingApproval'" class="section">
            <h2 class="section__title">Approval decision</h2>
            <form class="form-stack" @submit.prevent="approve">
              <UiFormField label="Comment (optional)" input-id="approval-comment">
                <textarea id="approval-comment" v-model="approvalComment" class="form-control" rows="2" />
              </UiFormField>
              <div class="button-row">
                <UiAppButton type="button" @click="approve">Approve</UiAppButton>
                <UiAppButton variant="danger" type="button" @click="reject">Reject</UiAppButton>
              </div>
            </form>
          </section>

          <section v-if="canSend() && pageState.campaign.status === 'Approved'" class="section">
            <h2 class="section__title">Schedule</h2>
            <form class="form-stack" @submit.prevent="schedule">
              <UiFormField label="Send at" input-id="schedule-at">
                <input id="schedule-at" v-model="scheduleAt" class="form-control" type="datetime-local" />
              </UiFormField>
              <UiAppButton type="submit">Schedule send</UiAppButton>
            </form>
          </section>

          <section v-if="canSend()" class="section">
            <h2 class="section__title">Delivery results</h2>
            <UiLoadingState v-if="deliveryLoading" />
            <UiAlertBanner v-else-if="deliveryError">{{ deliveryError }}</UiAlertBanner>
            <template v-else-if="deliveryBatches.length > 0">
              <ul class="item-list">
                <li v-for="batch in deliveryBatches" :key="batch.id">
                  <UiAppButton variant="ghost" type="button" @click="viewBatch(batch.id)">
                    Batch {{ batch.id.slice(0, 8) }}… — {{ batch.status }} ({{ batch.sentCount }}/{{ batch.totalRecipients }} sent)
                  </UiAppButton>
                </li>
              </ul>
            </template>
            <p v-else class="section__hint">No delivery batches yet.</p>
          </section>

          <section class="section">
            <h2 class="section__title">History</h2>
            <ul class="item-list">
              <li v-for="approval in pageState.campaign.approvals" :key="approval.id" class="item-list__row">
                {{ approvalDecisionLabel(approval.decision) }} · {{ approval.decidedAt }}
                <span v-if="approval.comment" class="section__hint">— {{ approval.comment }}</span>
              </li>
              <li v-for="scheduleItem in pageState.campaign.schedules" :key="scheduleItem.id" class="item-list__row">
                Scheduled for {{ scheduleItem.scheduledFor }}
                <span v-if="scheduleItem.cancelledAt" class="status-pill status-pill--muted">Cancelled</span>
              </li>
              <li v-if="pageState.campaign.approvals.length === 0 && pageState.campaign.schedules.length === 0" class="section__hint">No history yet.</li>
            </ul>
          </section>
        </template>
      </UiWorkflowTabs>
    </template>
  </LayoutPageContainer>
</template>

<style scoped>
.status-pill {
  font-size: 0.8125rem;
  font-weight: 700;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: var(--color-brand-soft);
  color: var(--color-brand);
  border: 1px solid rgb(30 77 140 / 0.2);
}

.status-pill--muted {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  border-color: var(--color-border);
}

.status-pill--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
  border-color: rgb(154 103 0 / 0.3);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.section--highlight {
  padding: var(--space-4);
  background: var(--color-surface-muted);
  border-radius: var(--radius-md);
}

.section--fold {
  padding: var(--space-3);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
}

.section__title {
  font-size: 1.0625rem;
  font-weight: 700;
}

.section__hint {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 32rem;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.item-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  flex-wrap: wrap;
}

.channel-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 32rem;
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.preview-block {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.ai-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.ai-preview__image {
  max-width: 100%;
  border-radius: var(--radius-md);
}
</style>
