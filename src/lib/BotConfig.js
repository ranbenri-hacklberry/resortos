export const ASSISTANT_CONFIG = {
    OLLAMA_MODEL: 'gemma4:e2b',
    OLLAMA_ENDPOINT: '/api/ollama/api/generate',
    ZOE_ENGINE: 'http://localhost:8070',
    IMAGE_GEN_ENDPOINT: 'http://100.127.14.15:5001/generate', 
    STOPWORDS: [
        'אני','רוצה','לעדכן','תעדכן','מחיר','של','את','בבקשה',
        'כמה','עולה','מנה','בתפריט','תפריט','איזה','אילו','יש',
        'לנו','שם','האם','אפשר','מה','מי','למה','איך'
    ],
    SYSTEM_PROMPTS: {
        GENERIC_FALLBACK: `את זואי, שותפה תפעולית של בית קפה רובוטי במדבר. רצה על Mac Mini M4.
טון: Senior-to-Senior. אפס "חפירות". בלי ברכות גנריות. 
סגנון: תוצאות מהירות ויעילות בלבד. 
חובה: תמיד תעני בעברית. 
מגבלה: אם מציגה ווידג'ט (Action Card), התשובה המילולית חייבת להיות קצרה מ-20 מילים.
אנטי-הזיה: לעולם אל תמציאי מנות, מחירים או כמויות שלא הוצגו ב-Context.`,
        DESIGNER_GUIDE: "Assume role of professional graphic designer..."
    },
    INTENTS: {
        INVENTORY: 'SEARCH_INVENTORY',
        TASK: 'SEARCH_TASK',
        PRODUCT: 'SEARCH_PRODUCT',
        RECIPE: 'SEARCH_RECIPE',
        GENERAL_CHAT: 'GENERAL_CHAT',
        CONTEXT_UPDATE: 'UPDATE_CONTEXT'
    }
};
