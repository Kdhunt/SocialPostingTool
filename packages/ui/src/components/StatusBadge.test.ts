import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusBadge from './StatusBadge.vue';

describe('StatusBadge', () => {
  it('renders the label and an icon alongside color, not relying on color alone', () => {
    const wrapper = mount(StatusBadge, {
      props: { tone: 'success', label: 'Healthy' },
    });

    expect(wrapper.text()).toContain('Healthy');
    expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(true);
    expect(wrapper.attributes('role')).toBe('status');
  });
});
