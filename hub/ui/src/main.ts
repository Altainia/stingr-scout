import '../../../app/src/app.css';
import './hub.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { createApi } from './lib/api';

mount(App, { target: document.getElementById('app')!, props: { api: createApi() } });
