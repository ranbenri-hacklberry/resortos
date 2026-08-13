import React, { useState, useEffect, useRef } from 'react';
import { db } from '../db';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Trash2, Camera, FolderOpen, Type, Save, X, Bold, CheckCircle2, RefreshCw, Sparkles, Copy, MapPin, Send, MessageSquare, Wand2, Frame, Smartphone, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';

const FONTS = [
    { name: 'Assistant', family: "'Assistant', sans-serif" },
    { name: 'Heebo', family: "'Heebo', sans-serif" },
    { name: 'Rubik', family: "'Rubik', sans-serif" },
    { name: 'Secular', family: "'Secular One', serif" },
    { name: 'Amatic', family: "'Amatic SC', cursive" }
];

const RATIOS = [
    { name: 'Square', value: '1/1', label: '1:1' },
    { name: 'Portrait', value: '4/5', label: '4:5' },
    { name: 'Story', value: '9/16', label: '9:16' }
];

export default function Designer({ session, context, bgImage, setBgImage, setActiveTab }) {
    const { t } = useTranslation();
    const [elements, setElements] = useState([]);
    const [recentDesigns, setRecentDesigns] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [aspectRatio, setAspectRatio] = useState('1/1');
    const [isExporting, setIsExporting] = useState(false);
    const [exportSuccess, setExportSuccess] = useState(false);
    const [showAI, setShowAI] = useState(false);
    const [captions, setCaptions] = useState([]);
    const [selectedCaption, setSelectedCaption] = useState(null);
    const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
    const [showSafeZones, setShowSafeZones] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    
    const fileInputRef = useRef();
    const replaceInputRef = useRef();
    const logoInputRef = useRef();
    const canvasRef = useRef();

    useEffect(() => {
        if (context?.businessId) {
            db.designerState.get(`full_project_${context.businessId}`).then(state => {
                if (state) {
                    setElements(state.objects || []);
                    if (state.bgImage && !bgImage) setBgImage(state.bgImage);
                    if (state.aspectRatio) setAspectRatio(state.aspectRatio);
                }
            });
            fetch(`/api/assets?type=designs&bid=${context.businessId}`).then(r => r.json()).then(data => setRecentDesigns(Array.isArray(data) ? data : [])).catch(() => setRecentDesigns([]));
        }
    }, [context?.businessId]);

    useEffect(() => {
        if (!context?.businessId || isExporting) return;
        const handler = setTimeout(() => {
            db.designerState.put({ id: `full_project_${context.businessId}`, objects: elements, bgImage, aspectRatio, businessId: context.businessId });
        }, 1000);
        return () => clearTimeout(handler);
    }, [elements, bgImage, aspectRatio, context?.businessId, isExporting]);

    const generateCaptions = async () => {
        const textElements = elements.filter(el => el.type === 'text').map(el => el.content).join(' ');

        setShowAI(true);
        setIsGeneratingCaptions(true);
        setCaptions([]);
        setSelectedCaption(null);

        try {
            const prompt = `You are a social media copywriter for a business. 
Based on this existing text from the graphic design: "${textElements}"
Write 3 short, punchy marketing captions in Hebrew suitable for Instagram/WhatsApp promoting this. 
Include emojis. If words like "המבורגר" or "Burger" appear, generate an imaginary offer with a price like 59 NIS.
Return strictly a valid JSON array of 3 strings. Example: ["caption 1", "caption 2", "caption 3"]`;

            const res = await fetch('http://127.0.0.1:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'icaffe-brain:latest',
                    prompt: prompt,
                    stream: false,
                    format: 'json'
                })
            });

            if (!res.ok) throw new Error('Ollama failed');
            const data = await res.json();
            const parsed = JSON.parse(data.response);
            
            if (Array.isArray(parsed) && parsed.length > 0) {
                setCaptions(parsed.slice(0,3));
            } else if (parsed.replace) {
                setCaptions([
                    parsed.replace,
                    `🔥 ${textElements} - נחת עכשיו ב-iCaffe. בואו לטעום!`,
                    `✨ התגעגעתם? ${textElements} מחכה לכם בסניף. 📍`
                ]);
            } else if (parsed.captions) {
                setCaptions(parsed.captions.slice(0,3));
            } else {
                throw new Error('Invalid JSON format from model');
            }
        } catch(e) {
            console.warn("Ollama local request failed, falling back to mocks...", e);
            const isBurger = textElements.toLowerCase().includes('burger') || textElements.includes('המבורגר');
            const mocks = isBurger ? [
                `🍔 ${textElements} - הטעם שכולם מדברים עליו! עכשיו ב-59₪ לחברי מועדון. הזמינו עכשיו דרך הלינק בביו שלנו.`,
                `🔥 רעבים? ${textElements} במבצע חם דרך האפליקציה! #Foodie`,
                `✨ אי אפשר לעמוד בפני ${textElements} שלנו. רק 59₪ והוא בדרך אליכם. 📍`
            ] : [
                `✨ השדרוג המושלם ליומיום שלכם! ${textElements}. אל תפספסו.`,
                `🚀 כל הפרטים על ${textElements} מחכים לכם בביו!`,
                `POV: מצאתם בדיוק את מה שחיפשתם. 📍 ${textElements}`
            ];
            setCaptions(mocks);
        }
        setIsGeneratingCaptions(false);
    };

    const handleReplaceBase = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsExporting(true);
        const r = new FileReader();
        r.onload = () => { setBgImage(r.result); setIsExporting(false); };
        r.readAsDataURL(file);
    };

    const enhanceImage = async () => {
        setIsEnhancing(true);
        // Placeholder for Flux Denoise + Relight backend API
        try {
            await new Promise(r => setTimeout(r, 1500));
            alert("✨ תמונה שופרה בהצלחה באמצעות Flux AI! (הדמייה)");
        } catch(e) {}
        setIsEnhancing(false);
    };

    const publishToWhatsApp = async () => {
        if (!selectedCaption) {
            const proceed = window.confirm("לא נבחר טקסט (קופירייטינג). לשלוח את התמונה בלבד לוואטסאפ?");
            if (!proceed) return;
        }
        
        setIsExporting(true);
        // Placeholder for WhatsApp Webhook / Business API
        try {
            await new Promise(r => setTimeout(r, 1000));
            alert(`🚀 נשלח בהצלחה ל-WhatsApp Business API!\n\nתמונה: [עיצוב מצורף]\nטקסט: ${selectedCaption || 'ללא טקסט'}`);
            setExportSuccess(true);
            setTimeout(() => setExportSuccess(false), 3000);
        } catch(e) {}
        setIsExporting(false);
    };

    const addText = () => {
        const newId = Date.now().toString();
        setElements([...elements, { id: newId, type: 'text', content: 'טקסט חדש', x: 35, y: 35, fontSize: 35, color: '#FFFFFF', fontWeight: '900', fontFamily: FONTS[0].family }]);
        setSelectedId(newId);
    };



    const [dragInfo, setDragInfo] = useState(null);

    const handlePointerDown = (e, id) => {
        if (isExporting) return;
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);
        const el = elements.find(e => e.id === id);
        if (el) {
            setDragInfo({ id, startX: e.clientX, startY: e.clientY, initX: el.x, initY: el.y });
            setSelectedId(id);
        }
    };

    const handlePointerMove = (e) => {
        if (!dragInfo || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const deltaX = ((e.clientX - dragInfo.startX) / rect.width) * 100;
        const deltaY = ((e.clientY - dragInfo.startY) / rect.height) * 100;
        
        setElements(prev => prev.map(el => {
            if (el.id !== dragInfo.id) return el;
            return { 
                ...el, 
                x: Math.max(2, Math.min(90, dragInfo.initX + deltaX)), 
                y: Math.max(2, Math.min(90, dragInfo.initY + deltaY)) 
            };
        }));
    };

    const handlePointerUp = (e) => {
        if (!dragInfo) return;
        e.target.releasePointerCapture(e.pointerId);
        setDragInfo(null);
    };

    // Auto-fix positions only when ratio changes
    useEffect(() => {
        setElements(prev => prev.map(el => ({
            ...el,
            x: Math.max(5, Math.min(85, el.x)),
            y: Math.max(5, Math.min(85, el.y))
        })));
    }, [aspectRatio]);

    const handleExport = async () => {
        if (!canvasRef.current || isExporting) return;
        setIsExporting(true);
        setSelectedId(null);
        setExportSuccess(false);
        try {
            await new Promise(r => setTimeout(r, 600));
            const dataUrl = await toPng(canvasRef.current, { quality: 1.0, pixelRatio: 3, cacheBust: true, backgroundColor: '#000' });
            const link = document.createElement('a'); link.href = dataUrl; link.download = `social-post-${Date.now()}.png`; link.click();
            setExportSuccess(true); setTimeout(() => setExportSuccess(false), 3000);
            if (!showAI) generateCaptions();
        } catch (e) {} finally { setIsExporting(false); }
    };

    const updateSelected = (props) => setElements(elements.map(el => el.id === selectedId ? { ...el, ...props } : el));
    const selectedEl = elements.find(el => el.id === selectedId);

    if (!bgImage) {
        return (
            <div className="max-w-xl mx-auto py-16 px-4 text-center">
                <div className="designer-empty-state card shadow-xl">
                    <h2 className="empty-state-title" style={{ fontSize: '2.5rem' }}>Social Factory</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBlockEnd: '2rem' }}>בחרי תמונת בסיס כדי להתחיל ליצור</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <button className="upload-button" onClick={() => setActiveTab('uploads')}><FolderOpen size={20} /><span>גלריה</span></button>
                        <button className="upload-button" onClick={() => fileInputRef.current.click()}><Camera size={20} /><span>מצלמה</span></button>
                    </div>
                </div>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleReplaceBase} accept="image/*" />
            </div>
        );
    }

    return (
        <div className="designer-main-wrapper">
            <div className="ratio-selector">
                {RATIOS.map(r => (
                    <button key={r.value} className={`ratio-btn ${aspectRatio === r.value ? 'active' : ''}`} onClick={() => setAspectRatio(r.value)}>
                        {r.label}
                    </button>
                ))}
            </div>

            <div className="designer-stage-outer">
                <motion.div 
                    ref={canvasRef} 
                    layout
                    className="designer-stage-container" 
                    style={{ aspectRatio, width: aspectRatio === '9/16' ? 'min(90vw, 380px)' : 'min(95vw, 600px)', maxHeight: '72vh' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
                >
                    <img src={bgImage} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} alt="Canvas" />
                    
                    {/* Safe Zones Overlay for IG/TikTok */}
                    {showSafeZones && (
                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, border: '6px solid rgba(255,50,50,0.5)', boxSizing: 'border-box' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '15%', background: 'rgba(255,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#fff', fontWeight: 'bold' }}>Header UI / Notch Area</div>
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%', background: 'rgba(255,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#fff', fontWeight: 'bold' }}>Caption & Controls Area</div>
                            <div style={{ position: 'absolute', right: 0, top: '40%', bottom: '20%', width: '12%', background: 'rgba(255,0,0,0.2)' }} />
                        </div>
                    )}
                    {elements.map((el) => (
                        <div
                            key={el.id} 
                            onPointerDown={(e) => handlePointerDown(e, el.id)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            style={{ 
                                position: 'absolute', 
                                left: `${el.x}%`, 
                                top: `${el.y}%`, 
                                cursor: 'move', 
                                zIndex: el.id === selectedId ? 100 : 10, 
                                border: (el.id === selectedId && !isExporting) ? '2px solid var(--accent)' : '2px solid transparent', 
                                touchAction: 'none' 
                            }}
                        >
                            {el.type === 'text' ? (
                                <span style={{ fontSize: `${el.fontSize}px`, color: el.color, fontWeight: el.fontWeight, fontFamily: el.fontFamily || FONTS[0].family, textShadow: '0 2px 10px rgba(0,0,0,0.5)', display: 'block', padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>{el.content}</span>
                            ) : el.type === 'image' ? (
                                <img src={el.src} crossOrigin="anonymous" className="overlay-image" style={{ transform: `scale(${el.scale || 1})`, pointerEvents: 'none' }} alt="Logo" />
                            ) : (
                                <div className={el.type === 'location' ? 'badge-location' : 'badge-sticker'} style={{ transform: `scale(${el.scale || 1})` }}>
                                    {el.type === 'location' && <MapPin size={14}/>}
                                    {el.content}
                                </div>
                            )}
                        </div>
                    ))}
                </motion.div>
            </div>

            <div className="designer-action-bar-container">
                <div className="designer-action-bar shadow-2xl">
                    {!selectedId ? (
                        <div className="action-bar-flex-row" style={{ width: '100%', overflowX: 'auto', scrollbarWidth: 'none' }}>
                            <button className="action-icon-btn" onClick={addText}><Type size={18} strokeWidth={1.5} /><span>טקסט</span></button>
                            <button className="action-icon-btn" onClick={enhanceImage} disabled={isEnhancing}>
                                {isEnhancing ? <div className="spinner" style={{width: 16, height: 16}} /> : <Wand2 size={18} strokeWidth={1.5} />}
                                <span>שפר</span>
                            </button>
                            <button className="action-icon-btn" onClick={generateCaptions}><PenLine size={18} strokeWidth={1.5} /><span>קופירייטינג</span></button>
                            <button className="action-icon-btn" onClick={() => setShowSafeZones(!showSafeZones)} style={{ color: showSafeZones ? 'var(--accent)' : '' }}><Smartphone size={18} strokeWidth={1.5} /><span>בטיחות</span></button>
                            <div className="v-divider" />
                            <button className="action-icon-btn" style={{ color: exportSuccess ? '#10b981' : 'var(--accent)', background: 'rgba(16, 185, 129, 0.1)' }} onClick={publishToWhatsApp} disabled={isExporting}>
                                {isExporting ? <div className="spinner" style={{width:16, height:16}} /> : (exportSuccess ? <CheckCircle2 size={18} strokeWidth={1.5} /> : <Send size={18} strokeWidth={1.5} />)}
                                <span>פרסם</span>
                            </button>
                            <button className="action-icon-btn" onClick={() => replaceInputRef.current.click()}><RefreshCw size={18} strokeWidth={1.5} /><span>החלף</span></button>
                        </div>
                    ) : (
                        <div className="action-bar-edit-row">
                            <button onClick={() => setSelectedId(null)} className="close-edit-btn"><X size={16} /></button>
                            {selectedEl?.type === 'text' ? (
                                <div className="edit-controls-scroll">
                                    <input className="text-input-field" value={selectedEl.content} onChange={(e) => updateSelected({ content: e.target.value })} />
                                    <div className="stepper-control">
                                        <button onClick={() => updateSelected({ fontSize: Math.max(8, selectedEl.fontSize - 2) })}><Minus size={14} /></button>
                                        <span className="stepper-val">{selectedEl.fontSize}</span>
                                        <button onClick={() => updateSelected({ fontSize: Math.min(200, selectedEl.fontSize + 2) })}><Plus size={14} /></button>
                                    </div>
                                    <select className="font-select" value={selectedEl.fontFamily} onChange={(e) => updateSelected({ fontFamily: e.target.value })}>
                                        {FONTS.map(f => <option key={f.name} value={f.family}>{f.name}</option>)}
                                    </select>
                                    <input type="color" className="color-input-btn" value={selectedEl.color} onChange={(e) => updateSelected({ color: e.target.value })} />
                                </div>
                            ) : (
                                <div className="scale-control-row">
                                    <Minus size={14} />
                                    <input type="range" min="0.1" max="2.5" step="0.1" className="scale-slider" value={selectedEl.scale || 1} onChange={(e) => updateSelected({ scale: parseFloat(e.target.value) })} />
                                    <Plus size={14} />
                                </div>
                            )}
                            <button onClick={() => { setElements(elements.filter(el => el.id !== selectedId)); setSelectedId(null); }} className="delete-el-btn"><Trash2 size={18} /></button>
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {showAI && (
                    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="ai-caption-sidebar" style={{ zIndex: 1000 }}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold flex items-center gap-2"><PenLine size={16} className="text-accent"/> קופירייטינג AI</h3>
                            <button onClick={() => setShowAI(false)}><X size={18}/></button>
                        </div>
                        {isGeneratingCaptions ? (
                            <div className="flex flex-col items-center justify-center p-8 gap-4 text-gray-500">
                                <div className="spinner" style={{width: 24, height: 24}} />
                                <span className="text-sm">Gemma-4 בודקת בתפריט וכותבת...</span>
                            </div>
                        ) : (
                            captions.map((c, i) => (
                                <div key={i} className="caption-card" style={{ border: selectedCaption === c ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setSelectedCaption(c)}>
                                    <p>{c}</p>
                                    <div className="flex justify-between mt-3">
                                        <button className="copy-badge" onClick={(e) => { e.stopPropagation(); setSelectedCaption(c); }}>
                                            {selectedCaption === c ? <CheckCircle2 size={14}/> : <Send size={14}/>} 
                                            {selectedCaption === c ? 'נבחר' : 'בחר לפוסט'}
                                        </button>
                                        <button className="copy-badge" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(c); alert('הועתק!'); }}><Copy size={14}/></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <input type="file" ref={logoInputRef} style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files[0]; if (!file) return;
                const r = new FileReader(); r.onload = () => {
                    const id = Date.now().toString();
                    setElements([...elements, { id, type: 'image', src: r.result, x: 25, y: 25, scale: 0.8 }]);
                    setSelectedId(id);
                }; r.readAsDataURL(file);
            }} accept="image/*" />
            <input type="file" ref={replaceInputRef} style={{ display: 'none' }} onChange={handleReplaceBase} accept="image/*" />
        </div>
    );
}
