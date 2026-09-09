import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Paperclip, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { brain } from '../lib/CoreAssistant';
import ActionCard from './ActionCard';

export default function Chat({ session, context, messages, setMessages }) {
    const { t } = useTranslation();
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef(null);
    const [aiContext, setAiContext] = useState(null); // Tracks persistent intent
    const activeProductRef = useRef(null);
    const [isMutating, setIsMutating] = useState(false);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const [dragActive, setDragActive] = useState(false);
    const [pendingFile, setPendingFile] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorder = useRef(null);
    const audioChunks = useRef([]);
    const [isLateNight, setIsLateNight] = useState(() => { const h = new Date().getHours(); return h >= 21 || h < 6; });

    const handleAudioUpload = (file) => {
        if (!file) return;
        setPendingFile(file); // Stage for hybrid input
    };

    const [showTrace, setShowTrace] = useState(false);
    const [traces, setTraces] = useState([]);

    // Hook into the brain's logging system
    useEffect(() => {
        const originalLog = brain.logTrace.bind(brain);
        brain.logTrace = (step, message, data) => {
            originalLog(step, message, data);
            setTraces(prev => [{ time: new Date().toLocaleTimeString(), step, message }, ...prev].slice(0, 20));
        };
        return () => { brain.logTrace = originalLog; };
    }, []);

    const userName = session?.user?.user_metadata?.full_name || 'רני';

    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
        });
    };

    const sendRecording = async (file) => {
        if (!file) return;
        setIsTyping(true);
        const streamId = crypto.randomUUID();
        const userMsgId = crypto.randomUUID();
        
        const botPlaceholder = { id: streamId, role: 'bot', content: '', isCompact: isLateNight };
        setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: '🥁 שומע ומנתח...', isAudio: true }, botPlaceholder]);
        
        try {
            // 1. Convert to Base64
            const base64Data = await blobToBase64(file);
            
            // 2. Direct Native Audio Processing
            const result = await brain.processAudioNative(base64Data, context);
            
            // 3. Update UI with the model's transcription
            setMessages(prev => prev.map(m => m.id === userMsgId ? { ...m, content: result.transcription } : m));

            // 4. Fire the resulting intent action (reuse the intent logic)
            const aiResponse = await brain.processIntent(result.transcription, context, aiContext, (token) => {
                setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: token } : m));
            }, null); // Query is now the transcription

            if (aiResponse) {
                if (aiResponse.action === 'apply_patch' && activeProductRef.current) {
                    activeProductRef.current.applyPatches(aiResponse.data.patches);
                    activeProductRef.current.setMutating(false);
                    setIsMutating(false);
                    setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: aiResponse.reply, action: null, actionData: null } : m));
                } else {
                    setMessages(prev => prev.map(m => m.id === streamId ? { 
                        ...m, 
                        content: aiResponse.reply, 
                        action: aiResponse.action, 
                        actionData: aiResponse.data 
                    } : m));
                }
            }
        } catch (e) {
            console.error(e);
            setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: 'Neural Audio Error. check local engine.' } : m));
        } finally {
            setIsTyping(false);
        }
    };

    // Initialize binary audio stream on mount
    useEffect(() => {
        const cleanup = brain.connectStream((text, isFinal) => {
            // Live-update the temporary user message bubble
            setMessages(prev => {
                const last = prev[prev.length - 2]; // The user audio placeholder
                if (last && last.isAudio) {
                    return prev.map((m, idx) => idx === prev.length - 2 ? { ...m, content: text } : m);
                }
                return prev;
            });
        });
        return () => { if (brain.socket) { brain.socket.onclose = null; brain.socket.close(); brain.socket = null; } };
    }, []);

    const handleMicClick = async () => {
        if (isRecording && mediaRecorder.current) {
            mediaRecorder.current.stop();
            setIsRecording(false);
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                
                // Use a standard mimeType that ffmpeg likes
                const options = { mimeType: 'audio/webm;codecs=opus' };
                mediaRecorder.current = new MediaRecorder(stream, options);
                
                const streamId = crypto.randomUUID();
                const userMsgId = crypto.randomUUID();
                
                // Pre-create bubbles for real-time feedback
                setMessages(prev => [...prev, 
                    { id: userMsgId, role: 'user', content: '🎙️ שומע...', isAudio: true },
                    { id: streamId, role: 'bot', content: '', isCompact: isLateNight }
                ]);

                mediaRecorder.current.ondataavailable = async (e) => {
                    if (e.data.size > 0) {
                        const buffer = await e.data.arrayBuffer();
                        brain.sendAudioChunk(buffer);
                    }
                };

                mediaRecorder.current.onstop = async () => {
                    stream.getTracks().forEach(track => track.stop());
                    setIsTyping(true);
                    
                    try {
                        // Get the transcription from the last user message
                        const currentMessages = messages;
                        const finalUserMsg = currentMessages.find(m => m.id === userMsgId) || { content: '' };
                        const transcription = finalUserMsg.content || '';
                        
                        // Build recent history for voice path
                        const recentMessages = currentMessages.slice(-6).filter(m => m.content).map(m => ({
                            role: m.role === 'user' ? 'user' : 'assistant',
                            content: m.content
                        }));
                        
                        const aiResponse = await brain.processIntent(transcription, context, aiContext, (token) => {
                            setMessages(ms => ms.map(m => m.id === streamId ? { ...m, content: token } : m));
                        }, null, recentMessages);
                        
                        if (aiResponse) {
                            if (aiResponse.action === 'apply_patch' && activeProductRef.current) {
                                activeProductRef.current.applyPatches(aiResponse.data.patches);
                                const updatedDraft = activeProductRef.current.getDraftState();
                                setAiContext(prev => ({ ...prev, data: updatedDraft }));
                                activeProductRef.current.setMutating(false);
                                setIsMutating(false);
                                setMessages(ms => ms.map(m => m.id === streamId ? { ...m, content: aiResponse.reply, action: null, actionData: null } : m));
                            } else {
                                setMessages(ms => ms.map(m => m.id === streamId ? { 
                                    ...m, 
                                    content: aiResponse.reply, 
                                    action: aiResponse.action, 
                                    actionData: aiResponse.data 
                                } : m));
                            }
                        }
                    } catch (err) {
                        console.error('Voice processing error:', err);
                        setMessages(ms => ms.map(m => m.id === streamId ? { ...m, content: 'שגיאה בעיבוד הקול. נסה שוב.' } : m));
                    } finally {
                        setIsTyping(false);
                        setIsMutating(false);
                        if (activeProductRef.current) activeProductRef.current.setMutating(false);
                    }
                };

                mediaRecorder.current.start(250); // Stream chunks every 250ms
                setIsRecording(true);
            } catch (err) {
                console.error("Mic Access Denied:", err);
            }
        }
    };

    const send = async () => {
        if ((!input.trim() && !pendingFile) || isTyping) return;
        
        const currentInput = input;
        const currentFile = pendingFile;
        const streamId = crypto.randomUUID();

        setInput('');
        setPendingFile(null);
        
        const userMsg = { id: crypto.randomUUID(), role: 'user', content: currentInput || (currentFile ? `🎙️ ${currentFile.name}` : '') };
        const botPlaceholder = { id: streamId, role: 'bot', content: '', isCompact: isLateNight };
        
        setMessages(prev => [...prev, userMsg, botPlaceholder]);
        setIsTyping(true);
        
        try {
            // ── Context Reset: allow user to exit product mode ──
            const resetKeywords = ['סיימתי', 'חזור', 'יציאה', 'ביטול', 'תחזור', 'exit', 'done', 'back'];
            if (aiContext?.type === 'product' && resetKeywords.some(k => currentInput.toLowerCase().includes(k))) {
                setAiContext(null);
                const reply = 'חזרתי למצב רגיל ✓';
                setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: reply } : m));
                setIsTyping(false);
                return;
            }

            // Prepare product context if active (no shimmer yet — LLM might ASK or ESCAPE)
            let effectiveContext = aiContext;
            if (aiContext?.type === 'product' && activeProductRef.current) {
                // Inject latest draftState so LLM sees current modifiers
                const currentDraft = activeProductRef.current.getDraftState();
                effectiveContext = { ...aiContext, data: currentDraft };
            }

            // Build recent message history for multi-turn wizard
            const recentMessages = messages.slice(-6).filter(m => m.content && m.content.trim()).map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content
            }));

            const aiResponse = await brain.processIntent(currentInput, context, effectiveContext, (token) => {
                setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: token } : m));
            }, currentFile, recentMessages);
            
            if (aiResponse) {
                console.log('🧠 aiResponse:', aiResponse.action, 'ref exists?', !!activeProductRef.current, 'patches:', aiResponse.data?.patches?.length);
                if (aiResponse.action === 'apply_patch' && activeProductRef.current) {
                    // Apply patches directly — no new card
                    activeProductRef.current.applyPatches(aiResponse.data.patches);
                    // Update context with new draftState for future mutations
                    const updatedDraft = activeProductRef.current.getDraftState();
                    setAiContext(prev => ({ ...prev, data: updatedDraft }));
                    setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: aiResponse.reply, action: null, actionData: null } : m));
                } else if (aiResponse.action === 'ask') {
                    // Wizard question — show as normal bubble, keep product context locked
                    setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: aiResponse.reply, action: null, actionData: null } : m));
                } else {
                    setMessages(prev => prev.map(m => m.id === streamId ? { 
                        ...m, 
                        content: aiResponse.reply, 
                        action: aiResponse.action, 
                        actionData: aiResponse.data 
                    } : m));
                }
            }
        } catch (e) {
            console.error(e);
            setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: 'Neural Bridge Error. check local engine.' } : m));
        } finally {
            setIsTyping(false);
            // Always reset mutation state (prevents stuck shimmer)
            setIsMutating(false);
            if (activeProductRef.current) activeProductRef.current.setMutating(false);
        }
    };

    // --- Today's inventory count ---
    const [todayInventory, setTodayInventory] = useState(null);
    const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

    useEffect(() => {
        if (!context?.businessId || context.businessId === 'dev') return;
        const today = new Date().getDay(); // 0=Sunday=ראשון
        const loadSchedule = async () => {
            try {
                const { data: schedule } = await supabase
                    .from('supplier_schedule')
                    .select('supplier_name')
                    .eq('business_id', context.businessId)
                    .eq('delivery_day', today);
                
                if (!schedule || schedule.length === 0) {
                    setTodayInventory({ suppliers: [], itemCount: 0, day: DAY_NAMES[today] });
                    return;
                }

                const supplierNames = schedule.map(s => s.supplier_name);
                
                // Count items for those suppliers
                const { data: items } = await supabase
                    .from('inventory_items')
                    .select('id, supplier')
                    .eq('business_id', context.businessId)
                    .in('supplier', supplierNames);
                
                // Also check alternative_suppliers
                const { data: altItems } = await supabase
                    .from('inventory_items')
                    .select('id, alternative_suppliers')
                    .eq('business_id', context.businessId)
                    .overlaps('alternative_suppliers', supplierNames);

                const allIds = new Set([...(items || []).map(i => i.id), ...(altItems || []).map(i => i.id)]);
                
                setTodayInventory({
                    suppliers: supplierNames,
                    itemCount: allIds.size,
                    day: DAY_NAMES[today]
                });
            } catch (e) {
                console.error('Schedule load error:', e);
            }
        };
        loadSchedule();
    }, [context?.businessId]);

    return (
        <div 
            className={`chat-container ${dragActive ? 'drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); handleAudioUpload(e.dataTransfer.files[0]); }}
        >
            {/* Neural Trace Overlay */}
            <AnimatePresence>
                {showTrace && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="neural-trace-panel"
                    >
                        <div className="trace-header">
                            <span>Neural Activity Trace</span>
                            <button onClick={() => setShowTrace(false)}>✕</button>
                        </div>
                        <div className="trace-content">
                            {traces.map((t, i) => (
                                <div key={`${t.time}-${t.step}-${i}`} className="trace-row">
                                    <span className="trace-time">[{t.time}]</span>
                                    <span className="trace-step">{t.step}</span>
                                    <span className="trace-msg">{t.message}</span>
                                </div>
                            ))}
                            {traces.length === 0 && <div className="p-4 opacity-50">No activity logged yet...</div>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="chat-header">
                <button 
                    className={`trace-toggle ${showTrace ? 'active' : ''}`}
                    onClick={() => setShowTrace(!showTrace)}
                >
                    <div className="pulse-dot" />
                    <span>Neural Activity</span>
                </button>
            </div>

            <div ref={scrollRef} className="chat-messages">
                {messages.length === 0 && (
                    <div className="empty-state" style={{ height: '60vh' }}>
                        <div className="empty-state-title">{isLateNight ? 'עבודה לילית נעימה, רני 🌙' : t('CHAT_EMPTY_TITLE')}</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBlockStart: '0.5rem' }}>
                            {isLateNight ? 'אפשר פשוט לגרור פה הודעות קוליות מהווטסאפ...' : t('CHAT_EMPTY_SUB')}
                        </div>

                        {/* Today's Inventory Widget */}
                        {todayInventory && (
                            <div style={{ marginTop: '1.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1rem 1.25rem', maxWidth: '380px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>📦 ספירת מלאי — יום {todayInventory.day}</span>
                                    {todayInventory.itemCount > 0 && (
                                        <span style={{ background: '#F59E0B', color: 'white', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                            {todayInventory.itemCount} פריטים
                                        </span>
                                    )}
                                </div>
                                {todayInventory.suppliers.length > 0 ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {todayInventory.suppliers.map(s => (
                                            <span key={s} style={{ background: 'rgba(245,158,11,0.1)', color: '#D97706', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600' }}>
                                                🚛 {s}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>אין אספקה מתוכננת היום ✨</div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <AnimatePresence initial={false}>
                    {messages.map((m, i) => (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={m.id || `msg-${i}`}
                            className={`chat-msg ${m.role === 'user' ? 'chat-msg-user' : 'chat-msg-bot'} ${m.isCompact ? 'compact-msg' : ''}`}
                        >
                            <div className="chat-msg-label">
                                {m.role === 'user' ? (m.isAudio ? `🎙️ ${userName}` : userName) : t('CHAT_BOT')}
                            </div>
                            <div className="chat-msg-body">
                                {m.role === 'bot' && m.content === '' 
                                    ? <span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
                                    : m.content
                                }
                            </div>
                            {m.action && m.actionData && (
                                <div className="mt-3">
                                    <ActionCard ref={m.action === 'product' || m.action === 'create_product' ? activeProductRef : undefined} type={m.action} data={m.actionData} context={context} isCompact={m.isCompact} onContextUpdate={(ctx) => setAiContext(ctx)} />
                                </div>
                            )}
                        </motion.div>
                    ))}
                    {/* Streaming bubble replaces static loader */}
                </AnimatePresence>
            </div>

            {pendingFile && (
                <div style={{ padding: '0.5rem 1rem', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem' }}>
                        🎙️ {pendingFile.name}
                        <button onClick={() => setPendingFile(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    </div>
                </div>
            )}

            <div className="chat-input-pill">
                <input 
                    type="file" 
                    id="audio-upload" 
                    style={{ display: 'none' }} 
                    accept="audio/*,video/*" 
                    onChange={(e) => handleAudioUpload(e.target.files[0])} 
                />
                <button className="icon-btn" onClick={() => document.getElementById('audio-upload').click()}><Paperclip size={20} /></button>
                <input
                    placeholder={isMutating ? '⏳ מעדכן...' : (isLateNight ? 'דבר אלי או גרור הודעה...' : t('CHAT_PLACEHOLDER'))}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && send()}
                    disabled={isMutating}
                />
                <button 
                    className={`icon-btn ${isRecording ? 'recording-pulse' : ''}`} 
                    onClick={handleMicClick}
                    style={{ color: isRecording ? '#ef4444' : 'inherit' }}
                >
                    <Mic size={20} />
                </button>
                <button className="send-btn" onClick={send}>
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
}
