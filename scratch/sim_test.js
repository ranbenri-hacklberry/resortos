
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function simulateAgent() {
    const text = "איזה סלטים יש לנו בתפריט ?";
    const systemPrompt = `Return ONLY JSON for iCaffeOS Studio. NOT A CHATBOT. 
    {"intent": "SEARCH_PRODUCT"|"SEARCH_INVENTORY"|"CREATE_PRODUCT"|"CHAT", "term": "..."}`;
    
    console.log(`[SIMULATION] Sending Input: "${text}"`);
    const start = Date.now();

    try {
        const response = await fetch("http://localhost:11434/api/generate", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "gemma4:e2b",
                prompt: `${systemPrompt}\n\nClient Input: "${text}"\nResult JSON: {`,
                stream: true,
                options: { 
                    temperature: 0, 
                    num_predict: 48, 
                    num_ctx: 1024, 
                    stop: ["}"]
                }
            })
        });

        let accumulated = '';
        const decoder = new TextDecoder();
        
        for await (const chunk of response.body) {
            const lines = decoder.decode(chunk).split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                const json = JSON.parse(line);
                if (json.response) accumulated += json.response;

                let testJson = accumulated.trim();
                if (!testJson.startsWith('{')) testJson = '{' + testJson;
                if (!testJson.endsWith('}')) testJson = testJson + '}';

                try {
                    const result = JSON.parse(testJson);
                    if (result && result.intent) {
                        const dur = ((Date.now() - start) / 1000).toFixed(2);
                        console.log(`\n[SUCCESS] Time: ${dur}s`);
                        console.log(`[RESULT] Intent: ${result.intent}`);
                        console.log(`[RESULT] Term: ${result.term}`);
                        process.exit(0);
                    }
                } catch (e) {}
            }
        }
    } catch (e) {
        console.error("[ERROR]", e.message);
    }
}

simulateAgent();
