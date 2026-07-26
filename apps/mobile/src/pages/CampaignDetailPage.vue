<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { ApiRequestError } from '@ward-comms/api-client';
import type { CampaignDetailDto } from '@ward-comms/validation';
import { mobileAuthStore } from '../auth-store.js';

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; campaign: CampaignDetailDto };

const route = useRoute();
const router = useRouter();
const campaignId = route.params.id as string;
const pageState = ref<PageState>({ kind: 'loading' });
const actionError = ref<string | null>(null);
const approvalComment = ref('');

const permissions = computed(() =>
  mobileAuthStore.state.value.kind === 'authenticated' ? mobileAuthStore.state.value.user.permissions : [],
);

function canApprove(): boolean {
  return permissions.value.includes('campaigns.approve');
}

function canSend(): boolean {
  return permissions.value.includes('campaigns.send');
}

function canDraft(): boolean {
  return permissions.value.includes('campaigns.create');
}

async function load(): Promise<void> {
  pageState.value = { kind: 'loading' };
  try {
    const campaign = await mobileAuthStore.client.getCampaign(campaignId);
    pageState.value = { kind: 'loaded', campaign };
  } catch (error) {
    pageState.value = {
      kind: 'error',
      message: error instanceof ApiRequestError ? error.message : 'Unable to load campaign.',
    };
  }
}

async function withAction(action: () => Promise<CampaignDetailDto>): Promise<void> {
  actionError.value = null;
  try {
    const campaign = await action();
    pageState.value = { kind: 'loaded', campaign };
  } catch (error) {
    actionError.value = error instanceof ApiRequestError ? error.message : 'Action failed.';
  }
}

async function approve(): Promise<void> {
  await withAction(() => mobileAuthStore.client.approveCampaign(campaignId, approvalComment.value || undefined));
  approvalComment.value = '';
}

async function reject(): Promise<void> {
  await withAction(() => mobileAuthStore.client.rejectCampaign(campaignId, approvalComment.value || undefined));
  approvalComment.value = '';
}

async function revise(): Promise<void> {
  await withAction(() => mobileAuthStore.client.reviseCampaign(campaignId));
}

async function sendNow(): Promise<void> {
  await withAction(() => mobileAuthStore.client.sendCampaignNow(campaignId));
}

onMounted(() => {
  if (mobileAuthStore.state.value.kind !== 'authenticated') {
    void router.replace('/login');
    return;
  }
  void load();
});
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Campaign detail</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p><router-link to="/campaigns">Back to campaigns</router-link></p>
      <p v-if="pageState.kind === 'loading'">Loading…</p>
      <p v-else-if="pageState.kind === 'error'" role="alert">{{ pageState.message }}</p>
      <template v-else-if="pageState.kind === 'loaded'">
        <h1>{{ pageState.campaign.name }}</h1>
        <p>Status: <strong>{{ pageState.campaign.status }}</strong></p>
        <p v-if="actionError" role="alert" class="error">{{ actionError }}</p>

        <section aria-labelledby="content-heading">
          <h2 id="content-heading">Content</h2>
          <p>{{ pageState.campaign.currentVersion.baseMessage ?? 'No base message.' }}</p>
          <p>{{ pageState.campaign.currentVersion.audiences.length }} audience(s) selected.</p>
        </section>

        <section v-if="canApprove() && pageState.campaign.status === 'PendingApproval'" aria-labelledby="approval-heading">
          <h2 id="approval-heading">Approval</h2>
          <label for="approval-comment">Comment (optional)</label>
          <textarea id="approval-comment" v-model="approvalComment" rows="2"></textarea>
          <div class="actions">
            <button type="button" @click="approve">Approve</button>
            <button type="button" class="danger" @click="reject">Reject</button>
          </div>
        </section>

        <section v-if="canDraft() && pageState.campaign.status === 'Rejected'" aria-labelledby="revise-heading">
          <h2 id="revise-heading">Revise</h2>
          <button type="button" @click="revise">Reopen as draft</button>
        </section>

        <section
          v-if="canSend() && ['Approved', 'Scheduled'].includes(pageState.campaign.status)"
          aria-labelledby="send-heading"
        >
          <h2 id="send-heading">Send</h2>
          <button type="button" @click="sendNow">Send now</button>
        </section>

        <p class="consent-hint">
          Unsubscribe handled via ward ContactConsent; Church-wide email prefs are managed at
          <a href="https://account.churchofjesuschrist.org/subscriptions" rel="noopener noreferrer" target="_blank">
            Church Account subscriptions
          </a>.
        </p>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.error {
  color: #cf222e;
  font-weight: 600;
}

.danger {
  color: #cf222e;
}

.consent-hint {
  margin-top: 1.5rem;
  font-size: 0.875rem;
  color: #57606a;
}

textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #57606a;
  border-radius: 0.375rem;
  font-family: inherit;
}

button:focus-visible,
textarea:focus-visible,
a:focus-visible {
  outline: 2px solid #0969da;
  outline-offset: 2px;
}
</style>
