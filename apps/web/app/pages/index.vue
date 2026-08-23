<script setup lang="ts">
definePageMeta({ layout: 'authenticated' });

import type { CampaignSummaryDto } from '@ward-comms/validation';
import { campaignStatusLabel } from '~/utils/display-labels';

const { state: authState, refreshSession } = useAuth();
const { hasPermission } = useAppNavigation();
const client = useApiClient();

const pendingApprovals = ref<CampaignSummaryDto[]>([]);
const recentCampaigns = ref<CampaignSummaryDto[]>([]);
const loadingActivity = ref(true);

async function loadActivity(): Promise<void> {
  loadingActivity.value = true;
  try {
    const recent = await client.searchCampaigns({});
    recentCampaigns.value = recent.campaigns.slice(0, 5);
    if (hasPermission('campaigns.approve')) {
      const pending = await client.searchCampaigns({ status: 'PendingApproval' });
      pendingApprovals.value = pending.campaigns;
    }
  } catch {
    pendingApprovals.value = [];
    recentCampaigns.value = [];
  } finally {
    loadingActivity.value = false;
  }
}

onMounted(async () => {
  await refreshSession();
  if (authState.value.kind === 'anonymous') {
    await navigateTo('/login');
    return;
  }
  await loadActivity();
});

const greeting = computed(() => {
  if (authState.value.kind !== 'authenticated') {
    return 'Welcome';
  }
  return `Welcome, ${authState.value.user.displayName}`;
});
</script>

<template>
  <LayoutPageContainer>
    <LayoutPageHeader
      :title="greeting"
      description="Plan campaigns, manage audiences, and keep your ward directory up to date — all in one place."
    />

    <section class="dashboard__grid" aria-label="Quick actions">
      <UiQuickActionCard title="Directory" to="/directory" description="Look up members, households, contact methods, and consent." />
      <UiQuickActionCard title="Campaigns" to="/campaigns" description="Draft messages, preview overlap, request approval, and schedule sends." />
      <UiQuickActionCard title="Audiences" to="/audiences" description="Build groups from members or rules and attach delivery destinations." />
      <UiQuickActionCard
        v-if="hasPermission('campaigns.create')"
        title="New campaign"
        to="/campaigns/new"
        description="Start a fresh campaign with audiences and channel-specific content."
      />
    </section>

    <section v-if="hasPermission('campaigns.approve') && pendingApprovals.length > 0" class="card dashboard__panel" aria-label="Pending approvals">
      <div class="dashboard__panel-header">
        <h2 class="dashboard__panel-title">Waiting for your approval</h2>
        <UiAppButton variant="ghost" to="/campaigns">View all</UiAppButton>
      </div>
      <ul class="dashboard__list">
        <li v-for="campaign in pendingApprovals" :key="campaign.id">
          <NuxtLink :to="`/campaigns/${campaign.id}`" class="dashboard__link">{{ campaign.name }}</NuxtLink>
          <span class="dashboard__meta">{{ campaignStatusLabel(campaign.status) }}</span>
        </li>
      </ul>
    </section>

    <section class="card dashboard__panel" aria-label="Recent campaigns">
      <div class="dashboard__panel-header">
        <h2 class="dashboard__panel-title">Recent campaigns</h2>
        <UiAppButton variant="ghost" to="/campaigns">View all</UiAppButton>
      </div>
      <UiLoadingState v-if="loadingActivity" message="Loading activity…" />
      <UiEmptyState v-else-if="recentCampaigns.length === 0" title="No campaigns yet" description="Create your first campaign to send a ward announcement." />
      <ul v-else class="dashboard__list">
        <li v-for="campaign in recentCampaigns" :key="campaign.id">
          <NuxtLink :to="`/campaigns/${campaign.id}`" class="dashboard__link">{{ campaign.name }}</NuxtLink>
          <span class="dashboard__meta">{{ campaignStatusLabel(campaign.status) }}</span>
        </li>
      </ul>
    </section>
  </LayoutPageContainer>
</template>

<style scoped>
.dashboard__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: var(--space-4);
}

.dashboard__panel {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.dashboard__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.dashboard__panel-title {
  font-size: 1rem;
  font-weight: 700;
}

.dashboard__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.dashboard__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.dashboard__link {
  font-weight: 600;
  color: var(--color-text);
  text-decoration: none;
}

.dashboard__link:hover {
  color: var(--color-brand);
}

.dashboard__meta {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  font-weight: 600;
}
</style>
