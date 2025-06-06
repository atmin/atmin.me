// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
    vite: {
        server: {
            allowedHosts: ['.ngrok-free.app'],
        },
        optimizeDeps: {
            exclude: ['@ffmpeg/ffmpeg'],
        },
    },
    site: 'https://atmin.me',
});
