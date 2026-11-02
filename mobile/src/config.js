import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};

export const API_BASE = String(extra.apiBase || 'https://resortos.app').replace(/\/$/, '');
export const DASHBOARD_URL = String(extra.dashboardUrl || `${API_BASE}${extra.dashboardPath || '/dashboard'}`);

export const colors = {
  bg: '#FAF8F3',
  ink: '#26130F',
  gold: '#C5A059',
  card: '#FFFFFF',
  line: '#E7E0D4',
  danger: '#9F1239',
  ok: '#166534',
  muted: '#6B6258'
};
