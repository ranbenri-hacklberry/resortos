const path = require('path');

const paymentsMode = process.env.PAYMENTS_MODE || 'mock';
const apiBase = process.env.API_BASE || 'https://resortos.app';
const dashboardUrl = process.env.DASHBOARD_URL || 'https://resortos.app/dashboard';

module.exports = {
  expo: {
    name: 'ResortOS',
    slug: 'resortos',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    scheme: 'resortos',
    backgroundColor: '#FAF8F3',
    android: {
      package: 'il.resortos.app',
      backgroundColor: '#FAF8F3',
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'resortos.app',
              pathPrefix: '/app/charge'
            }
          ],
          category: ['BROWSABLE', 'DEFAULT']
        }
      ]
    },
    ios: {
      bundleIdentifier: 'il.resortos.app',
      supportsTablet: false,
      associatedDomains: ['applinks:resortos.app'],
      infoPlist: {
        CFBundleDevelopmentRegion: 'he',
        CFBundleAllowMixedLocalizations: true
      }
    },
    plugins: ['./plugins/withCardcomTap', 'expo-asset'],
    extra: {
      paymentsMode,
      apiBase,
      dashboardUrl
    }
  }
};
