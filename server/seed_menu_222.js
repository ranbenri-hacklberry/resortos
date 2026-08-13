const BID = "22222222-2222-2222-2222-222222222222";
const url = "http://127.0.0.1:54321/rest/v1/menu_items";
const headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
};

const new_items = [
    // שתיה חמה
    { name: "אספרסו", category: "שתיה חמה", price: 10, business_id: BID, english_name: "Espresso" },
    { name: "קפה שחור", category: "שתיה חמה", price: 10, business_id: BID, english_name: "Black Coffee" },
    { name: "נס קפה של בית", category: "שתיה חמה", price: 10, business_id: BID, english_name: "House Nescafe" },
    { name: "נס על חלב", category: "שתיה חמה", price: 14, business_id: BID, english_name: "Nescafe on Milk" },
    { name: "קפה הפוך", category: "שתיה חמה", price: 14, business_id: BID, english_name: "Cappuccino" },
    { name: "אמריקנו חם", category: "שתיה חמה", price: 14, business_id: BID, english_name: "Hot Americano" },
    { name: "צ׳אי חם", category: "שתיה חמה", price: 14, business_id: BID, english_name: "Hot Chai" },
    
    // שתיה קרה
    { name: "אמריקנו קר", category: "שתיה קרה", price: 19, business_id: BID, english_name: "Cold Americano" },
    { name: "קפה קר", category: "שתיה קרה", price: 19, business_id: BID, english_name: "Cold Coffee" },
    { name: "צ׳אי קר", category: "שתיה קרה", price: 19, business_id: BID, english_name: "Cold Chai" },
    { name: "אייס קפה", category: "שתיה קרה", price: 19, business_id: BID, english_name: "Iced Coffee" },
    
    // ברדים
    { name: "ברד תות", category: "שתיה קרה", price: 15, business_id: BID, english_name: "Strawberry Slushie" },
    { name: "ברד פסיפלורה", category: "שתיה קרה", price: 15, business_id: BID, english_name: "Passionfruit Slushie" },
    { name: "ברד ענבים", category: "שתיה קרה", price: 15, business_id: BID, english_name: "Grape Slushie" },
    { name: "ברד מנגו", category: "שתיה קרה", price: 15, business_id: BID, english_name: "Mango Slushie" },
    { name: "ברד משמש", category: "שתיה קרה", price: 15, business_id: BID, english_name: "Apricot Slushie" },
    
    // שייקים
    { name: "שייק תות", category: "שייקים", price: 38, business_id: BID, english_name: "Strawberry Shake" },
    { name: "שייק בננה", category: "שייקים", price: 38, business_id: BID, english_name: "Banana Shake" },
    { name: "שייק מלון", category: "שייקים", price: 38, business_id: BID, english_name: "Melon Shake" },
    { name: "שייק תמר", category: "שייקים", price: 38, business_id: BID, english_name: "Date Shake" },
    { name: "שייק אננס", category: "שייקים", price: 38, business_id: BID, english_name: "Pineapple Shake" },
    
    // אוכל
    { name: "טוסט בהרכבה", category: "אוכל", price: 45, business_id: BID, english_name: "BYO Toast" },
    { name: "פיצה בהרכבה", category: "אוכל", price: 60, business_id: BID, english_name: "BYO Pizza" },
    { name: "כריך", category: "אוכל", price: 35, business_id: BID, english_name: "Sandwich" },
    { name: "סלט בהרכבה", category: "אוכל", price: 55, business_id: BID, english_name: "BYO Salad" },
    { name: "פופקורן", category: "אוכל", price: 10, business_id: BID, english_name: "Popcorn" },
    
    // קינוחים
    { name: "כדורי שוקולד (2 יחידות)", category: "קינוחים", price: 15, business_id: BID, english_name: "Chocolate Balls" },
    { name: "כדורי תמרים (2 יחידות)", category: "קינוחים", price: 15, business_id: BID, english_name: "Date Balls" },
    { name: "בראוניז", category: "קינוחים", price: 15, business_id: BID, english_name: "Brownies" },
    { name: "מאפינס", category: "קינוחים", price: 15, business_id: BID, english_name: "Muffins" },
    { name: "עוגת ביסקוויטים בגביע (150 סמ\"ק)", category: "קינוחים", price: 15, business_id: BID, english_name: "Biscuit Cake" },
    { name: "עוגיות (3 יחידות)", category: "קינוחים", price: 15, business_id: BID, english_name: "Cookies" }
];

async function run() {
    try {
        console.log("🗑️ Deleting old menu items...");
        const delRes = await fetch(`${url}?business_id=eq.${BID}`, {
            method: "DELETE",
            headers: headers
        });
        console.log(`Delete Status: ${delRes.status}`);

        console.log("🚀 Inserting new clean menu items...");
        const insRes = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(new_items)
        });
        console.log(`Insert Status: ${insRes.status}`);
        
        if (insRes.status < 300) {
            console.log(`✅ Successfully seeded ${new_items.length} menu items!`);
        } else {
            console.error("❌ Insertion failed!");
        }
    } catch (err) {
        console.error("❌ Network or Execution error:", err);
    }
}

run();
