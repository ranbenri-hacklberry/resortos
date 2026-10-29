import { toMicropayPhone } from '../src/lib/micropaySms.js';
import { unitAllowed, visibleOpsRows } from './opsAuthz.js';
import { readExpenses } from './expenses.js';
import { readPriorityDocs } from './priorityDocs.js';
import { verifyStaffCredentials } from './auth.js';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function dbKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || '';
}

async function rest(pathAndQuery) {
  const key = dbKey();
  if (!key) {
    const err = new Error('DB_NOT_CONFIGURED');
    err.status = 503;
    throw err;
  }
  const response = await fetch(`${supabaseUrl()}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = new Error(data?.message || 'DB_READ_FAILED');
    err.status = response.status || 502;
    throw err;
  }
  return data;
}

function tenant(user) {
  return encodeURIComponent(String(user.tenant_id || user.business_id || ''));
}

export async function loadCatalog(user) {
  const rows = await rest(
    `resort_units?select=id,name,sort_order,unit_type,max_occupancy,base_price_agorot,is_active,property_id&tenant_id=eq.${tenant(user)}&order=sort_order.asc&limit=2000`
  );
  return visibleOpsRows(user, Array.isArray(rows) ? rows : [], 'id');
}

export async function loadUnits(user) {
  const rows = await rest(
    `unit_operations?select=id,name,operational_status,operational_domain,custom_reason,assigned_staff,staff_occupancy,is_escalated,cleaning_started_at,updated_at&tenant_id=eq.${tenant(user)}&limit=2000`
  );
  return visibleOpsRows(user, Array.isArray(rows) ? rows : [], 'id');
}

const BOOKING_PAGE_SIZE = 1000;
const BOOKING_COLUMNS = 'id,unit_id,guest_name,check_in_date,check_out_date,adults_count,children_count,booking_status,payment_status,payment_mode,total_price_agorot,deposit_agorot,clearing_payments,channel_source,special_requests,deleted_at,cash_receipt_at,is_birthday,birthday_note,upsell_description,upsell_price';

export async function collectPages(fetchPage, { pageSize = BOOKING_PAGE_SIZE, maxRows = pageSize * 100 } = {}) {
  const rows = [];
  let offset = 0;
  while (rows.length < maxRows) {
    const page = await fetchPage(offset, pageSize);
    const list = Array.isArray(page) ? page : [];
    const room = maxRows - rows.length;
    rows.push(...list.slice(0, room));
    if (list.length < pageSize) return { rows, truncated: false };
    if (rows.length >= maxRows) return { rows, truncated: true };
    offset += list.length;
  }
  return { rows, truncated: true };
}

function dateParam(value) {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function bookingPath(user, query, offset) {
  const parts = [
    `select=${BOOKING_COLUMNS}`,
    `tenant_id=eq.${tenant(user)}`,
    'deleted_at=is.null',
    'order=check_in_date.desc,id.desc',
    `limit=${BOOKING_PAGE_SIZE}`,
    `offset=${offset}`
  ];
  if (query.from) parts.push(`check_in_date=gte.${query.from}`);
  if (query.to) parts.push(`check_in_date=lte.${query.to}`);
  if (query.unit_id) parts.push(`unit_id=eq.${encodeURIComponent(query.unit_id)}`);
  else if (query.unit_ids?.length) {
    parts.push(`unit_id=in.(${query.unit_ids.map((id) => encodeURIComponent(id)).join(',')})`);
  }
  return `hotelos_bookings?${parts.join('&')}`;
}

export async function loadBookings(user, query = {}) {
  const from = dateParam(query.from);
  const to = dateParam(query.to);
  const unitId = String(query.unit_id || '').trim();
  let unitIds = null;
  if (query.property_id) {
    const catalog = await loadCatalog(user);
    const ids = catalog.filter((row) => row.property_id === query.property_id).map((row) => row.id);
    if (unitId) {
      if (!ids.includes(unitId)) return { rows: [], truncated: false };
    } else {
      unitIds = ids;
      if (!unitIds.length) return { rows: [], truncated: false };
    }
  }
  const collected = await collectPages((offset) => rest(bookingPath(user, {
    from,
    to,
    unit_id: unitId,
    unit_ids: unitIds
  }, offset)));
  return {
    rows: collected.rows.filter((row) => unitAllowed(user, row.unit_id)),
    truncated: collected.truncated
  };
}

export async function loadWorkLog(user) {
  const rows = await rest(
    `resort_operations?select=id,unit_id,domain,reason,status,completed_at,completed_by_name&tenant_id=eq.${tenant(user)}&status=eq.DONE&completed_by=eq.${encodeURIComponent(user.id)}&order=completed_at.desc&limit=120`
  );
  return (Array.isArray(rows) ? rows : []).filter((row) => unitAllowed(user, row.unit_id));
}

export async function loadProcedures(user) {
  const rows = await rest(
    `sop_templates?select=id,domain,title,steps,updated_at&tenant_id=eq.${tenant(user)}&limit=50`
  );
  return Array.isArray(rows) ? rows : [];
}

export function loadDocuments() {
  return readPriorityDocs();
}

export function loadExpenses() {
  return readExpenses().map((row) => ({
    id: row.id,
    supplier: row.supplier,
    invoice_no: row.invoice_no,
    date: row.date,
    subtotal: row.subtotal,
    vat: row.vat,
    total: row.total,
    category: row.category,
    site: row.site,
    paid: row.paid
  }));
}

export async function loadBankOverview() {
  const { getFinanceOverview } = await import('./openFinance.js');
  return getFinanceOverview();
}

export async function loadBankTransactions(query) {
  const { getFinanceTransactions } = await import('./openFinance.js');
  return getFinanceTransactions(query);
}

export async function refreshBanks() {
  const { refreshFinanceConnections, getFinanceOverview } = await import('./openFinance.js');
  await refreshFinanceConnections();
  return getFinanceOverview();
}

export async function findManagerByPhone(phone) {
  const needle = toMicropayPhone(phone);
  if (!needle || needle === '0548076123') return null;
  const rows = await rest(
    'employees?select=id,username,name,role,is_active,phone,whatsapp_phone,business_id,allowed_units&role=in.(MANAGER,PRIORITY)&is_active=eq.true&limit=50'
  );
  const list = Array.isArray(rows) ? rows : [];
  const match = list.find((row) => toMicropayPhone(row.phone) === needle || toMicropayPhone(row.whatsapp_phone) === needle);
  const role = String(match?.role || '').toUpperCase();
  if (!match || (role !== 'MANAGER' && role !== 'PRIORITY')) return null;
  return {
    id: match.id,
    username: match.username,
    display_name: match.name || match.username,
    role,
    tenant_id: match.business_id,
    allowed_units: match.allowed_units || [],
    is_active: match.is_active !== false
  };
}

export async function loadGuestBookings(user, query = {}) {
  const parts = [
    'select=id,unit_id,guest_name,check_in_date,check_out_date,booking_status,checkout_token,special_requests,stay,payment_status,payment_mode,total_price_agorot,deposit_agorot,clearing_payments,deleted_at',
    `tenant_id=eq.${tenant(user)}`,
    'deleted_at=is.null',
    'order=check_in_date.desc,id.desc',
    'limit=1000'
  ];
  if (query.booking_id) parts.push(`id=eq.${encodeURIComponent(query.booking_id)}`);
  if (query.unit_id) parts.push(`unit_id=eq.${encodeURIComponent(query.unit_id)}`);
  if (query.on) {
    parts.push(`check_in_date=lte.${query.on}`);
    parts.push(`check_out_date=gt.${query.on}`);
  }
  if (query.from) parts.push(`check_in_date=gte.${query.from}`);
  if (query.to) parts.push(`check_in_date=lte.${query.to}`);
  const rows = await rest(`hotelos_bookings?${parts.join('&')}`);
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((row) => unitAllowed(user, row.unit_id));
}

export async function sendManagerOtp(phone, code) {
  const { sendMicropaySms } = await import('./micropaySms.js');
  await sendMicropaySms({
    phone,
    message: `קוד ResortOS: ${code}. תקף ל-5 דקות.`,
    skipBcc: true
  });
}

export async function loadStaff(id) {
  const rows = await rest(
    `employees?id=eq.${encodeURIComponent(id)}&select=id,role,is_active,allowed_units&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export function productionDeps() {
  return {
    verifyStaff: (username, password, req) => verifyStaffCredentials(username, password, req),
    loadCatalog,
    loadUnits,
    loadBookings,
    loadGuestBookings,
    loadWorkLog,
    loadProcedures,
    loadDocuments,
    loadExpenses,
    loadBankOverview,
    loadBankTransactions,
    refreshBanks,
    loadStaff,
    findManagerByPhone,
    sendManagerOtp
  };
}
