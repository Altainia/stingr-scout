import '../../../app/src/app.css';
import './hub.css';
import { applyTheme, loadTheme } from '@stingr/shared';
import { mount } from 'svelte';
import App from './App.svelte';
import { createApi } from './lib/api';

applyTheme(loadTheme()); // before the first paint, so the page never flashes the wrong colours

mount(App, { target: document.getElementById('app')!, props: { api: createApi() } });
