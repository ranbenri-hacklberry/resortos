import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../ContextBridge';
import { Save, CheckCircle2, PackageOpen, Trash2, Calendar, Clock, User, Users, Info, Plus, ChevronRight, Layout, Edit3, Image as ImageIcon, PenLine, ChevronDown, ChevronUp, ListFilter, Edit2, Loader2, LayoutTemplate, SendToBack, PlusCircle, Sparkles, GripVertical, X as XIcon, Coffee } from 'lucide-react';
import { db } from '../db';
import { brain } from '../lib/CoreAssistant';

// ─── JSONB Modifier Schema Helpers (KDS-compatible) ───

function _sanitizeModGroup(g) {
    return {
        id: String(g.id), name: String(g.name),
        items: (g.items || []).map(o => ({ id: String(o.id), name: String(o.name), price: Number(o.price) || 0, isDefault: Boolean(o.isDefault) })),
        logic: g.logic || 'A', requirement: g.requirement || 'O',
        maxSelection: Number(g.maxSelection) || 1, minSelection: Number(g.minSelection) || 0,
    };
}
function _validateModGroup(g) {
    if (!g || typeof g.id !== 'string' || typeof g.name !== 'string' || !Array.isArray(g.items)) return false;
    return g.items.every(o => typeof o.id === 'string' && typeof o.name === 'string' && typeof o.price === 'number');
}
function _getModTextFingerprint(mods) {
    if (!Array.isArray(mods)) return '';
    return mods.map(g => `${g.name}|${(g.items||[]).map(o => o.name).join(',')}`).join('||');
}
function _classifyModGroups(groups) {
    if (!Array.isArray(groups) || groups.length === 0) return { hero: null, columns: [], other: [] };
    const norm = s => (s || '').toLowerCase();
    const usedIds = new Set();
    // Guard: ensure all groups have ids to prevent undefined matching
    groups.forEach(g => { if (!g.id) g.id = crypto.randomUUID(); });
    const hero = groups.find(g => {
        const n = norm(g.name);
        return n.includes('חלב') || n.includes('milk') || n.includes('תחליף') ||
            (g.items || []).some(v => ['סויה','שיבולת','שקדים'].some(k => norm(v.name).includes(k)));
    });
    if (hero) usedIds.add(hero.id);
    const findCol = (kws) => { const f = groups.find(g => !usedIds.has(g.id) && kws.some(k => norm(g.name).includes(k))); if (f) usedIds.add(f.id); return f; };
    const columns = [findCol(['קצף','foam']), findCol(['טמפרטורה','חום','temp']), findCol(['בסיס','base']), findCol(['חוזק','strength'])].filter(Boolean);
    const other = groups.filter(g => !usedIds.has(g.id));
    return { hero, columns, other };
}

const ActionCard = forwardRef(function ActionCard({ type, data, context, onContextUpdate, isCompact }, ref) {
    const [loading, setLoading] = useState(false);
    const successTimerRef = useRef(null);
    useEffect(() => () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); }, []);
    const [imageLoading, setImageLoading] = useState(false);
    const [genProgress, setGenProgress] = useState(0);
    const [success, setSuccess] = useState(false);
    const [savedData, setSavedData] = useState(null);
    const [generatedImage, setGeneratedImage] = useState(null);
    const [dbError, setDbError] = useState(null);
    const [dbCategories, setDbCategories] = useState([]);
    const [isNewCategory, setIsNewCategory] = useState(false);
    const [formTab, setFormTab] = useState('pos'); // 'pos' | 'info'
    const [imageServerOnline, setImageServerOnline] = useState(null);
    const [isMutating, setIsMutating] = useState(false);
    const [attendanceStatus, setAttendanceStatus] = useState(null);
    const [attendanceResult, setAttendanceResult] = useState(null);

    // ── Dual State: frozen snapshot + working copy ──
    const [initialDbState, setInitialDbState] = useState(() => structuredClone(data || {}));
    const [draftState, setDraftState] = useState(() => structuredClone(data || {}));
    // C8: Sync draftState when data prop changes (e.g., parent re-renders with new data)
    const dataFingerprintRef = useRef(JSON.stringify(data));
    useEffect(() => {
        const newFingerprint = JSON.stringify(data);
        if (newFingerprint !== dataFingerprintRef.current) {
            dataFingerprintRef.current = newFingerprint;
            setInitialDbState(structuredClone(data || {}));
            setDraftState(structuredClone(data || {}));
        }
    }, [data]);
    // M7: isDirty via JSON comparison — works but could be optimized with deep-equal or hash if perf becomes an issue
    const isDirty = JSON.stringify(initialDbState) !== JSON.stringify(draftState);

    // ── Imperative API for Chat.jsx to call ──
    const draftRef = useRef(draftState);
    draftRef.current = draftState;
    useImperativeHandle(ref, () => ({
        applyPatches(patches) {

            setDraftState(prev => {
                let next = structuredClone(prev);
                let mods = Array.isArray(next.modifiers) ? next.modifiers
                    : (next.modifiers?.groups ? next.modifiers.groups : []);
                for (const p of patches) {
                    const grp = mods.find(g => g.name === p.group);
                    if (!grp && p.group && p.op !== 'ADD_GROUP' && p.op !== 'UPDATE_FIELD') {
                        console.warn(`⚠️ Patch group "${p.group}" not found in modifiers. Available: ${mods.map(g => g.name).join(', ')}`);
                    }
                    switch (p.op) {
                        case 'UPDATE_OPTION_PRICE': {
                            const opt = grp?.items?.find(o => o.name === p.option);
                            if (opt) opt.price = Number(p.value);
                            break;
                        }
                        case 'UPDATE_OPTION_NAME': {
                            const opt = grp?.items?.find(o => o.name === p.option);
                            if (opt) opt.name = p.value;
                            break;
                        }
                        case 'ADD_OPTION': {
                            if (grp) grp.items.push({ id: crypto.randomUUID(), name: p.name, price: Number(p.price || 0), isDefault: false });
                            break;
                        }
                        case 'REMOVE_OPTION': {
                            if (grp) grp.items = grp.items.filter(o => o.name !== p.option);
                            break;
                        }
                        case 'ADD_GROUP': {
                            const groupName = p.name || p.group;
                            if (groupName) mods.push({ id: crypto.randomUUID(), name: groupName, items: [], logic: p.logic || 'A', requirement: p.requirement || 'O', maxSelection: 1, minSelection: 0 });
                            break;
                        }
                        case 'REMOVE_GROUP': {
                            mods = mods.filter(g => g.name !== p.group);
                            break;
                        }
                        case 'SET_DEFAULT': {
                            if (grp) grp.items.forEach(o => { o.isDefault = (o.name === p.option); });
                            break;
                        }
                        case 'UPDATE_FIELD': {
                            next[p.field] = p.value;
                            break;
                        }
                    }
                }
                next.modifiers = Array.isArray(next.modifiers) ? mods : { ...next.modifiers, groups: mods };

                return next;
            });
        },
        setMutating(v) { setIsMutating(v); },
        getDraftState() { return draftRef.current; }
    }), []);

    useEffect(() => {
        const init = async () => {
            // Check Image Server
            try {
                const res = await fetch('http://100.127.14.15:5001/progress', { signal: AbortSignal.timeout(3000) });
                setImageServerOnline(res.ok);
            } catch (e) { setImageServerOnline(false); }

            // Load Categories
            const bid = context?.businessId || '11111111-1111-1111-1111-111111111111';
            const { data: cats } = await supabase
                .from('item_category')
                .select('name_he, id')
                .eq('business_id', bid)
                .is('is_deleted', false)
                .order('name_he');
            if (cats) setDbCategories(cats);
        };
        init();
    }, [context?.businessId]);
    const [internalSelection, setInternalSelection] = useState(null);
    const [isExpanded, setIsExpanded] = useState(true);

    // Normalize intent: AI sends 'create_product', UI expects 'product'
    const normalizedType = type === 'create_product' ? 'product' : type;

    // Context switching logic: If a list item is clicked, target that item immediately
    const activeType = internalSelection ? (internalSelection.price ? 'product' : (internalSelection.current_stock !== undefined ? 'inventory' : 'task')) : normalizedType;
    const activeData = internalSelection || draftState;

    const lastSelectionRef = useRef(null);
    useEffect(() => {
        if (internalSelection && internalSelection !== lastSelectionRef.current) {
            lastSelectionRef.current = internalSelection;
            setInitialDbState(structuredClone(internalSelection));
            setDraftState(structuredClone(internalSelection));
            setFormTab('pos');
            if (onContextUpdate) onContextUpdate({ type: internalSelection.price ? 'product' : (internalSelection.current_stock !== undefined ? 'inventory' : 'task'), data: internalSelection });
        }
    }, [internalSelection]);

    // Set product context on first render so CoreAssistant's Hybrid Router activates
    const contextSetRef = useRef(false);
    useEffect(() => {
        if (!contextSetRef.current && normalizedType === 'product' && data && onContextUpdate) {
            contextSetRef.current = true;
            onContextUpdate({ type: 'product', data: data });
        }
    }, [normalizedType, data, onContextUpdate]);

    useEffect(() => {
        if (type === 'attendance') {
            const fire = async () => {
                setAttendanceStatus('pending');
                try {
                    // Port 5173 is Vite, Port 3001 is our Attendance Bridge
                    const res = await fetch('http://localhost:3001/api/attendance/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: data.action })
                    });
                    const resData = await res.json();
                    if (resData.success) {
                        setAttendanceResult(resData);
                        setAttendanceStatus('success');
                    } else {
                        setAttendanceStatus('slow');
                    }
                } catch (e) {
                    setAttendanceStatus('slow'); // If server is down/slow, show retry msg
                }
            };
            fire();
        }
    }, [type, data?.action]);

    if (activeType === 'attendance') {
        return (
            <div className="card shadow-lg p-0 mb-4 overflow-hidden" style={{ borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', background: 'rgba(16,163,127,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'rgba(16,163,127,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Clock size={22} color="var(--accent)" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold' }}>{data.action === 'in' ? 'חתימת כניסה' : 'חתימת יציאה'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Bridge: Senzey Legacy System</div>
                        </div>
                    </div>
                </div>
                
                <div style={{ padding: '1.25rem' }}>
                    {attendanceStatus === 'pending' && (
                        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                            <div className="spinner" style={{ margin: '0 auto 1rem', width: '32px', height: '32px' }} />
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>מבצע חתימה אוטומטית...</div>
                        </div>
                    )}

                    {attendanceStatus === 'success' && (
                        <div className="animate-in fade-in zoom-in duration-300">
                            <div style={{ color: '#10A37F', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle2 size={20} /> בוצע בהצלחה בשעה {attendanceResult.time}
                            </div>
                            {attendanceResult.screenshot && (
                                <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                    <img 
                                        src={`http://localhost:3001${attendanceResult.screenshot}`} 
                                        style={{ width: '100%', display: 'block' }} 
                                        alt="Senzey Verification" 
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                    <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                        ווריפיקציה חזותית
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {attendanceStatus === 'slow' && (
                        <div style={{ background: 'rgba(245,158,11,0.08)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.2)', color: '#B45309' }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <Loader2 className="spinning" size={20} style={{ animation: 'spin 2s linear infinite' }} />
                                <div style={{ fontSize: '0.85rem' }}>
                                    <strong>Senzey is being slow today...</strong><br/>
                                    retrying in 1 minute...
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const [taskType, setTaskType] = useState('personal'); // personal | team

    // Track original text fields for smart re-index
    const originalTextRef = useRef({ name: data?.name, description: data?.description, category: data?.category, english_name: data?.english_name, modLabels: _getModTextFingerprint(data?.modifiers) });

    const executeAction = async () => {
        setLoading(true);
        try {
            if (activeType === 'product') {
                // ── JSONB-only mutation: sanitize + validate modifiers ──
                let sanitizedMods = draftState.modifiers;
                if (Array.isArray(draftState.modifiers)) {
                    sanitizedMods = draftState.modifiers.map(_sanitizeModGroup);
                    for (const g of sanitizedMods) {
                        if (!_validateModGroup(g)) throw new Error(`Invalid modifier schema: ${g.name}`);
                    }
                }
                const payload = {
                    name: draftState.name, price: parseFloat(draftState.price) || 0,
                    description: draftState.description || '', category: draftState.category || '',
                    english_name: draftState.english_name || '',
                    production_area: draftState.production_area || 'Bar',
                    kds_routing_logic: draftState.kds_routing_logic || 'MADE_TO_ORDER',
                    is_visible_pos: draftState.is_visible_pos ?? true,
                    is_in_stock: draftState.is_in_stock ?? true,
                    modifiers: sanitizedMods,
                    cost: parseFloat(draftState.cost) || 0,
                    sale_price: draftState.sale_price ? parseFloat(draftState.sale_price) : null,
                };
                const { error: updateError } = await supabase.from('menu_items').update(payload).eq('id', draftState.id);
                if (updateError) throw new Error(`Supabase update failed: ${updateError.message}`);
                // ── SMART RE-INDEX: only when text tokens changed ──
                const orig = originalTextRef.current;
                const modLabelsNow = _getModTextFingerprint(sanitizedMods);
                const textChanged = orig.name !== draftState.name || orig.description !== draftState.description || orig.category !== draftState.category || orig.english_name !== draftState.english_name || orig.modLabels !== modLabelsNow;
                if (textChanged) {
                    const modLabelStr = Array.isArray(sanitizedMods) ? sanitizedMods.map(g => `${g.name}: ${g.items.map(o=>o.name).join(', ')}`).join('. ') : '';
                    fetch('http://localhost:8070/v1/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${draftState.name} ${draftState.category || ''} ${draftState.description || ''} ${modLabelStr}`.trim(), table: 'menu_items', id: draftState.id }) }).catch(e => console.warn('⚠️ Embedding re-index failed:', e.message));
                    originalTextRef.current = { name: draftState.name, description: draftState.description, category: draftState.category, english_name: draftState.english_name, modLabels: modLabelsNow };
                }
            } else if (activeType === 'task') {
                await supabase.from('tasks').update({ status: 'completed' }).eq('id', draftState.id || 0);
            } else if (activeType === 'inventory') {
                await supabase.from('inventory_items').update({ current_stock: draftState.current_stock }).eq('id', draftState.id || 0);
            } else if (activeType === 'inventory_confirm') {
                // Update stock level for the item (properly scoped to business_id)
                const bid = context?.businessId || '11111111-1111-1111-1111-111111111111';
                const { data: item, error: selectErr } = await supabase
                    .from('inventory_items')
                    .select('current_stock')
                    .eq('business_id', bid)
                    .ilike('name', `%${draftState.item_name}%`)
                    .single();
                
                if (selectErr) throw selectErr;
                
                const newLevel = (item?.current_stock || 0) + draftState.amount;
                const { error: updateErr } = await supabase
                    .from('inventory_items')
                    .update({ current_stock: newLevel })
                    .eq('business_id', bid)
                    .ilike('name', `%${draftState.item_name}%`);
                
                if (updateErr) throw updateErr;
            } else if (activeType === 'create_task') {
                setDbError(null);
                if (taskType === 'personal') {
                    const { error } = await supabase.from('tasks').insert([{ 
                        title: draftState.title, 
                        description: draftState.description, 
                        status: 'pending',
                        business_id: context?.businessId || '11111111-1111-1111-1111-111111111111' 
                    }]);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from('recurring_tasks').insert([{
                        name: draftState.title,
                        description: draftState.description,
                        category: draftState.category || 'פתיחה',
                        frequency: draftState.frequency || 'Daily',
                        is_active: true,
                        business_id: context?.businessId || '11111111-1111-1111-1111-111111111111',
                        weekly_schedule: { "0": { "qty": 1, "mode": "fixed" }, "1": { "qty": 1, "mode": "fixed" }, "2": { "qty": 1, "mode": "fixed" }, "3": { "qty": 1, "mode": "fixed" }, "4": { "qty": 1, "mode": "fixed" }, "5": { "qty": 1, "mode": "fixed" }, "6": { "qty": 1, "mode": "fixed" } }
                    }]);
                    if (error) throw error;
                }
                // Mark as permanently saved — switch to compact confirmed view
                setSavedData({ title: draftState.title, type: taskType });
                setSuccess(true);
                return;
            }
            setSuccess(true);
            successTimerRef.current = setTimeout(() => setSuccess(false), 3000);
        } catch (e) {
            console.error("DB Bridge Execution Error:", e);
            setDbError(e.message || 'שגיאה בשמירה');
        }
        setLoading(false);
    };

    const pushToDesigner = async (itemOverride) => {
        if (!context?.businessId) return;
        const target = itemOverride || draftState;
        try {
            const state = await db.designerState.get(`full_project_${context.businessId}`);
            const elements = state?.objects || [];
            const newNameId = Date.now().toString();
            const newPriceId = (Date.now() + 1).toString();
            
            elements.push({ id: newNameId, type: 'text', content: target.name || 'New Item', x: 20, y: 70, fontSize: 40, color: '#FFFFFF', fontWeight: '900', fontFamily: "'Assistant', sans-serif" });
            if (target.price) {
                elements.push({ id: newPriceId, type: 'text', content: `${target.price}₪`, x: 20, y: 80, fontSize: 30, color: '#10A37F', fontWeight: '900', fontFamily: "'Assistant', sans-serif" });
            }

            await db.designerState.put({ ...state, id: `full_project_${context.businessId}`, objects: elements, businessId: context.businessId });
            alert('הפרטים נשלחו בהצלחה לקנבס העיצוב!');
        } catch (e) { console.error(e); }
    };

    if (activeType === 'inventory_confirm') {
        const formatConfirmAmount = (amt, unit) => {
            const absAmt = Math.abs(amt);
            const sign = amt >= 0 ? '+' : '-';
            if (unit === 'גרם' && absAmt >= 1000) return `${sign}${(absAmt / 1000).toFixed(1).replace('.0', '')} ק"ג (${sign}${absAmt} גרם)`;
            if (unit === 'מ"ל' && absAmt >= 1000) return `${sign}${(absAmt / 1000).toFixed(1).replace('.0', '')} ליטר (${sign}${absAmt} מ"ל)`;
            return `${sign}${absAmt} ${unit || 'יח׳'}`;
        };

        if (isCompact) {
            return (
                <div className="card shadow-md p-3 mb-4 animate-in fade-in" style={{ borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'rgba(16,163,127,0.1)', color: 'var(--accent)', padding: '8px', borderRadius: '10px' }}><PackageOpen size={20} /></div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{draftState.item_name} ({formatConfirmAmount(draftState.amount, draftState.unit)})</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>רישום קבלת סחורה</div>
                        </div>
                    </div>
                    <button onClick={executeAction} disabled={loading} className="primary-btn" style={{ padding: '8px 16px', borderRadius: '10px', background: success ? '#10b981' : 'var(--accent)', border: 'none', color: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {loading ? <div className="spinner" style={{width:14,height:14}}/> : (success ? <CheckCircle2 size={16}/> : 'אשר')}
                    </button>
                </div>
            );
        }

        return (
            <div className="card shadow-lg p-5 mb-4 border border-gray-100 animate-in slide-in-from-bottom" style={{ borderRadius: '24px', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                    <PackageOpen size={22} /> <span>אישור קבלת סחורה</span>
                </div>
                <div style={{ background: 'var(--bg)', p: '1rem', borderRadius: '16px', marginBottom: '1rem', border: '1px solid var(--border)', padding: '15px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--text)' }}>{draftState.item_name}</div>
                    <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--accent)', margin: '0.5rem 0' }}>{formatConfirmAmount(draftState.amount, draftState.unit)}{!draftState.unit && <span style={{ fontSize: '0.6rem', color: '#F59E0B', display: 'block' }}>⚠️ יחידה לא מוגדרת</span>}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>התקבל בתאריך {new Date().toLocaleDateString('he-IL')}</div>
                </div>
                <button onClick={executeAction} disabled={loading} className="primary-btn" style={{ width: '100%', padding: '14px', borderRadius: '14px', background: success ? '#10b981' : 'var(--accent)', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                    {loading ? <div className="spinner" style={{width:18,height:18}}/> : (success ? <CheckCircle2 size={20}/> : <Save size={20}/>)}
                    <span>{success ? 'עודכן במלאי' : 'אשר קבלה ועדכן מלאי'}</span>
                </button>
            </div>
        );
    }

    // M18: create_product branch — legacy flow for creating new products via ActionCard. Keep for backward compat.
    if (activeType === 'create_product') {
        if (savedData) {
            return (
                <div className="card animate-in fade-in" style={{ borderRadius: '16px', background: 'var(--surface)', border: '1px solid #10b981', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '8px', borderRadius: '10px', flexShrink: 0 }}>
                            <CheckCircle2 size={20} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{savedData.title}</div>
                            <div style={{ fontSize: '0.75rem', color: '#10b981' }}>נשמר בהצלחה · זמין כעת בקופה</div>
                        </div>
                    </div>
                    <button onClick={() => setSavedData(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer' }}>ערוך</button>
                </div>
            );
        }

        return (
            <div className="card shadow-lg p-0 mb-4 overflow-hidden animate-in slide-in-from-bottom duration-300" style={{ borderRadius: '24px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {/* Header & Tabs */}
                <div style={{ background: 'rgba(16,163,127,0.03)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                        <PlusCircle size={20} /> <span>הוספת מנה ל-iCaffeOS</span>
                    </div>
                    <div style={{ display: 'flex', padding: '0 1.25rem 0.75rem', gap: '1rem' }}>
                        {[
                            { id: 'details', label: 'פרטי מנה' },
                            { id: 'production', label: 'הכנה ומלאי' },
                            { id: 'visual', label: 'ויזואל & AI' }
                        ].map(t => (
                            <button 
                                key={t.id}
                                onClick={() => setFormTab(t.id)}
                                style={{ 
                                    background: 'none', border: 'none', padding: '4px 0', fontSize: '0.8rem', cursor: 'pointer',
                                    fontWeight: formTab === t.id ? 'bold' : 'normal',
                                    color: formTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                                    borderBottom: formTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* TAB 1: DETAILS */}
                    {formTab === 'details' && (
                        <div className="animate-in fade-in duration-300" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>שם (He) *</label>
                                    <input className="text-input-field" value={draftState.name || ''} onChange={(e) => setDraftState(prev => ({...prev, name: e.target.value}))} placeholder="לדוגמה: קפה הפוך" style={{ width: '100%', margin: 0 }} />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Name (En)</label>
                                    <input className="text-input-field" value={draftState.english_name || ''} onChange={(e) => setDraftState(prev => ({...prev, english_name: e.target.value}))} placeholder="e.g. Cappuccino" style={{ width: '100%', margin: 0 }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>מחיר (₪) *</label>
                                    <input type="number" className="text-input-field" value={draftState.price || ''} onChange={(e) => setDraftState(prev => ({...prev, price: e.target.value}))} placeholder="0.00" style={{ width: '100%', margin: 0 }} />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>קטגוריה *</label>
                                    {isNewCategory ? (
                                        <div style={{ position: 'relative' }}>
                                            <input className="text-input-field" autoFocus value={draftState.category || ''} onChange={(e) => setDraftState(prev => ({...prev, category: e.target.value}))} placeholder="שם קטגוריה..." style={{ width: '100%', margin: 0 }} />
                                            <button onClick={() => setIsNewCategory(false)} style={{ position: 'absolute', left: 8, top: 12, border: 'none', background: 'none', color: 'var(--accent)', fontSize: '0.7rem', cursor: 'pointer' }}>ביטול</button>
                                        </div>
                                    ) : (
                                        <select className="text-input-field" style={{ width: '100%', margin: 0, height: '42px' }} value={draftState.category || ''} onChange={(e) => e.target.value === 'NEW' ? setIsNewCategory(true) : setDraftState(prev => ({...prev, category: e.target.value}))}>
                                            <option value="">בחר...</option>
                                            {dbCategories.map(c => <option key={c.id} value={c.name_he}>{c.name_he}</option>)}
                                            <option value="NEW" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>+ קבוצה חדשה</option>
                                        </select>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: PRODUCTION */}
                    {formTab === 'production' && (
                        <div className="animate-in fade-in duration-300" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>אזור הכנה (KDS Station)</label>
                                <div style={{ display: 'flex', background: 'var(--bg)', padding: '3px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    {[
                                        { id: 'Bar', label: 'בר' },
                                        { id: 'Kitchen', label: 'מטבח' },
                                        { id: 'Checker', label: 'צ\'קר' }
                                    ].map(opt => (
                                        <button key={opt.id} onClick={() => setDraftState(prev => ({...prev, production_area: opt.id}))} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '10px', fontSize: '0.75rem', cursor: 'pointer', background: draftState.production_area === opt.id ? 'var(--accent)' : 'transparent', color: draftState.production_area === opt.id ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s', fontWeight: 'bold' }}>{opt.label}</button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>מצב הכנה</label>
                                <div style={{ display: 'flex', background: 'var(--bg)', padding: '3px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    {[
                                        { id: 'MADE_TO_ORDER', label: 'דרוש הכנה' },
                                        { id: 'GRAB_AND_GO', label: 'Grab & Go' },
                                        { id: 'CONDITIONAL', label: 'מותנה' }
                                    ].map(opt => (
                                        <button key={opt.id} onClick={() => setDraftState(prev => ({...prev, kds_routing_logic: opt.id}))} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '10px', fontSize: '0.7rem', cursor: 'pointer', background: draftState.kds_routing_logic === opt.id ? 'var(--accent)' : 'transparent', color: draftState.kds_routing_logic === opt.id ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s', fontWeight: 'bold' }}>{opt.label}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: VISUALS */}
                    {formTab === 'visual' && (
                        <div className="animate-in fade-in duration-300" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: imageServerOnline === null ? '#f59e0b' : (imageServerOnline ? '#10b981' : '#ef4444'), boxShadow: imageServerOnline ? '0 0 10px #10b981' : 'none' }} />
                                    <span style={{ fontWeight: 'bold' }}>Flux Engine:</span>
                                    <span style={{ color: 'var(--text-muted)' }}>{imageServerOnline === null ? 'בודק...' : (imageServerOnline ? 'מחובר (Online)' : 'לא זמין (Offline)')}</span>
                                </div>
                                {imageServerOnline === false && <Sparkles size={14} color="#ef4444" />}
                            </div>

                            <div style={{ width: '100%', height: '160px', borderRadius: '18px', background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                {generatedImage ? <img src={generatedImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon size={48} style={{ opacity: 0.1 }} />}
                                {imageLoading && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{genProgress}%</div>
                                        <div style={{ fontSize: '0.7rem' }}>מייצר ויזואליה ב-Flux Engine...</div>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={async () => {
                                    if (!draftState.name) return;
                                    setImageLoading(true);
                                    setGenProgress(0);
                                    let pollStopped = false;
                                    const poll = setInterval(async () => {
                                        if (pollStopped) return;
                                        try {
                                            const p = await brain.checkImageProgress();
                                            if (!pollStopped) setGenProgress(Math.round(p * 100));
                                        } catch (_) { /* ignore progress check errors */ }
                                    }, 1000);
                                    try {
                                        const url = await brain.generateProductImage(draftState.english_name || draftState.name, draftState.description);
                                        setGeneratedImage(url);
                                        setDraftState(prev => ({...prev, image_url: url}));
                                    } catch (e) { alert('מנוע התמונות לא זמין כרגע'); }
                                    pollStopped = true;
                                    clearInterval(poll);
                                    setImageLoading(false);
                                    setGenProgress(0);
                                }}
                                disabled={imageLoading || !draftState.name}
                                style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '12px', borderRadius: '14px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                {imageLoading ? <div className="spinner" style={{width:16,height:16,borderTopColor:'white'}}/> : <Sparkles size={18} />}
                                {generatedImage ? 'ייצר תמונה חדשה' : 'ייצר תמונה מקצועית עם AI'}
                            </button>
                        </div>
                    )}

                    {dbError && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 14px', borderRadius: '10px', fontSize: '0.8rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                            ⚠️ שגיאה: {dbError}
                        </div>
                    )}

                    <button onClick={async () => {
                        if (!draftState.name || !draftState.price || !draftState.category) return;
                        setLoading(true); setDbError(null);
                        const { error } = await supabase.from('menu_items').insert([{
                            name: draftState.name,
                            english_name: draftState.english_name || '',
                            price: parseFloat(draftState.price),
                            description: draftState.description || '',
                            category: draftState.category,
                            kds_routing_logic: draftState.kds_routing_logic,
                            production_area: draftState.production_area,
                            is_prep_required: draftState.is_prep_required,
                            image_url: draftState.image_url || null,
                            display_kds: "true",
                            is_visible_pos: true,
                            business_id: context?.businessId || '11111111-1111-1111-1111-111111111111'
                        }]);
                        setLoading(false);
                        if (error) { setDbError(error.message); return; }
                        // Index new item for vector search
                        fetch('http://localhost:8070/v1/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${draftState.name} ${draftState.category || ''} ${draftState.description || ''}`, table: 'menu_items', id: 0 }) }).catch(e => console.warn('⚠️ Embedding re-index failed:', e.message));
                        setSavedData({ title: draftState.name });
                    }} disabled={loading || !draftState.name || !draftState.price || !draftState.category} className="primary-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: 'var(--accent)', color: 'white', padding: '12px', borderRadius: '14px', border: 'none', cursor: (draftState.name && draftState.price && draftState.category) ? 'pointer' : 'not-allowed', opacity: (draftState.name && draftState.price && draftState.category) ? 1 : 0.5, transition: 'all 0.2s', marginTop: '0.5rem' }}>
                        {loading ? <div className="spinner" style={{width:16,height:16,borderTopColor:'white'}}/> : <Save size={20}/>}
                        <span style={{ fontWeight: 'bold' }}>שמור והוסף לתפריט</span>
                    </button>
                </div>
            </div>
        );
    }

    if (activeType === 'create_task') {
        // SAVED STATE: Show compact confirmation card instead of form
        if (savedData) {
            return (
                <div className="card animate-in fade-in" style={{ borderRadius: '16px', background: 'var(--surface)', border: '1px solid #10b981', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '8px', borderRadius: '10px', flexShrink: 0 }}>
                            <CheckCircle2 size={20} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{savedData.title}</div>
                            <div style={{ fontSize: '0.75rem', color: '#10b981' }}>נשמר בהצלחה · {savedData.type === 'personal' ? 'משימה אישית' : 'משימת צוות'}</div>
                        </div>
                    </div>
                    <button onClick={() => setSavedData(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer' }}>
                        ערוך
                    </button>
                </div>
            );
        }

        const categories = [
            { id: 'פתיחה', label: 'פתיחה', color: '#3B82F6' },
            { id: 'הכנות', label: 'הכנות', color: '#F59E0B' },
            { id: 'סגירה', label: 'סגירה', color: '#10A37F' }
        ];

        return (
            <div className="card shadow-lg p-0 mb-4 overflow-hidden animate-in slide-in-from-bottom duration-300" style={{ borderRadius: '24px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', background: 'rgba(16,163,127,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                            <PlusCircle size={20} /> <span>יצירת משימה</span>
                        </div>
                        <div style={{ display: 'flex', background: 'var(--bg)', padding: '2px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <button onClick={() => setTaskType('personal')} style={{ padding: '4px 12px', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', background: taskType === 'personal' ? 'var(--accent)' : 'transparent', color: taskType === 'personal' ? 'white' : 'var(--text-secondary)' }}>אישי</button>
                            <button onClick={() => setTaskType('team')} style={{ padding: '4px 12px', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', background: taskType === 'team' ? 'var(--accent)' : 'transparent', color: taskType === 'team' ? 'white' : 'var(--text-secondary)' }}>צוות</button>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>שם המשימה</label>
                        <input className="text-input-field" value={draftState.title || ''} onChange={(e) => setDraftState(prev => ({...prev, title: e.target.value}))} placeholder="כותרת המשימה..." style={{ width: '100%', margin: 0 }} />
                    </div>

                    {taskType === 'team' && (
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>קטגוריה</label>
                                <select className="text-input-field" style={{ width: '100%', margin: 0, height: '42px' }} value={draftState.category || 'פתיחה'} onChange={(e) => setDraftState(prev => ({...prev, category: e.target.value}))}>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>תדירות</label>
                                <select className="text-input-field" style={{ width: '100%', margin: 0, height: '42px' }} value={draftState.frequency || 'Daily'} onChange={(e) => setDraftState(prev => ({...prev, frequency: e.target.value}))}>
                                    <option value="Daily">יומי</option>
                                    <option value="Weekly">שבועי</option>
                                    <option value="Monthly">חודשי</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>תיאור (אופציונלי)</label>
                        <textarea className="text-input-field" rows={2} value={draftState.description || ''} onChange={(e) => setDraftState(prev => ({...prev, description: e.target.value}))} placeholder="פירוט נוסף להוראות הביצוע..." style={{ width: '100%', margin: 0 }} />
                    </div>

                    {dbError && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 14px', borderRadius: '10px', fontSize: '0.8rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                            ⚠️ שגיאה בשמירה: {dbError}
                        </div>
                    )}

                    <button onClick={executeAction} disabled={loading || !draftState.title} className="primary-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: 'var(--accent)', color: 'white', padding: '12px', borderRadius: '12px', border: 'none', cursor: draftState.title ? 'pointer' : 'not-allowed', opacity: draftState.title ? 1 : 0.5, transition: 'all 0.2s' }}>
                        {loading ? <div className="spinner" style={{width:16,height:16,borderTopColor:'white'}}/> : <Save size={20}/>}
                        <span style={{ fontWeight: 'bold' }}>{taskType === 'personal' ? 'צור משימה אישית' : 'צור משימת צוות'}</span>
                    </button>
                </div>
            </div>
        );
    }

    if (activeType === 'selection' && Array.isArray(data)) {
        return (
            <div className="card shadow-md p-0 mb-4 overflow-hidden" style={{ borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'rgba(16,163,127,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                        <ListFilter size={18} /> <span>נמצאו מספר התאמות - לחץ לעריכה מיידית</span>
                    </div>
                </div>
                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {data.map((item, idx) => (
                        <div key={idx} onClick={() => setInternalSelection(item)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)', transition: 'all 0.2s' }} className="hover-scale">
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{item.name || item.title}</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.price ? `${item.price}₪` : (item.current_stock != null ? `מלאי: ${item.current_stock} ${item.unit || ''}` : '')}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <div style={{ color: 'var(--text-muted)' }}><Edit2 size={16} /></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (activeType === 'product') {
        // ── Read-only modifier classification ──
        let mods = draftState.modifiers;
        if (typeof mods === 'string') { try { mods = JSON.parse(mods); } catch(e) { mods = null; } }
        if (mods && !Array.isArray(mods) && Array.isArray(mods.groups)) { mods = mods.groups; }
        const isModGroups = Array.isArray(mods);
        const modGroups = isModGroups ? mods : [];
        const modConfig = (!isModGroups && mods && typeof mods === 'object') ? mods : null;
        const classified = _classifyModGroups(modGroups);

        // ── Publish to POS (single Supabase write) ──
        const publishToPos = async () => {
            setLoading(true);
            setDbError(null);
            try {
                let sanitizedMods = draftState.modifiers;
                if (Array.isArray(draftState.modifiers)) {
                    sanitizedMods = draftState.modifiers.map(_sanitizeModGroup);
                    for (const g of sanitizedMods) {
                        if (!_validateModGroup(g)) throw new Error(`Invalid modifier schema: ${g.name}`);
                    }
                }
                const payload = {
                    name: draftState.name, price: parseFloat(draftState.price) || 0,
                    description: draftState.description || '', category: draftState.category || '',
                    english_name: draftState.english_name || '',
                    production_area: draftState.production_area || 'Bar',
                    kds_routing_logic: draftState.kds_routing_logic || 'MADE_TO_ORDER',
                    is_visible_pos: draftState.is_visible_pos ?? true,
                    is_in_stock: draftState.is_in_stock ?? true,
                    modifiers: sanitizedMods,
                    cost: parseFloat(draftState.cost) || 0,
                    sale_price: draftState.sale_price ? parseFloat(draftState.sale_price) : null,
                };
                const { error: updateError } = await supabase.from('menu_items').update(payload).eq('id', draftState.id);
                if (updateError) throw new Error(`Supabase update failed: ${updateError.message}`);
                // Smart re-index: only when text tokens changed
                const orig = originalTextRef.current;
                const modLabelsNow = _getModTextFingerprint(sanitizedMods);
                const textChanged = orig.name !== draftState.name || orig.description !== draftState.description || orig.category !== draftState.category || orig.english_name !== draftState.english_name || orig.modLabels !== modLabelsNow;
                if (textChanged) {
                    const modLabelStr = Array.isArray(sanitizedMods) ? sanitizedMods.map(g => `${g.name}: ${g.items.map(o=>o.name).join(', ')}`).join('. ') : '';
                    fetch('http://localhost:8070/v1/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${draftState.name} ${draftState.category || ''} ${draftState.description || ''} ${modLabelStr}`.trim(), table: 'menu_items', id: draftState.id }) }).catch(e => console.warn('⚠️ Embedding re-index failed:', e.message));
                    originalTextRef.current = { name: draftState.name, description: draftState.description, category: draftState.category, english_name: draftState.english_name, modLabels: modLabelsNow };
                }
                setInitialDbState(structuredClone(draftState));
                setSuccess(true);
                successTimerRef.current = setTimeout(() => setSuccess(false), 2500);
            } catch (e) {
                setDbError(e.message);
            } finally {
                setLoading(false);
            }
        };

        // ── Collapsed card ──
        if (!isExpanded) {
            return (
                <div onClick={() => setIsExpanded(true)} className={`pos-modal${isDirty ? ' pos-draft-mode' : ''}`} style={{ cursor: 'pointer', marginBottom: '1rem' }}>
                    <div className="pos-header">
                        <div className="pos-header-info">
                            <div className="pos-header-icon">
                                {draftState.image_url ? <img src={draftState.image_url} alt="" /> : <Coffee size={18} />}
                            </div>
                            <div>
                                <h3 className="pos-header-name">{draftState.name}</h3>
                                <span className="pos-header-sub">{draftState.category} · ₪{draftState.price}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isDirty && <span className="pos-draft-badge">שינויים ממתינים</span>}
                            <ChevronDown size={18} color="var(--text-muted)" />
                        </div>
                    </div>
                </div>
            );
        }

        // ── POS-style expanded card (100% READ-ONLY) ──
        return (
            <div className={`pos-modal${isDirty ? ' pos-draft-mode' : ''}`} style={{ marginBottom: '1rem', position: 'relative' }}>
                {/* Neural mutation shimmer */}
                <AnimatePresence>
                    {isMutating && (
                        <motion.div className="pos-mutating-overlay"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
                    )}
                </AnimatePresence>

                {/* ── Header ── */}
                <div className="pos-header">
                    <div className="pos-header-info">
                        <div className="pos-header-icon">
                            {draftState.image_url ? <img src={draftState.image_url} alt="" /> : <Coffee size={18} />}
                        </div>
                        <div>
                            <h3 className="pos-header-name">{draftState.name}</h3>
                            <span className="pos-header-sub">{draftState.category} · ₪{draftState.price}</span>
                        </div>
                    </div>
                    <div className="pos-header-actions">
                        {isDirty && <span className="pos-draft-badge">שינויים ממתינים</span>}
                        <button onClick={() => setIsExpanded(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}><ChevronUp size={18} /></button>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div className="pos-tabs">
                    <button className={`pos-tab${formTab === 'pos' ? ' active' : ''}`} onClick={() => setFormTab('pos')}>📱 תצוגת קופה</button>
                    <button className={`pos-tab${formTab === 'info' ? ' active' : ''}`} onClick={() => setFormTab('info')}>ℹ️ מידע</button>
                </div>

                {/* ═══ TAB: POS PREVIEW (READ-ONLY) ═══ */}
                {formTab === 'pos' && (
                    <div className="pos-content">
                        {/* Hero group (Milk / Coffee Type) */}
                        <AnimatePresence mode="popLayout">
                        {classified.hero && (
                            <motion.div className="pos-hero-section" layout
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', padding: '0 4px 4px' }}>
                                    {classified.hero.name}
                                </div>
                                <div className="pos-hero-grid">
                                    <AnimatePresence mode="popLayout">
                                    {(classified.hero.items || []).map(opt => (
                                        <motion.div key={opt.id} className={`pos-hero-card${opt.isDefault ? ' selected' : ''}`}
                                            layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                                            <span className="pos-hero-card-name">{opt.name}</span>
                                            {opt.price > 0 && <span className="pos-hero-card-price">+₪{opt.price}</span>}
                                        </motion.div>
                                    ))}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}
                        </AnimatePresence>

                        {/* Modifier columns (foam, temp, base, strength) */}
                        {classified.columns.filter(g => (g.items || []).length > 0).length > 0 && (
                            <div className={`pos-modifier-grid cols-${classified.columns.filter(g => (g.items || []).length > 0).length}`}>
                                {classified.columns.filter(g => (g.items || []).length > 0).map(group => {
                                    const visibleItems = (group.items || []).filter(v => !(v.name || '').includes('רגיל'));
                                    return (
                                    <div key={group.id} className="pos-modifier-col">
                                        <span className="pos-modifier-col-label">{group.name}</span>
                                        <AnimatePresence mode="popLayout">
                                        {visibleItems.map(opt => (
                                            <motion.div key={opt.id} className={`pos-modifier-pill${opt.isDefault ? ' selected' : ''}`}
                                                layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                                                <span>{opt.name}</span>
                                                {opt.price > 0 && <span className="pos-modifier-pill-price">+₪{opt.price}</span>}
                                            </motion.div>
                                        ))}
                                        </AnimatePresence>
                                    </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Other groups */}
                        <AnimatePresence mode="popLayout">
                        {classified.other.map(group => {
                            const items = group.items || [];
                            if (items.length === 0) return null;
                            return (
                                <motion.div key={group.id} className="pos-other-group" layout
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                                    <div className="pos-other-group-title">
                                        <span>{group.name}</span>
                                        <span className={`pos-badge ${group.requirement === 'M' ? 'required' : 'optional'}`}>{group.requirement === 'M' ? 'חובה' : 'רשות'}</span>
                                    </div>
                                    <div className={`pos-other-grid${items.length <= 4 ? ' cols-2' : ''}`}>
                                        <AnimatePresence mode="popLayout">
                                        {items.map(opt => (
                                            <motion.div key={opt.id} className={`pos-other-option${opt.isDefault ? ' selected' : ''}`}
                                                layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                                                <span>{opt.name}</span>
                                                {opt.price > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+₪{opt.price}</span>}
                                            </motion.div>
                                        ))}
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            );
                        })}
                        </AnimatePresence>

                        {/* Config mode (object-type modifiers) — read-only */}
                        {modConfig && (
                            <div className="pos-config-grid">
                                {modConfig.config && Object.entries(modConfig.config).map(([key, val]) => (
                                    <div key={key} className="pos-config-flag">
                                        <span>{key.replace('allows_', '').replace(/_/g, ' ')}</span>
                                        <div className={`pos-toggle-knob ${val ? 'on' : 'off'}`} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Empty state */}
                        {isModGroups && modGroups.length === 0 && (
                            <div className="pos-empty-state">
                                למנה זו אין התאמות אישיות. כתוב בצ'אט כדי להוסיף.
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ TAB: INFO (READ-ONLY) ═══ */}
                {formTab === 'info' && (
                    <div className="pos-content" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div className="pos-info-row"><span className="pos-info-label">שם עברי</span><span className="pos-info-value">{draftState.name || '—'}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">English</span><span className="pos-info-value">{draftState.english_name || '—'}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">מחיר</span><span className="pos-info-value">₪{draftState.price || 0}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">מבצע</span><span className="pos-info-value">{draftState.sale_price ? `₪${draftState.sale_price}` : '—'}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">עלות</span><span className="pos-info-value">{draftState.cost ? `₪${draftState.cost}` : '—'}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">קטגוריה</span><span className="pos-info-value">{draftState.category || '—'}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">תיאור</span><span className="pos-info-value" style={{ maxWidth: '60%', textAlign: 'left' }}>{draftState.description || '—'}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">אזור הכנה</span><span className="pos-info-value">{({'Bar':'בר','Kitchen':'מטבח','Checker':"צ'קר"})[draftState.production_area] || draftState.production_area || 'בר'}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">מצב הכנה</span><span className="pos-info-value">{({'MADE_TO_ORDER':'דרוש הכנה','CASHIER':'קופאי','GRAB_AND_GO':'Grab & Go'})[draftState.kds_routing_logic] || draftState.kds_routing_logic || 'דרוש הכנה'}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">במלאי</span><span className="pos-info-value">{draftState.is_in_stock !== false ? '✅' : '❌'}</span></div>
                        <div className="pos-info-row"><span className="pos-info-label">גלוי בקופה</span><span className="pos-info-value">{draftState.is_visible_pos !== false ? '✅' : '❌'}</span></div>
                    </div>
                )}

                {/* ── Footer ── */}
                {dbError && (
                    <div style={{ padding: '0 1.25rem', marginBottom: '-0.5rem' }}>
                        <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '8px 12px', borderRadius: '10px', fontSize: '0.8rem', border: '1px solid rgba(239,68,68,0.2)' }}>⚠️ {dbError}</div>
                    </div>
                )}
                <div className="pos-footer">
                    {isDirty ? (
                        <motion.button className={`pos-save-btn${success ? ' saved' : ''}`} onClick={publishToPos} disabled={loading}
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            {loading ? <div className="spinner" style={{width:16,height:16,borderTopColor:'white'}}/> : (success ? <CheckCircle2 size={18}/> : <Save size={18}/>)}
                            {success ? 'פורסם ✓' : '💾 שמור שינויים'}
                        </motion.button>
                    ) : (
                        <div style={{ padding: '8px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', width: '100%' }}>
                            ✏️ כתוב בצ'אט כדי לערוך מנה זו
                        </div>
                    )}
                </div>
            </div>
        );
    }



    if (activeType === 'inventory') {
        // --- Smart display helper ---
        const displayStock = (amount, unit) => {
            const n = parseFloat(amount) || 0;
            if (unit === 'גרם' && n >= 1000) return `${(n / 1000).toFixed(1)} ק"ג`;
            if (unit === 'מ"ל' && n >= 1000) return `${(n / 1000).toFixed(1)} ליטר`;
            return `${n} ${unit || 'יח׳'}`;
        };

        // --- Packaging levels ---
        const pkg = draftState.packaging;
        const levels = pkg?.levels || [];
        const hasPackaging = levels.length > 0;
        const baseUnit = draftState.unit || 'יח׳';

        // Build counting options: base unit + each packaging level
        const countOptions = [{ name: baseUnit, multiplier: 1 }];
        let runningMultiplier = 1;
        for (const level of levels) {
            runningMultiplier *= (level.contains || 1);
            countOptions.push({ name: level.name, multiplier: runningMultiplier });
        }

        // Selected counting mode
        const countMode = draftState._countMode || baseUnit;
        const activeOption = countOptions.find(o => o.name === countMode) || countOptions[0];
        const countInput = parseFloat(draftState._countInput) || 0;
        const totalBaseUnits = Math.round(countInput * activeOption.multiplier);

        if (!isExpanded) {
            return (
                <div onClick={() => setIsExpanded(true)} className="card shadow-sm p-3 mb-4 border" style={{ borderRadius: '16px', cursor: 'pointer', background: 'var(--surface)', borderColor: '#F59E0B', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>מלאי{draftState.supplier ? ` · ${draftState.supplier}` : ''}</div>
                        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}><PackageOpen size={14} color="#F59E0B"/> {draftState.name} <span style={{color: '#F59E0B'}}>{displayStock(draftState.current_stock, baseUnit)}</span></div>
                    </div>
                    <ChevronDown size={18} color="var(--text-secondary)" />
                </div>
            );
        }

        return (
            <div className="card shadow-lg p-4 mb-4 border border-gray-100" style={{ borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F59E0B' }}>
                        <PackageOpen size={18} /> <strong>עדכון מלאי</strong>
                    </div>
                    {draftState.supplier && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg)', padding: '2px 8px', borderRadius: '6px' }}>ספק: {draftState.supplier}</span>}
                </div>

                <div style={{ fontWeight: '600', fontSize: '1rem' }}>{draftState.name || 'פריט'}</div>

                {/* Packaging mode selector */}
                {hasPackaging && (
                    <div style={{ display: 'flex', background: 'var(--bg)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border)', gap: '2px' }}>
                        {countOptions.map(opt => (
                            <button key={opt.name} onClick={() => setDraftState(prev => ({...prev, _countMode: opt.name, _countInput: ''}))} style={{ flex: 1, padding: '6px 4px', border: 'none', borderRadius: '8px', fontSize: '0.72rem', cursor: 'pointer', background: countMode === opt.name ? '#F59E0B' : 'transparent', color: countMode === opt.name ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s', fontWeight: 'bold' }}>
                                {opt.name}
                                {opt.multiplier > 1 && <div style={{ fontSize: '0.6rem', fontWeight: 'normal', opacity: 0.8 }}>×{opt.multiplier}</div>}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                        type="number"
                        className="text-input-field"
                        style={{ flex: 1, margin: 0, padding: '10px 12px', fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center' }}
                        value={hasPackaging ? (draftState._countInput || '') : (draftState.current_stock || 0)}
                        onChange={(e) => {
                            if (hasPackaging) {
                                const val = e.target.value;
                                setDraftState(prev => ({...prev, _countInput: val, current_stock: Math.round(parseFloat(val || 0) * activeOption.multiplier)}));
                            } else {
                                const val = e.target.value;
                                setDraftState(prev => ({...prev, current_stock: val}));
                            }
                        }}
                        placeholder="0"
                    />
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', minWidth: '40px' }}>{countMode}</span>
                </div>

                {/* Live conversion display */}
                {hasPackaging && countInput > 0 && (
                    <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '10px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>המרה:</div>
                        {countOptions.filter(o => o.name !== countMode).map(o => (
                            <div key={o.name} style={{ fontSize: '0.8rem', fontWeight: '500' }}>
                                = {(totalBaseUnits / o.multiplier).toFixed(o.multiplier > 1 ? 1 : 0)} {o.name}
                            </div>
                        ))}
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#F59E0B', marginTop: '2px' }}>
                            סה"כ ב-DB: {displayStock(totalBaseUnits, baseUnit)}
                        </div>
                    </div>
                )}

                {!draftState.unit && <div style={{ fontSize: '0.7rem', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '4px' }}>⚠️ יחידה לא מוגדרת — ברירת מחדל: יח׳</div>}

                <button onClick={executeAction} disabled={loading} className="primary-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: success ? '#10b981' : '#F59E0B', color: 'white', padding: '12px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                    {loading ? <div className="spinner" style={{width:16,height:16,borderTopColor:'white'}}/> : (success ? <CheckCircle2 size={18}/> : <Save size={18}/>)}
                    {success ? 'מלאי עודכן ✅' : `שמור — ${displayStock(hasPackaging ? totalBaseUnits : (draftState.current_stock || 0), baseUnit)}`}
                </button>
            </div>
        );
    }

    if (activeType === 'catalog_view' && data?.items) {
        const items = data.items;
        return (
            <div className="card shadow-md p-0 mb-4 overflow-hidden" style={{ borderRadius: '24px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'rgba(16,163,127,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                        <LayoutTemplate size={18} /> <span>נמצאו {items.length} פריטים בתפריט</span>
                    </div>
                </div>
                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {items.map((item, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => setInternalSelection(item)} 
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg)', borderRadius: '16px', border: '1px solid var(--border)', transition: 'all 0.2s' }} 
                            className="hover-card-item"
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(16,163,127,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                    <Layout size={20} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{item.name}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.category} · {item.price}₪</span>
                                </div>
                            </div>
                            <ChevronRight size={18} color="var(--text-muted)" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (activeType === 'inventory_view' && data?.items) {
        const items = data.items;
        return (
            <div className="card shadow-md p-0 mb-4 overflow-hidden" style={{ borderRadius: '24px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F59E0B', fontWeight: 'bold' }}>
                        <PackageOpen size={18} /> <span>נמצאו {items.length} פריטי מלאי</span>
                    </div>
                </div>
                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {items.map((item, idx) => (
                        <div key={idx} onClick={() => setInternalSelection(item)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg)', borderRadius: '16px', border: '1px solid var(--border)', transition: 'all 0.2s' }} className="hover-card-item">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
                                    <PackageOpen size={20} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{item.name}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>מלאי נוכחי: {item.current_stock} {item.unit}</span>
                                </div>
                            </div>
                            <ChevronRight size={18} color="var(--text-muted)" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (activeType === 'task') {
        return (
            <div className="card shadow-lg p-4 mb-4 border border-gray-100" style={{ borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#3B82F6' }}>
                    <CheckCircle2 size={18} /> <strong>בקרת משימות מנהל</strong>
                </div>
                <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{draftState.title || 'משימה ללא כותרת'}</p>
                <button onClick={executeAction} disabled={loading} className="primary-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: success ? '#10b981' : '#3B82F6', color: 'white', padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                    {loading ? <div className="spinner" style={{width:16,height:16,borderTopColor:'white'}}/> : (success ? <CheckCircle2 size={18}/> : <CheckCircle2 size={18}/>)}
                    {success ? 'נרשם כבוצע' : 'סמן משימה כהושלמה'}
                </button>
            </div>
        );
    }

    return null;
});

export default ActionCard;
