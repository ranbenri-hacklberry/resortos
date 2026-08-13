// Using native fetch from Node 25
import { ASSISTANT_CONFIG } from '../src/lib/BotConfig.js';

async function testNeuralBrain(query) {
    console.log(`\n--- Testing Query: "${query}" ---`);
    
    const systemPrompt = `You are the Neural Intent Engine for iCaffeOS. Your job is to classify user requests.
Determine the intent and extract the subject.

INTENTS:
- 'SEARCH_PRODUCT': User asks for menu items, prices, descriptions, or a category (e.g., "show me salads", "how much is coffee").
- 'SEARCH_INVENTORY': User asks about stock, ingredients, or supplies.
- 'SEARCH_TASK': User asks about manager tasks.
- 'CONTEXT_UPDATE': User wants to change a price or value.
- 'GENERAL_CHAT': Greetings, social talk, or general questions.

Return ONLY a JSON object.`;

    try {
        const res = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            body: JSON.stringify({ 
                model: 'gemma4:e2b', 
                prompt: `${systemPrompt}\nUser says: "${query}"\nJSON:`, 
                stream: false 
            })
        });
        const data = await res.json();
        console.log("LLM Raw Response:", data.response);
        
        try {
            const cleanJson = data.response.match(/\{.*\}/s)[0];
            const parsed = JSON.parse(cleanJson);
            console.log("Final Intent Object:", JSON.stringify(parsed, null, 2));
        } catch (je) {
            console.error("JSON Parse Error. Raw response from LLM was not valid JSON.");
        }
    } catch (e) {
        console.error("Connection Error:", e.message);
    }
}

const queries = [
    "היי",
    "איזה סלטים יש לנו?",
    "מה יש במשקאות חמים?",
    "תוריד את המחיר של האספרסו ב-2 שקל"
];

async function runTests() {
    for (const q of queries) {
        await testNeuralBrain(q);
    }
}

runTests();
