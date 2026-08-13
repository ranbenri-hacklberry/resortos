import { supabase } from '../ContextBridge';
import { ASSISTANT_CONFIG } from './BotConfig';

class CoreAssistant {
    constructor() {
        this.config = ASSISTANT_CONFIG;
        this.lastIntent = null;

        this.socket = null;
        this.onTranscription = null;
    }

    logTrace(step, message, data = null) {
        console.log(`%c[AI Brain] %c${step}`, 'color: #10A37F; font-weight: bold;', 'color: #fff;', message, data || '');
    }

    // --- WebSocket Pipeline (Binary/No-Base64) ---
    connectStream(onTranscription) {
        this.onTranscription = onTranscription;
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

        this.socket = new WebSocket('ws://localhost:8070/v1/audio/stream');
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => this.logTrace('Audio Engine:', 'WebSocket Connected (Binary Mode)');
        this.socket.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'transcription' && this.onTranscription) {
                    this.onTranscription(data.text, data.is_final);
                }
            } catch (err) { console.error("Socket Message Error:", err); }
        };
        this.socket.onclose = () => {
            this.logTrace('Audio Engine:', 'Socket Closed. Retrying...');
            setTimeout(() => this.connectStream(onTranscription), 2500);
        };
        this.socket.onerror = (err) => console.error("WebSocket Error:", err);
    }

    sendAudioChunk(arrayBuffer) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(arrayBuffer);
        }
    }

    // --- ה-MOP (The Mop): מנקה רעשי שפה שמעמיסים על החיפוש ---
    _sanitizeHebrew(text) {
        if (!text) return "";
        const stopwords = new Set([
            'תראה', 'תציג', 'תביא', 'תפתח', 'תמצא', 'שלח',
            'לי', 'את', 'ה', 'בבקשה', 'יש', 'לנו', 'בתפריט',
            'שלנו', 'אני', 'רוצה', 'צריך', 'דחוף', 'חיפוש',
            'מה', 'איזה', 'כמה', 'האם', 'אפשר', 'תגיד',
            'של', 'עם', 'על', 'או', 'גם', 'רק', 'כל',
            'במלאי', 'בתפריט', 'שלנו', 'אצלנו',
            'מלאי', 'כמות', 'סטוק', 'מצב', 'סוג',
            // Prepositions
            'ל', 'ב', 'מ', 'אל',
            // Preposition combinations
            'למלאי', 'מהמלאי', 'במלאי',
            // Action verbs
            'תוסיף', 'תוריד', 'עדכן', 'להוסיף', 'להוריד', 'לעדכן', 'הוסף', 'הורד',
            // Units as stopwords
            'קילו', 'ק"ג', 'קג', 'גרם', 'גר', 'ליטר', 'ליטרים', 'מל', 'מ"ל',
            'יחידה', 'יחידות', 'יח', 'יח׳', 'קופסה', 'קופסא', 'קופסאות',
            'שקית', 'שקיות', 'חבילה', 'חבילות', 'מארז', 'מארזים', 'פחית', 'פחיות',
            'קרטון', 'קרטונים', 'בקבוק', 'בקבוקים', 'דלי', 'דלים', 'גליל', 'גלילים',
            'מטר', 'מטרים'
        ]);
        return text.toLowerCase()
            .replace(/[?!.,;:؟\u05C3]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 0 && !stopwords.has(word))
            .map(word => {
                // Strip leading 'ה' (definite article) if word length is greater than 3
                if (word.startsWith('ה') && word.length > 3) {
                    word = word.substring(1);
                }
                // Strip plural suffixes 'ות' or 'ים' to match singular forms (e.g. גבינות -> גבינ)
                if (word.length > 4) {
                    if (word.endsWith('ות')) {
                        word = word.substring(0, word.length - 2);
                    } else if (word.endsWith('ים')) {
                        word = word.substring(0, word.length - 2);
                    }
                }
                return word;
            })
            .filter(word => word.length > 0 && !stopwords.has(word))
            .join(' ')
            .trim();
    }

    // --- Product Mutation Handler (Conversational Agentic UI) ---
    async handleProductMutation(userText, productContext, userContext, onToken, recentMessages = []) {
        const product = productContext.data;
        const modSummary = this._buildModifierSummary(product.modifiers);
        
        // Build conversation history transcript
        const historyBlock = recentMessages.length > 0
            ? `\n--- CONVERSATION HISTORY ---\n${recentMessages.map(m => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`).join('\n')}\n--- END HISTORY ---\n`
            : '';
        
        const systemPrompt = `You are a POS menu editor for an Israeli café. Output ONLY valid JSON.
Product: ${product.name} | ₪${product.price} | ${product.category}
Current modifiers: ${modSummary}
${historyBlock}
OUTPUT FORMAT — choose ONE:

OPTION A — APPLY (you have group name + option names):
{"action":"APPLY","reply":"אישור בעברית","patches":[...]}
Patch ops: ADD_GROUP(name,requirement), ADD_OPTION(group,name,price), REMOVE_OPTION(group,option), REMOVE_GROUP(group), UPDATE_OPTION_PRICE(group,option,value), UPDATE_OPTION_NAME(group,option,value), SET_DEFAULT(group,option), UPDATE_FIELD(field,value)
Defaults: price=0, requirement="O". If group doesn't exist, add ADD_GROUP first.

OPTION B — ASK (you have NO idea what the user wants):
{"action":"ASK","reply":"שאלה קצרה","patches":[]}
Use ASK ONLY if the user said something vague like "הוסף אפשרויות" without ANY specifics.

OPTION C — ESCAPE (not about this product):
{"action":"ESCAPE","reply":"...","patches":[{"op":"ESCAPE_CONTEXT"}]}

CRITICAL RULES:
1. If the user provides option names (e.g. "רותח ופושר") — ALWAYS use APPLY. NEVER ask again.
2. If conversation history already contains group name from earlier messages — use it. Do NOT re-ask.
3. Do NOT interpret or judge the options. Just add them exactly as the user said.
4. Reply in Hebrew, under 15 words.

EXAMPLE:
History: USER asked to add temperature options. ASSISTANT asked which ones. USER says "רותח ופושר".
Correct output: {"action":"APPLY","reply":"הוספתי רותח ופושר לקבוצת טמפרטורה ✓","patches":[{"op":"ADD_GROUP","name":"טמפרטורה","requirement":"O"},{"op":"ADD_OPTION","group":"טמפרטורה","name":"רותח","price":0},{"op":"ADD_OPTION","group":"טמפרטורה","name":"פושר","price":0}]}`;

        this.logTrace('Product Mutation Router:', userText);
        
        try {
            const response = await fetch(this.config.OLLAMA_ENDPOINT, {
                signal: AbortSignal.timeout(60000),
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.OLLAMA_MODEL,
                    prompt: userText,
                    system: systemPrompt,
                    stream: false,
                    options: { temperature: 0.1, num_predict: 512 }
                })
            });
            
            const data = await response.json();
            let rawText = (data.response || '').trim();
            this.logTrace('LLM Raw Output:', rawText);
            
            // ── JSON Extraction: try direct parse first, then guardrail ──
            let parsed = null;
            try {
                // Strip markdown fences and thinking tags
                let cleanText = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
                cleanText = cleanText.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
                parsed = JSON.parse(cleanText);
            } catch (e) {
                // Fallback to regex-based extraction
                parsed = this._extractToolCallJSON(rawText);
            }
            
            if (!parsed || typeof parsed !== 'object') {
                if (onToken) onToken(rawText);
                return { reply: rawText, action: null };
            }
            
            // ── Escape Hatch ──
            if (parsed.action === 'ESCAPE' || parsed.patches?.some(p => p.op === 'ESCAPE_CONTEXT')) {
                this.logTrace('ESCAPE_CONTEXT triggered — falling through to normal pipeline');
                return this._fallThroughNormal(userText, userContext, onToken, null, recentMessages);
            }
            
            // ── ASK Mode: LLM needs more info ──
            if (parsed.action === 'ASK' || !parsed.patches || parsed.patches.length === 0) {
                const askReply = parsed.reply || 'מה בדיוק תרצה לשנות?';
                this.logTrace('Wizard ASK:', askReply);
                if (onToken) onToken(askReply);
                return { reply: askReply, action: 'ask', data: null };
            }
            
            // ── APPLY Mode: Execute patches ──
            const reply = parsed.reply || 'עודכן ✓';
            if (onToken) onToken(reply);
            return { reply, action: 'apply_patch', data: { patches: parsed.patches } };
            
        } catch (e) {
            this.logTrace('Product mutation error:', e.message);
            if (onToken) onToken('שגיאה בעיבוד הבקשה');
            return { reply: 'שגיאה בעיבוד הבקשה', action: null };
        }
    }

    async _fallThroughNormal(userText, userContext, onToken, file, recentMessages) {
        // Re-process without product context (null aiContext prevents re-entry)
        return this.processIntent(userText, userContext, null, onToken, file, recentMessages);
    }

    _extractToolCallJSON(rawText) {
        // Strip markdown code fences if present
        rawText = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
        // Strip thinking tags
        rawText = rawText.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
        
        // Attempt 1: Direct parse
        try {
            const obj = JSON.parse(rawText);
            if (obj && (Array.isArray(obj.patches) || obj.action === 'ASK' || obj.action === 'ESCAPE')) return obj;
        } catch (e) { /* fallback */ }
        
        // Attempt 2: Extract JSON object from surrounding text
        const jsonMatch = rawText.match(/\{[\s\S]*"patches"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
        if (jsonMatch) {
            try { return JSON.parse(jsonMatch[0]); } catch (e) { /* fallback */ }
        }
        
        // Attempt 3: Find any JSON object with op field
        const anyJson = rawText.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
        if (anyJson) {
            for (const candidate of anyJson) {
                try {
                    const obj = JSON.parse(candidate);
                    if (obj.patches || obj.op) return obj.patches ? obj : { reply: '', patches: [obj] };
                } catch (e) { continue; }
            }
        }
        
        return null;
    }

    _buildModifierSummary(modifiers) {
        let mods = modifiers;
        if (!mods) return 'No modifiers configured.';
        if (typeof mods === 'string') try { mods = JSON.parse(mods); } catch(e) { return 'Invalid'; }
        if (!Array.isArray(mods) && mods?.groups) mods = mods.groups;
        if (!Array.isArray(mods)) return 'Config object (not groups).';
        
        return mods.map(g => {
            const opts = (g.items || []).map(o => `${o.name}${o.price ? ` (₪${o.price})` : ''}${o.isDefault ? ' ★' : ''}`).join(', ');
            return `• ${g.name} [${g.requirement === 'R' ? 'required' : 'optional'}]: ${opts || 'empty'}`;
        }).join('\n');
    }

    // --- ה-Slot System: חילוץ נתונים מובנה מפקודות קוליות ---
    _parseSlots(text) {
        const slots = { action: 'UPDATE', item: '', amount: 0, spokenUnit: null };
        const clean = text.toLowerCase();
        
        const amountMatch = clean.match(/(\d+)/);
        if (amountMatch) slots.amount = parseInt(amountMatch[1]);

        if (clean.includes('תוסיף') || clean.includes('כניסה')) slots.action = 'ADD';
        if (clean.includes('תוריד') || clean.includes('יציאה') || clean.includes('חסר')) slots.action = 'SUBTRACT';

        if (clean.includes('קילו') || clean.includes('ק"ג') || clean.includes('קג')) {
            slots.spokenUnit = 'קילו';
        } else if (clean.includes('ליטר') || clean.includes('ליטרים')) {
            slots.spokenUnit = 'ליטר';
        }

        // Simply sanitize the query, _sanitizeHebrew will clean up all action keywords, units and noise!
        slots.item = this._sanitizeHebrew(clean.replace(/\d+/g, '').trim());
        return slots;
    }

    async processIntent(query, userContext, aiContext, onToken, file, recentMessages) {
        const targetQuery = (query || '').trim();
        const lowerQ = targetQuery.toLowerCase();
        
        // ── PRODUCT CONTEXT ROUTER ──
        if (aiContext?.type === 'product' && aiContext?.data) {
            return this.handleProductMutation(targetQuery, aiContext, userContext, onToken, recentMessages || []);
        }

        // Slot System Check for Inventory UPDATES only (not queries)
        if (['תוסיף', 'תוריד', 'עדכן'].some(k => lowerQ.includes(k))) {
            const slots = this._parseSlots(targetQuery);
            if (slots.item) {
                this.logTrace('Slot System:', `Action: ${slots.action}, Item: ${slots.item}, Amt: ${slots.amount}`);
                const results = await this.queryInventory(slots.item, userContext);
                
                // If we found exactly one match and we have a quantity, offer direct confirmation card
                if (results.length === 1 && slots.amount > 0) {
                    const match = results[0];
                    let finalAmount = slots.amount;
                    
                    // Smart unit conversion: spoken 'kilo' to database 'gram'
                    if (slots.spokenUnit === 'קילו' && (match.unit === 'גרם' || match.unit === 'גר')) {
                        finalAmount = slots.amount * 1000;
                    }
                    // Smart unit conversion: spoken 'liter' to database 'ml'
                    else if (slots.spokenUnit === 'ליטר' && (match.unit === 'מ"ל' || match.unit === 'מל')) {
                        finalAmount = slots.amount * 1000;
                    }

                    const amount = slots.action === 'SUBTRACT' ? -finalAmount : finalAmount;
                    const amountStr = (slots.spokenUnit === 'קילו' || slots.spokenUnit === 'ליטר') && finalAmount >= 1000 ? `${slots.amount} ${slots.spokenUnit === 'קילו' ? 'ק"ג' : 'ליטר'}` : `${finalAmount} ${match.unit || 'יח׳'}`;
                    const amountText = slots.action === 'SUBTRACT' ? `-${amountStr}` : `+${amountStr}`;
                    
                    const reply = `מצאתי את הפריט "${match.name}". האם ברצונך לאשר את העדכון של ${amountText} (${slots.action === 'SUBTRACT' ? '-' : '+'}${finalAmount} ${match.unit || 'יח׳'})?`;
                    if (onToken) onToken(reply);
                    return { 
                        reply, 
                        action: 'inventory_confirm', 
                        data: { 
                            item_name: match.name, 
                            amount: amount, 
                            unit: match.unit 
                        } 
                    };
                }
                
                const reply = `מערכת הסלוטים זיהתה: ${slots.item}. פעולה: ${slots.action}. כמות: ${slots.amount}.`;
                if (onToken) onToken(reply);
                return { reply, action: 'inventory_view', data: { items: results, slots } };
            }
        }

        // Inventory QUERY fast path (כמה X יש במלאי?)
        if (['מלאי', 'כמות', 'סטוק', 'stock'].some(k => lowerQ.includes(k))) {
            const cleanTerm = this._sanitizeHebrew(targetQuery);
            this.logTrace('Inventory Query:', cleanTerm);
            const results = await this.queryInventory(cleanTerm, userContext);
            if (results.length > 0) {
                const reply = `להלן מצב המלאי עבור "${cleanTerm}":`;
                if (onToken) onToken(reply);
                return { reply, action: 'inventory_view', data: { items: results, term: cleanTerm } };
            } else {
                const reply = `לא מצאתי "${cleanTerm}" במלאי.`;
                if (onToken) onToken(reply);
                return { reply, action: null };
            }
        }

        const cleanQuery = this._sanitizeHebrew(targetQuery);

        this.logTrace('Input Received:', targetQuery);

        // 1. GREETING BYPASS
        if (['היי', 'שלום', 'אהלן', 'בוקר טוב', 'סטטוס'].includes(lowerQ)) {
            const reply = "M4 Engine Online. סטודיו מוכן, רני. מה על הפרק?";
            if (onToken) onToken(reply);
            return { reply, action: 'status_ok' };
        }

        // 2. CONTEXTUAL RECOVERY (The "Salads" Fix)
        // If we just failed a search or the user provides a single word
        if (cleanQuery.split(' ').length === 1 && (this.lastIntent === 'SEARCH_PRODUCT' || this.lastIntent === 'CHAT')) {
            this.logTrace('Context Recovery:', `Single word detected: ${cleanQuery}`);
            const results = await this.queryProducts(targetQuery, userContext);
            if (results.length > 0) return this._handleSearchResults(results, targetQuery, onToken);
        }

        // 3. FAST-PATH LOGIC (No AI needed for direct searches)
        const menuKeywords = [
            'סלט', 'שתיה', 'קפה', 'קינוח', 'המבורגר', 'מנה', 'מנות',
            'שוקולד', 'עוגה', 'עוגת', 'מאפה', 'פיצה', 'פסטה', 'סופלה',
            'לחם', 'טוסט', 'סנדוויץ', 'מרק', 'תה', 'מילקשייק', 'לימונדה',
            'בירה', 'יין', 'ארוחה', 'תפריט', 'אוכל', 'פריט', 'מתוק',
            'שתייה', 'שייק', 'ברד'
        ];
        if (lowerQ.length > 0 && lowerQ.length < 60 && menuKeywords.some(k => lowerQ.includes(k))) {
            this.logTrace('Fast Path Triggered:', targetQuery);
            
            // ── CATEGORY-FIRST STRATEGY: match by category column before vector search ──
            // Extract potential category from the RAW query (before sanitization) to avoid broken stems
            const rawLower = targetQuery.toLowerCase();
            const categoryMap = {
                'שתייה חמה': 'שתיה חמה', 'שתיה חמה': 'שתיה חמה', 'חמה': 'שתיה חמה',
                'שתייה קרה': 'שתיה קרה', 'שתיה קרה': 'שתיה קרה', 'קרה': 'שתיה קרה',
                'קינוחים': 'קינוחים', 'קינוח': 'קינוחים',
                'שייקים': 'שייקים', 'שייק': 'שייקים',
                'סלטים': 'אוכל', 'סלט': 'אוכל',
                'אוכל': 'אוכל', 'מנות': null, 'תפריט': null,
            };
            let categoryMatch = null;
            for (const [keyword, catName] of Object.entries(categoryMap)) {
                if (rawLower.includes(keyword) && catName) {
                    categoryMatch = catName;
                    break;
                }
            }

            if (categoryMatch) {
                this.logTrace('Category Match:', categoryMatch);
                try {
                    let q = supabase.from('menu_items').select('*').ilike('category', `%${categoryMatch}%`);
                    if (userContext?.businessId) q = q.eq('business_id', userContext.businessId);
                    const { data: catResults } = await q.order('name').limit(15);
                    if (catResults && catResults.length > 0) {
                        return this._handleSearchResults(catResults, categoryMatch, onToken);
                    }
                } catch (e) {
                    this.logTrace('Category search failed, falling back to vector:', e.message);
                }
            }

            // Fallback to vector search
            const results = await this.queryProducts(targetQuery, userContext);
            if (results.length > 0) return this._handleSearchResults(results, targetQuery, onToken);
        }

        // 4. NEURAL PATH (The Optimized LLM Call)
        try {
            const intentPayload = await this.getNeuralIntent(targetQuery);
            this.lastIntent = intentPayload.intent;
            const term = intentPayload.term || cleanQuery;

            if (intentPayload.intent === 'SEARCH_PRODUCT') {
                const results = await this.queryProducts(term, userContext);
                return this._handleSearchResults(results, term, onToken);
            }

            if (intentPayload.intent === 'SEARCH_INVENTORY') {
                const results = await this.queryInventory(term, userContext);
                const reply = results.length > 0 ? `להלן מצב המלאי עבור "${term}":` : `לא מצאתי "${term}" במלאי.`;
                if (onToken) onToken(reply);
                return { reply, action: 'inventory_view', data: { items: results, term } };
            }

            if (intentPayload.intent === 'SEARCH_TASK') {
                const results = await this.queryTasks(term, userContext);
                const reply = results.length > 0 ? `מצאתי ${results.length} משימות עבור "${term}":` : `לא מצאתי משימות שקשורות ל"${term}".`;
                if (onToken) onToken(reply);
                return { reply, action: 'task_view', data: { items: results, term } };
            }

            if (intentPayload.intent === 'SEARCH_RECIPE') {
                const results = await this.queryRecipes(term, userContext);
                const reply = results.length > 0 ? `מצאתי ${results.length} מתכונים עבור "${term}":` : `לא מצאתי מתכונים עבור "${term}".`;
                if (onToken) onToken(reply);
                return { reply, action: 'recipe_view', data: { items: results, term } };
            }

            if (intentPayload.intent === 'CREATE_TASK') {
                const reply = `פתחתי טופס משימה עבור: ${term}`;
                if (onToken) onToken(reply);
                return { reply, action: 'create_task', data: { title: term, business_id: userContext?.businessId } };
            }

            // Fallback to conversation
            return this.callLLM(targetQuery, onToken);

        } catch (e) {
            console.error("BRAIN CRASH:", e);
            return { reply: "משהו נתקע ב-M4. נסה שוב?", action: null };
        }
    }

    _handleSearchResults(results, term, onToken) {
        this.lastIntent = 'SEARCH_PRODUCT';
        if (results.length === 0) {
            const reply = `חיפשתי "${term}" ולא מצאתי כלום בתפריט.`;
            if (onToken) onToken(reply);
            return { reply, action: null };
        }

        // Exact name match → open directly
        const normTerm = (term || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const exactMatch = results.find(r => (r.name || '').trim().toLowerCase() === normTerm);
        if (exactMatch) {
            const reply = `מצאתי את המנה: ${exactMatch.name}`;
            if (onToken) onToken(reply);
            return { reply, action: 'product', data: exactMatch };
        }

        // If top result is much stronger than the rest, open it directly
        if (results.length >= 2 && results[0].similarity && results[1].similarity) {
            const gap = results[0].similarity - results[1].similarity;
            if (gap > 0.15 && results[0].similarity > 0.75) {
                const reply = `מצאתי את המנה: ${results[0].name}`;
                if (onToken) onToken(reply);
                return { reply, action: 'product', data: results[0] };
            }
        }

        if (results.length === 1) {
            const reply = `מצאתי את המנה: ${results[0].name}`;
            if (onToken) onToken(reply);
            return { reply, action: 'product', data: results[0] };
        }
        const reply = `מצאתי ${results.length} פריטים עבור "${term}":`;
        if (onToken) onToken(reply);
        return { reply, action: 'catalog_view', data: { items: results, term } };
    }

    async getNeuralIntent(text) {
        const startTime = performance.now();
        // Minimizing the prompt to save tokens and latency
        const systemPrompt = `Analyze POS intent. Output JSON ONLY.
        Intents: SEARCH_PRODUCT, SEARCH_INVENTORY, SEARCH_TASK, SEARCH_RECIPE, CREATE_TASK, CHAT.
        Rules:
        - Use SEARCH_PRODUCT for menu items/food/drinks.
        - Use SEARCH_INVENTORY for raw stock/inventory levels.
        - Use CHAT for general talk.
        Examples:
        "כמה קפה נשאר" -> {"intent": "SEARCH_INVENTORY", "term": "קפה"}
        "מה המשימות להיום" -> {"intent": "SEARCH_TASK", "term": "היום"}
        "איך מכינים לאטה" -> {"intent": "SEARCH_RECIPE", "term": "לאטה"}`;

        try {
            const response = await fetch(this.config.OLLAMA_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.OLLAMA_MODEL,
                    prompt: `${systemPrompt}\nInput: "${text}"\nJSON:`,
                    stream: false,
                    keep_alive: -1, // Keep in VRAM for M4 performance
                    options: {
                        temperature: 0,
                        num_predict: 64, // We only need a short JSON
                        num_ctx: 1024,
                        stop: ["}"] // Kill inference early
                    }
                })
            });

            const data = await response.json();
            let rawText = data.response || '';
            // Strip thinking tags if present
            rawText = rawText.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
            if (!rawText.endsWith('}')) rawText += '}';
            
            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            this.logTrace(`Intent Extraction in ${duration}s`, rawText);

            const jsonMatch = rawText.match(/\{.*?\}/s);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { intent: "CHAT" };
        } catch (e) {
            return { intent: "CHAT" };
        }
    }

    // --- Vector-Powered Search (via Zoe Engine) ---
    async queryProducts(term, context) {
        // Light cleanup only — do NOT use _sanitizeHebrew (it strips 'ה' and breaks names like 'הפוך')
        const cleanTerm = (term || '').replace(/[?!.,;:؟\u05C3]/g, '').trim();
        if (!cleanTerm) return [];

        this.logTrace('Vector Search (menu):', cleanTerm);

        // 1. Try exact name match first (fast Supabase lookup)
        try {
            let exactQ = supabase.from('menu_items').select('*').ilike('name', cleanTerm);
            if (context?.businessId) exactQ = exactQ.eq('business_id', context.businessId);
            const { data: exactResults } = await exactQ.limit(1);
            if (exactResults && exactResults.length === 1) {
                this.logTrace('Exact DB Match:', exactResults[0].name);
                return exactResults;
            }
        } catch (e) { /* continue to vector */ }

        // 2. Vector search
        try {
            const res = await fetch(`${this.config.ZOE_ENGINE}/v1/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: cleanTerm,
                    table: 'menu_items',
                    business_id: context?.businessId || null,
                    threshold: 0.50,
                    limit: 6
                })
            });
            const data = await res.json();
            this.logTrace(`Vector: ${data.total_ms}ms`, `${data.results?.length || 0} results`);
            return data.results || [];
        } catch (e) {
            // Fallback to ilike if Zoe Engine is down
            this.logTrace('Vector Fallback:', 'Using ilike');
            let query = supabase.from('menu_items').select('*');
            if (context?.businessId) query = query.eq('business_id', context.businessId);
            const keywords = cleanTerm.split(' ').filter(k => k.length > 1);
            const orConditions = keywords.map(k => `name.ilike.%${k}%,category.ilike.%${k}%`).join(',');
            const { data } = await query.or(orConditions).limit(10);
            return data || [];
        }
    }

    async queryInventory(term, context) {
        const cleanTerm = this._sanitizeHebrew(term);
        if (!cleanTerm) return [];

        this.logTrace('Inventory Query (category check):', cleanTerm);
        try {
            // First, check for direct category match (e.g. תבלינים, ירקות, שימורים)
            let catQuery = supabase.from('inventory_items').select('*');
            if (context?.businessId) catQuery = catQuery.eq('business_id', context.businessId);
            catQuery = catQuery.ilike('category', `%${cleanTerm}%`);
            const { data: catResults } = await catQuery.limit(15);
            
            if (catResults && catResults.length > 0) {
                this.logTrace('Category Match Found:', `${catResults.length} items`);
                return catResults;
            }
        } catch (catErr) {
            this.logTrace('Category Match Error:', catErr.message);
        }

        this.logTrace('Vector Search (inventory):', cleanTerm);
        try {
            const res = await fetch(`${this.config.ZOE_ENGINE}/v1/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: cleanTerm,
                    table: 'inventory_items',
                    business_id: context?.businessId || null,
                    threshold: 0.55,
                    limit: 10
                })
            });
            const data = await res.json();
            let results = data.results || [];
            
            // Deduplicate by name (keep highest similarity)
            const seen = new Map();
            for (const item of results) {
                const key = (item.name || '').trim();
                if (!seen.has(key) || item.similarity > seen.get(key).similarity) {
                    seen.set(key, item);
                }
            }
            results = Array.from(seen.values());
            
            // Exact match priority: if any item name matches the search term exactly
            const exactMatches = results.filter(r => 
                (r.name || '').trim() === cleanTerm || 
                cleanTerm.includes((r.name || '').trim()) ||
                (r.name || '').trim().includes(cleanTerm)
            );
            
            if (exactMatches.length > 0 && exactMatches.length < results.length) {
                // Mark remaining as "suggestions" for the UI
                exactMatches._hasMore = results.length - exactMatches.length;
                return exactMatches;
            }
            
            return results;
        } catch (e) {
            // Fallback to ilike (search both name and category)
            let query = supabase.from('inventory_items').select('*');
            if (context?.businessId) query = query.eq('business_id', context.businessId);
            if (cleanTerm) {
                query = query.or(`name.ilike.%${cleanTerm}%,category.ilike.%${cleanTerm}%`);
            }
            const { data } = await query.limit(15);
            return data || [];
        }
    }

    async queryTasks(term, context) {
        const cleanTerm = this._sanitizeHebrew(term);
        this.logTrace('Vector Search (tasks):', cleanTerm || 'all');
        try {
            // Search BOTH tables: personal (tasks) + team (recurring_tasks)
            const [personalRes, teamRes] = await Promise.all([
                fetch(`${this.config.ZOE_ENGINE}/v1/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: cleanTerm || term, table: 'tasks', business_id: context?.businessId || null, threshold: 0.4, limit: 5 })
                }),
                fetch(`${this.config.ZOE_ENGINE}/v1/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: cleanTerm || term, table: 'recurring_tasks', business_id: context?.businessId || null, threshold: 0.4, limit: 5 })
                })
            ]);
            const personal = (await personalRes.json()).results || [];
            const team = (await teamRes.json()).results || [];
            // Tag results for UI distinction
            personal.forEach(t => t._source = 'personal');
            team.forEach(t => t._source = 'team');
            return [...personal, ...team];
        } catch (e) {
            let query = supabase.from('tasks').select('*');
            if (context?.businessId) query = query.eq('business_id', context.businessId);
            if (cleanTerm) query = query.ilike('title', `%${cleanTerm}%`);
            const { data } = await query.limit(10);
            return data || [];
        }
    }

    async queryRecipes(term, context) {
        const cleanTerm = this._sanitizeHebrew(term);
        this.logTrace('Vector Search (recipes):', cleanTerm || 'all');
        try {
            const res = await fetch(`${this.config.ZOE_ENGINE}/v1/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: cleanTerm || term,
                    table: 'recipes',
                    business_id: context?.businessId || null,
                    threshold: 0.35,
                    limit: 5
                })
            });
            const data = await res.json();
            return data.results || [];
        } catch (e) {
            let query = supabase.from('recipes').select('*');
            if (context?.businessId) query = query.eq('business_id', context.businessId);
            if (cleanTerm) query = query.ilike('title', `%${cleanTerm}%`);
            const { data } = await query.limit(5);
            return data || [];
        }
    }

    async callLLM(message, onToken) {
        this.logTrace('RAG Pipeline...', message);
        
        // Step 1: Try RAG-grounded response first
        try {
            const ragRes = await fetch(`${this.config.ZOE_ENGINE}/v1/rag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: message, table: 'menu_items', threshold: 0.35 })
            });
            const ragData = await ragRes.json();
            
            if (ragData.rag?.grounded) {
                // Use RAG-grounded prompt for Gemma
                this.logTrace('Neural Thinking...', `Generating grounded response via ${this.config.OLLAMA_MODEL}`);
                const res = await fetch(this.config.OLLAMA_ENDPOINT, {
                    signal: AbortSignal.timeout(60000), // Increased to 60s
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.config.OLLAMA_MODEL,
                        prompt: ragData.rag.prompt,
                        stream: true,
                        keep_alive: -1,
                        options: { temperature: 0.1, num_predict: 256, num_ctx: 2048 }
                    })
                });
                const streamResult = await this._streamResponse(res, onToken);
                
                // Fail-safe: If LLM failed but we have RAG results, show them anyway!
                if (!streamResult.reply || streamResult.reply.includes('הופסקה')) {
                    this.logTrace('LLM Timeout/Fail:', 'Showing raw search results as fallback');
                    return this._handleSearchResults(ragData.results, message, onToken);
                }
                return streamResult;

            } else if (ragData.rag?.fallback) {
                // Anti-hallucination: no context found, return safe fallback
                const reply = ragData.rag.fallback;
                if (onToken) onToken(reply);
                return { reply, action: null };
            }
        } catch (e) {
            this.logTrace('RAG Unavailable:', 'Falling back to raw LLM');
        }
        
        // Step 2: Raw LLM fallback (no RAG context)
        try {
            const res = await fetch(this.config.OLLAMA_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.OLLAMA_MODEL,
                    prompt: `${this.config.SYSTEM_PROMPTS.GENERIC_FALLBACK}\nUser: ${message}\nAssistant:`,
                    stream: true,
                    keep_alive: -1
                })
            });
            return this._streamResponse(res, onToken);
        } catch (e) { return { reply: "מנוע השיחה לא זמין.", action: null }; }
    }

    async _streamResponse(res, onToken) {
        if (!res.ok) {
            const err = await res.text();
            this.logTrace('LLM Error:', err);
            return { reply: "מנוע השיחה החזיר שגיאה. בדוק את אולמה.", action: null };
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.response) {
                            full += json.response;
                            if (onToken) onToken(full);
                        }
                    } catch (e) { }
                }
            }
        } catch (e) {
            this.logTrace('Stream Interrupted:', e.message);
        }
        return { reply: full || "התגובה הופסקה באמצע.", action: null };
    }

    async generateVision(prompt, mode = 'fast') {
        try {
            const res = await fetch('http://100.127.14.15:5001/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, steps: 4, mode: mode })
            });
            if (!res.ok) throw new Error('Image gen failed');
            const data = await res.json();
            return { type: 'image', url: data.image_url || data.url, prompt };
        } catch (e) {
            console.error('[Vision Engine Error]', e);
            throw e;
        }
    }

    async checkVisionServerStatus() {
        try {
            const res = await fetch('http://100.127.14.15:5001/progress', { signal: AbortSignal.timeout(3000) });
            if (!res.ok) return 0;
            const data = await res.json();
            return data.progress || 0;
        } catch (e) { return 0; }
    }

    // --- Audio Processing (Native endpoint) ---
    async processAudioNative(base64Audio, userContext) {
        try {
            const res = await fetch(`${this.config.ZOE_ENGINE}/v1/audio/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio: base64Audio })
            });
            if (!res.ok) throw new Error(`Audio transcribe failed: ${res.status}`);
            const data = await res.json();
            return { transcription: data.text || data.transcription || '' };
        } catch (e) {
            this.logTrace('Audio Native Error:', e.message);
            return { transcription: '' };
        }
    }

    // --- Image Generation ---
    async generateProductImage(productName, style = 'product_photo') {
        try {
            const res = await fetch('http://100.112.253.49:5001/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: productName, style })
            });
            if (!res.ok) throw new Error(`Image gen failed: ${res.status}`);
            const data = await res.json();
            return data.url || data.image_url || null;
        } catch (e) {
            this.logTrace('Image Gen Error:', e.message);
            return null;
        }
    }

    async checkImageProgress() {
        try {
            const res = await fetch('http://100.112.253.49:5001/progress', { signal: AbortSignal.timeout(3000) });
            if (!res.ok) return 0;
            const data = await res.json();
            return data.progress || 0;
        } catch (e) { return 0; }
    }
}

export const brain = new CoreAssistant();