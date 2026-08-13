import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../ContextBridge';
import {
  Save, CheckCircle2, Trash2, Plus, Search, Layout, ChevronDown, ChevronUp,
  PenLine, X, PackageOpen, Eye, EyeOff, Coffee, Flame, Loader2, GripVertical
} from 'lucide-react';

// ════════════════════════════════════════════════════════════
// SCHEMA CONTRACT — Enforced before any Supabase write
// Matches iCaffeOS KDS JSONB layout exactly.
// ════════════════════════════════════════════════════════════
const MODIFIER_GROUP_SCHEMA = {
  id: 'string',       // UUID
  name: 'string',     // e.g. "סוג חלב"
  items: 'array',     // OptionValue[]
  logic: 'string',    // "A" (additive)
  requirement: 'string', // "M" (mandatory) | "O" (optional)
  maxSelection: 'number',
  minSelection: 'number',
};

const OPTION_VALUE_SCHEMA = {
  id: 'string',
  name: 'string',
  price: 'number',
  isDefault: 'boolean',
};

const CONFIG_SCHEMA = {
  config: {
    allows_decaf: 'boolean',
    allows_foam_mod: 'boolean',
    allows_shot_mod: 'boolean',
    allows_extra_hot: 'boolean',
    allows_water_base: 'boolean',
    allows_milk_on_side: 'boolean',
    allows_deconstructed: 'boolean',
    allows_plant_milk_mod: 'boolean',
    allows_water_ratio_mod: 'boolean',
  },
  orders: { allows_notes: 'boolean' },
  status: { is_in_stock: 'boolean' },
  loyalty: { accrues_points: 'boolean' },
};

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Validate a modifier group matches our KDS schema */
function validateModifierGroup(group) {
  if (!group || typeof group !== 'object') return false;
  if (typeof group.id !== 'string' || !group.id) return false;
  if (typeof group.name !== 'string' || !group.name) return false;
  if (!Array.isArray(group.items)) return false;
  for (const item of group.items) {
    if (typeof item.id !== 'string' || typeof item.name !== 'string') return false;
    if (typeof item.price !== 'number') return false;
  }
  return true;
}

/** Create a clean modifier group payload (strip any extraneous fields) */
function sanitizeModifierGroup(group) {
  return {
    id: String(group.id),
    name: String(group.name),
    items: (group.items || []).map(item => ({
      id: String(item.id),
      name: String(item.name),
      price: Number(item.price) || 0,
      isDefault: Boolean(item.isDefault),
    })),
    logic: group.logic || 'A',
    requirement: group.requirement || 'O',
    maxSelection: Number(group.maxSelection) || 1,
    minSelection: Number(group.minSelection) || 0,
  };
}

/** Check if modifiers is in array format (KDS groups) vs config object format */
function isGroupsFormat(modifiers) {
  return Array.isArray(modifiers);
}

/** Create default config object */
function createDefaultConfig() {
  return {
    config: {
      allows_decaf: false, allows_foam_mod: false, allows_shot_mod: false,
      allows_extra_hot: false, allows_water_base: false, allows_milk_on_side: false,
      allows_deconstructed: false, allows_plant_milk_mod: false, allows_water_ratio_mod: false,
    },
    orders: { allows_notes: true },
    status: { is_in_stock: true },
    loyalty: { accrues_points: false },
  };
}

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
export default function MenuManager({ session, context }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error'
  const [dirty, setDirty] = useState(false);
  const originalRef = useRef(null);

  const businessId = context?.businessId || '11111111-1111-1111-1111-111111111111';

  // ── Load items ──
  useEffect(() => {
    loadItems();
  }, [businessId]);

  const loadItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, english_name, price, category, description, image_url, production_area, kds_routing_logic, is_visible_pos, is_in_stock, modifiers, is_deleted, business_id, cost, sale_price, kds_station, display_kds')
      .eq('business_id', businessId)
      .is('is_deleted', false)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (!error && data) {
      setItems(data);
      const cats = [...new Set(data.map(i => i.category).filter(Boolean))].sort();
      setCategories(cats);
    }
    setLoading(false);
  };

  // ── Select item ──
  const selectItem = useCallback((item) => {
    setSelectedId(item.id);
    const cloned = JSON.parse(JSON.stringify(item));
    setDraft(cloned);
    originalRef.current = JSON.parse(JSON.stringify(item));
    setDirty(false);
    setSaveStatus(null);
  }, []);

  // ── Update draft field ──
  const updateDraft = useCallback((field, value) => {
    setDraft(prev => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      setDirty(true);
      return next;
    });
  }, []);

  // ── Determine if text content changed (for smart re-indexing) ──
  const didTextChange = useCallback(() => {
    if (!originalRef.current || !draft) return false;
    const orig = originalRef.current;
    return orig.name !== draft.name ||
           orig.description !== draft.description ||
           orig.english_name !== draft.english_name ||
           orig.category !== draft.category;
  }, [draft]);

  // ── SAVE (JSONB-only mutation) ──
  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveStatus(null);

    try {
      // Sanitize modifiers before write
      let sanitizedModifiers = draft.modifiers;
      if (isGroupsFormat(draft.modifiers)) {
        sanitizedModifiers = draft.modifiers.map(sanitizeModifierGroup);
        // Validate all groups
        for (const g of sanitizedModifiers) {
          if (!validateModifierGroup(g)) {
            throw new Error(`Invalid modifier group schema: ${g.name || 'unknown'}`);
          }
        }
      }

      const payload = {
        name: draft.name,
        english_name: draft.english_name || '',
        price: parseFloat(draft.price) || 0,
        category: draft.category || '',
        description: draft.description || '',
        image_url: draft.image_url || null,
        production_area: draft.production_area || 'Bar',
        kds_routing_logic: draft.kds_routing_logic || 'MADE_TO_ORDER',
        is_visible_pos: draft.is_visible_pos ?? true,
        is_in_stock: draft.is_in_stock ?? true,
        modifiers: sanitizedModifiers,
        cost: parseFloat(draft.cost) || 0,
        sale_price: draft.sale_price ? parseFloat(draft.sale_price) : null,
      };

      const isNew = typeof draft.id === 'string' && draft.id.startsWith('new_');

      let savedItem;
      if (isNew) {
        payload.business_id = businessId;
        const { data, error } = await supabase.from('menu_items').insert([payload]).select();
        if (error) throw error;
        savedItem = data[0];
      } else {
        const { data, error } = await supabase.from('menu_items').update(payload).eq('id', draft.id).select();
        if (error) throw error;
        savedItem = data[0];
      }

      // SMART RE-INDEX: Only trigger Zoe embedding when text tokens changed
      if (didTextChange()) {
        try {
          fetch('http://localhost:8070/v1/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `${savedItem.name} ${savedItem.category || ''} ${savedItem.description || ''}`,
              table: 'menu_items',
              id: savedItem.id
            })
          }).catch(() => {});
        } catch (e) { /* non-blocking */ }
      }

      // Update local state
      setItems(prev => {
        const idx = prev.findIndex(i => i.id === (isNew ? draft.id : savedItem.id));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = savedItem;
          return next;
        }
        return [...prev, savedItem];
      });

      if (isNew) {
        // Remove the temp item and select the real one
        setItems(prev => prev.filter(i => i.id !== draft.id).concat(savedItem));
      }

      selectItem(savedItem);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (e) {
      console.error('Save error:', e);
      setSaveStatus('error');
    }
    setSaving(false);
  };

  // ── Add new item ──
  const handleAddItem = () => {
    const newItem = {
      id: 'new_' + Date.now(),
      name: '',
      english_name: '',
      price: 0,
      category: activeCategory !== 'all' ? activeCategory : (categories[0] || ''),
      description: '',
      image_url: null,
      production_area: 'Bar',
      kds_routing_logic: 'MADE_TO_ORDER',
      is_visible_pos: true,
      is_in_stock: true,
      modifiers: createDefaultConfig(),
      business_id: businessId,
      cost: 0,
      sale_price: null,
    };
    setItems(prev => [newItem, ...prev]);
    selectItem(newItem);
  };

  // ── Delete item ──
  const handleDelete = async () => {
    if (!draft || !window.confirm(`למחוק את "${draft.name}"?`)) return;
    setSaving(true);
    const isNew = typeof draft.id === 'string' && draft.id.startsWith('new_');
    if (!isNew) {
      await supabase.from('menu_items').update({ is_deleted: true }).eq('id', draft.id);
    }
    setItems(prev => prev.filter(i => i.id !== draft.id));
    setDraft(null);
    setSelectedId(null);
    setSaving(false);
  };

  // ── Filter items ──
  const filteredItems = items.filter(item => {
    if (activeCategory !== 'all' && item.category !== activeCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (item.name || '').toLowerCase().includes(q) ||
             (item.english_name || '').toLowerCase().includes(q) ||
             (item.category || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Group by category
  const grouped = {};
  filteredItems.forEach(item => {
    const cat = item.category || 'ללא קטגוריה';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="spinning" style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="menu-manager">
      {/* ═══ RIGHT: Item List Panel ═══ */}
      <div className="menu-list-panel">
        <div className="menu-list-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layout size={20} color="var(--accent)" />
              תפריט <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>({items.length})</span>
            </div>
            <button onClick={handleAddItem} style={{
              background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '10px',
              padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}>
              <Plus size={14} /> חדש
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="menu-search-input"
              placeholder="חיפוש מנה..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingRight: '36px' }}
            />
          </div>

          <div className="menu-category-tabs">
            <button className={`menu-cat-tab ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => setActiveCategory('all')}>הכל</button>
            {categories.map(cat => (
              <button key={cat} className={`menu-cat-tab ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>{cat}</button>
            ))}
          </div>
        </div>

        <div className="menu-items-scroll">
          {Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              {activeCategory === 'all' && (
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', padding: '8px 12px 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {cat} ({catItems.length})
                </div>
              )}
              {catItems.map(item => (
                <div
                  key={item.id}
                  className={`menu-item-row ${selectedId === item.id ? 'selected' : ''}`}
                  onClick={() => selectItem(item)}
                >
                  <div className="menu-item-thumb">
                    {item.image_url ? <img src={item.image_url} alt="" /> : <Coffee size={18} style={{ opacity: 0.3 }} />}
                  </div>
                  <div className="menu-item-info">
                    <div className="menu-item-name">{item.name || 'ללא שם'}</div>
                    <div className="menu-item-meta">
                      {item.is_in_stock === false && <span className="menu-item-stock-badge out-of-stock">אזל</span>}
                      {item.production_area && <span>{item.production_area}</span>}
                    </div>
                  </div>
                  <div className="menu-item-price">{item.price}₪</div>
                </div>
              ))}
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {searchQuery ? `לא נמצאו תוצאות ל"${searchQuery}"` : 'אין פריטים'}
            </div>
          )}
        </div>
      </div>

      {/* ═══ LEFT: Edit Panel ═══ */}
      <div className="menu-edit-panel">
        {!draft ? (
          <div className="menu-edit-empty">
            <PenLine size={48} />
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>בחר מנה לעריכה</div>
            <div style={{ fontSize: '0.8rem' }}>או צור מנה חדשה</div>
          </div>
        ) : (
          <>
            <div className="menu-edit-scroll">
              {/* ── Section: Basic Info ── */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                {/* Image */}
                <div style={{ width: '110px', height: '110px', borderRadius: '16px', overflow: 'hidden', border: '2px solid var(--border)', background: 'var(--surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {draft.image_url ? (
                    <img src={draft.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Coffee size={32} style={{ opacity: 0.15 }} />
                  )}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div className="menu-field-group">
                    <label className="menu-field-label">שם המנה</label>
                    <input className="text-input-field" value={draft.name || ''} onChange={e => updateDraft('name', e.target.value)} placeholder="שם בעברית" style={{ width: '100%', margin: 0 }} />
                  </div>
                  <div className="menu-field-group">
                    <label className="menu-field-label">English Name</label>
                    <input className="text-input-field" value={draft.english_name || ''} onChange={e => updateDraft('english_name', e.target.value)} placeholder="English name" style={{ width: '100%', margin: 0 }} dir="ltr" />
                  </div>
                </div>
              </div>

              {/* ── Section: Price + Category ── */}
              <div className="menu-field-row">
                <div className="menu-field-group">
                  <label className="menu-field-label">מחיר (₪)</label>
                  <input type="number" className="text-input-field" value={draft.price || ''} onChange={e => updateDraft('price', e.target.value)} style={{ width: '100%', margin: 0, fontSize: '1.3rem', fontWeight: 800, textAlign: 'center' }} dir="ltr" />
                </div>
                <div className="menu-field-group">
                  <label className="menu-field-label">מחיר מבצע (₪)</label>
                  <input type="number" className="text-input-field" value={draft.sale_price || ''} onChange={e => updateDraft('sale_price', e.target.value || null)} placeholder="—" style={{ width: '100%', margin: 0, textAlign: 'center', color: draft.sale_price ? '#ef4444' : undefined }} dir="ltr" />
                </div>
                <div className="menu-field-group">
                  <label className="menu-field-label">עלות</label>
                  <input type="number" className="text-input-field" value={draft.cost || ''} onChange={e => updateDraft('cost', e.target.value)} placeholder="0" style={{ width: '100%', margin: 0, textAlign: 'center' }} dir="ltr" />
                </div>
              </div>

              <div className="menu-field-row">
                <div className="menu-field-group" style={{ flex: 1 }}>
                  <label className="menu-field-label">קטגוריה</label>
                  <select className="text-input-field" value={draft.category || ''} onChange={e => updateDraft('category', e.target.value)} style={{ width: '100%', margin: 0, height: '42px' }}>
                    <option value="">בחר...</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="menu-field-group" style={{ flex: 2 }}>
                  <label className="menu-field-label">תיאור</label>
                  <input className="text-input-field" value={draft.description || ''} onChange={e => updateDraft('description', e.target.value)} placeholder="תיאור קצר..." style={{ width: '100%', margin: 0 }} />
                </div>
              </div>

              {/* ── Section: Production ── */}
              <div className="menu-field-group">
                <label className="menu-field-label">אזור הכנה</label>
                <div className="menu-toggle-group">
                  {[{ id: 'Bar', label: 'בר' }, { id: 'Kitchen', label: 'מטבח' }, { id: 'Checker', label: "צ'קר" }].map(opt => (
                    <button key={opt.id} className={`menu-toggle-btn ${draft.production_area === opt.id ? 'active' : ''}`} onClick={() => updateDraft('production_area', opt.id)}>{opt.label}</button>
                  ))}
                </div>
              </div>

              <div className="menu-field-group">
                <label className="menu-field-label">מצב הכנה</label>
                <div className="menu-toggle-group">
                  {[{ id: 'MADE_TO_ORDER', label: 'דרוש הכנה' }, { id: 'GRAB_AND_GO', label: 'Grab & Go' }].map(opt => (
                    <button key={opt.id} className={`menu-toggle-btn ${draft.kds_routing_logic === opt.id ? 'active' : ''}`} onClick={() => updateDraft('kds_routing_logic', opt.id)}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* ── Section: Visibility Flags ── */}
              <div className="menu-field-group">
                <label className="menu-field-label">מצב</label>
                <div className="menu-config-grid">
                  <div className="menu-config-flag">
                    <span>במלאי</span>
                    <div className={`flag-toggle ${draft.is_in_stock !== false ? 'on' : ''}`} onClick={() => updateDraft('is_in_stock', !draft.is_in_stock)} />
                  </div>
                  <div className="menu-config-flag">
                    <span>גלוי בקופה</span>
                    <div className={`flag-toggle ${draft.is_visible_pos !== false ? 'on' : ''}`} onClick={() => updateDraft('is_visible_pos', !draft.is_visible_pos)} />
                  </div>
                </div>
              </div>

              {/* ── Section: MODIFIERS (JSONB) ── */}
              <ModifiersEditor
                modifiers={draft.modifiers}
                onChange={val => updateDraft('modifiers', val)}
              />
            </div>

            {/* ── Footer ── */}
            <div className="menu-save-footer">
              <button className="menu-save-btn danger" onClick={handleDelete} disabled={saving}>
                <Trash2 size={18} />
              </button>
              <button className="menu-save-btn primary" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? <Loader2 size={18} className="spinning" style={{ animation: 'spin 1s linear infinite' }} /> :
                  saveStatus === 'success' ? <CheckCircle2 size={18} /> : <Save size={18} />}
                {saving ? 'שומר...' : saveStatus === 'success' ? 'נשמר ✓' : 'שמור שינויים'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MODIFIERS EDITOR — JSONB-only mutations
// Handles both Array (groups) and Object (config) formats
// ════════════════════════════════════════════════════════════
function ModifiersEditor({ modifiers, onChange }) {
  const isGroups = isGroupsFormat(modifiers);
  const groups = isGroups ? modifiers : [];
  const config = !isGroups && modifiers && typeof modifiers === 'object' ? modifiers : null;

  const [expandedGroups, setExpandedGroups] = useState({});
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const toggleExpand = (gId) => setExpandedGroups(prev => ({ ...prev, [gId]: !prev[gId] }));

  // ── Group CRUD ──
  const addGroup = () => {
    if (!newGroupName.trim()) return;
    const newGroup = {
      id: generateUUID(),
      name: newGroupName.trim(),
      items: [],
      logic: 'A',
      requirement: 'O',
      maxSelection: 1,
      minSelection: 0,
    };
    const newGroups = [...groups, newGroup];
    onChange(newGroups);
    setNewGroupName('');
    setAddingGroup(false);
    setExpandedGroups(prev => ({ ...prev, [newGroup.id]: true }));
  };

  const removeGroup = (gId) => {
    onChange(groups.filter(g => g.id !== gId));
  };

  const updateGroup = (gId, field, value) => {
    onChange(groups.map(g => g.id === gId ? { ...g, [field]: value } : g));
  };

  // ── Option CRUD ──
  const addOption = (gId, optName, optPrice) => {
    onChange(groups.map(g => {
      if (g.id !== gId) return g;
      return {
        ...g,
        items: [...(g.items || []), {
          id: generateUUID(),
          name: optName,
          price: Number(optPrice) || 0,
          isDefault: false,
        }]
      };
    }));
  };

  const removeOption = (gId, optId) => {
    onChange(groups.map(g => {
      if (g.id !== gId) return g;
      return { ...g, items: g.items.filter(o => o.id !== optId) };
    }));
  };

  const updateOption = (gId, optId, field, value) => {
    onChange(groups.map(g => {
      if (g.id !== gId) return g;
      return {
        ...g,
        items: g.items.map(o => o.id === optId ? { ...o, [field]: value } : o)
      };
    }));
  };

  // ── Config flag update ──
  const updateConfigFlag = (section, key, value) => {
    if (!config) return;
    const updated = JSON.parse(JSON.stringify(config));
    if (!updated[section]) updated[section] = {};
    updated[section][key] = value;
    onChange(updated);
  };

  // Convert config to groups mode
  const switchToGroupsMode = () => {
    onChange([]);
  };

  return (
    <div className="menu-mod-section">
      <div className="menu-mod-header">
        <div style={{ fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <GripVertical size={16} color="var(--accent)" />
          תוספות ושינויים
          {isGroups && <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem' }}>({groups.length} קבוצות)</span>}
        </div>
        {isGroups && (
          <button onClick={() => setAddingGroup(true)} style={{
            background: 'rgba(16,163,127,0.1)', color: 'var(--accent)', border: 'none', borderRadius: '8px',
            padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '3px'
          }}>
            <Plus size={12} /> קבוצה
          </button>
        )}
      </div>

      {/* ── CONFIG MODE (object format) ── */}
      {config && !isGroups && (
        <div style={{ padding: '0.75rem 1rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>דגלי התנהגות (Config)</div>
          <div className="menu-config-grid">
            {config.config && Object.entries(config.config).map(([key, val]) => (
              <div key={key} className="menu-config-flag">
                <span style={{ fontSize: '0.72rem' }}>{key.replace('allows_', '').replace(/_/g, ' ')}</span>
                <div className={`flag-toggle ${val ? 'on' : ''}`} onClick={() => updateConfigFlag('config', key, !val)} />
              </div>
            ))}
            {config.orders && Object.entries(config.orders).map(([key, val]) => (
              <div key={key} className="menu-config-flag">
                <span style={{ fontSize: '0.72rem' }}>{key.replace('allows_', '').replace(/_/g, ' ')}</span>
                <div className={`flag-toggle ${val ? 'on' : ''}`} onClick={() => updateConfigFlag('orders', key, !val)} />
              </div>
            ))}
            {config.loyalty && Object.entries(config.loyalty).map(([key, val]) => (
              <div key={key} className="menu-config-flag">
                <span style={{ fontSize: '0.72rem' }}>{key.replace(/_/g, ' ')}</span>
                <div className={`flag-toggle ${val ? 'on' : ''}`} onClick={() => updateConfigFlag('loyalty', key, !val)} />
              </div>
            ))}
          </div>
          <button onClick={switchToGroupsMode} style={{
            marginTop: '12px', width: '100%', padding: '8px', borderRadius: '10px',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
          }}>
            + המר לקבוצות תוספות מפורטות
          </button>
        </div>
      )}

      {/* ── GROUPS MODE (array format) ── */}
      {isGroups && groups.map(group => (
        <div key={group.id} className="menu-mod-group">
          <div className="menu-mod-group-header">
            <div className="menu-mod-group-name" onClick={() => toggleExpand(group.id)} style={{ cursor: 'pointer' }}>
              {expandedGroups[group.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <input
                value={group.name}
                onChange={e => updateGroup(group.id, 'name', e.target.value)}
                style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', width: '120px', outline: 'none' }}
                onClick={e => e.stopPropagation()}
              />
              <span className={`menu-mod-badge ${group.requirement === 'M' ? 'required' : 'optional'}`}>
                {group.requirement === 'M' ? 'חובה' : 'רשות'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button onClick={() => updateGroup(group.id, 'requirement', group.requirement === 'M' ? 'O' : 'M')}
                style={{ background: 'none', border: 'none', fontSize: '0.65rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
                {group.requirement === 'M' ? 'הפוך לרשות' : 'הפוך לחובה'}
              </button>
              <button onClick={() => removeGroup(group.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {expandedGroups[group.id] && (
            <>
              <div className="menu-mod-options">
                {(group.items || []).map(opt => (
                  <div key={opt.id} className="menu-mod-chip">
                    <span>{opt.name}</span>
                    {opt.price > 0 && <span className="chip-price">+{opt.price}₪</span>}
                    <X size={12} className="chip-delete" onClick={() => removeOption(group.id, opt.id)} />
                  </div>
                ))}
              </div>
              <AddOptionRow onAdd={(name, price) => addOption(group.id, name, price)} />
            </>
          )}

          {!expandedGroups[group.id] && (group.items || []).length > 0 && (
            <div className="menu-mod-options">
              {group.items.slice(0, 5).map(opt => (
                <div key={opt.id} className="menu-mod-chip" style={{ opacity: 0.7, cursor: 'default' }}>
                  {opt.name} {opt.price > 0 && <span className="chip-price">+{opt.price}₪</span>}
                </div>
              ))}
              {group.items.length > 5 && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>+{group.items.length - 5} עוד</span>}
            </div>
          )}
        </div>
      ))}

      {/* ── Add Group Form ── */}
      {addingGroup && (
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
          <div className="menu-add-option-row">
            <input
              placeholder="שם הקבוצה (לדוגמה: סוג חלב)"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGroup()}
              autoFocus
            />
            <button className="menu-mini-btn" onClick={addGroup} style={{ background: 'var(--accent)', color: 'white' }}>הוסף</button>
            <button className="menu-mini-btn" onClick={() => { setAddingGroup(false); setNewGroupName(''); }} style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>ביטול</button>
          </div>
        </div>
      )}

      {isGroups && groups.length === 0 && !addingGroup && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          אין תוספות מוגדרות. לחץ "+ קבוצה" להוספה.
        </div>
      )}
    </div>
  );
}

// ── Inline add-option row ──
function AddOptionRow({ onAdd }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [visible, setVisible] = useState(false);

  if (!visible) {
    return (
      <button onClick={() => setVisible(true)} style={{
        marginTop: '6px', background: 'none', border: '1px dashed var(--border)',
        color: 'var(--text-muted)', padding: '4px 8px', borderRadius: '8px',
        fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600
      }}>
        + אפשרות
      </button>
    );
  }

  return (
    <div className="menu-add-option-row">
      <input placeholder="שם" value={name} onChange={e => setName(e.target.value)} autoFocus style={{ flex: 2 }} />
      <input type="number" placeholder="₪" value={price} onChange={e => setPrice(e.target.value)} style={{ flex: 0, width: '60px' }} dir="ltr" />
      <button className="menu-mini-btn" onClick={() => {
        if (name.trim()) {
          onAdd(name.trim(), price);
          setName('');
          setPrice('');
        }
      }} style={{ background: 'var(--accent)', color: 'white' }}>+</button>
      <button className="menu-mini-btn" onClick={() => { setVisible(false); setName(''); setPrice(''); }} style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>×</button>
    </div>
  );
}
