import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fatihbastan.toneflow',
  appName: 'ToneFlow',
  webDir: 'out',
  server: {
    // In production, point to your Vercel deployment URL
    // url: 'https://your-toneflow.vercel.app',
    // cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
