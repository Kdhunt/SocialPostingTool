import { createApp } from 'vue';
import { IonicVue } from '@ionic/vue';
import App from './App.vue';
import { createAppRouter } from './router.js';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

const app = createApp(App).use(IonicVue).use(createAppRouter());

void app.mount('#app');
