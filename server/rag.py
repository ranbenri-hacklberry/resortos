"""
Zoe RAG Engine — Anti-Hallucination Pipeline (FULL)
Builds grounded prompts from vector search results.
Supports: menu_items, inventory, tasks, recurring_tasks, recipes.
If no relevant context found → blocks Gemma entirely.
"""

SIMILARITY_THRESHOLD = 0.35

RAG_SYSTEM_PROMPT = """את זואי, שותפה תפעולית של בית קפה רובוטי במדבר.
ענה אך ורק על סמך הנתונים שמופיעים בסקשן [CONTEXT].
אם אין בנתונים תשובה מספקת — אמור "אין לי מידע מדויק על זה".
לעולם אל תמציאי מנות, מחירים, כמויות מלאי, משימות או מתכונים.
טון: Senior-to-Senior. קצר, יעיל, מקצועי. עברית בלבד.

[CONTEXT]
{context}

[USER]
{user_query}

[RESPONSE]"""


def format_result(r: dict) -> str:
    """Format a single search result into a readable context line."""
    sim = r.get('similarity', 0)
    
    # Menu item
    if 'price' in r:
        return f"• מנה: {r['name']} | קטגוריה: {r.get('category', '?')} | מחיר: {r['price']}₪ | דמיון: {sim:.0%}"
    
    # Inventory
    if 'current_stock' in r:
        return f"• מלאי: {r['name']} | כמות: {r['current_stock']} {r.get('unit', '')} | דמיון: {sim:.0%}"
    
    # Task
    if 'status' in r and 'title' in r:
        return f"• משימה: {r['title']} | סטטוס: {r['status']} | {r.get('description', '')} | דמיון: {sim:.0%}"
    
    # Recurring task
    if 'frequency' in r:
        return f"• משימה חוזרת: {r['name']} | תדירות: {r['frequency']} | {r.get('category', '')} | דמיון: {sim:.0%}"
    
    # Recipe
    if 'steps' in r or 'ingredients' in r:
        ingredients_str = ""
        if r.get('ingredients') and isinstance(r['ingredients'], list):
            names = [i.get('name', str(i)) if isinstance(i, dict) else str(i) for i in r['ingredients'][:5]]
            ingredients_str = f" | מרכיבים: {', '.join(names)}"
        prep = f" | זמן: {r['prep_time_minutes']} דק'" if r.get('prep_time_minutes') else ""
        return f"• מתכון: {r['title']}{ingredients_str}{prep} | דמיון: {sim:.0%}"
    
    # Generic fallback
    name = r.get('name', r.get('title', r.get('item_name', '?')))
    return f"• {name} | דמיון: {sim:.0%}"


def build_context_block(results: list) -> str:
    """Format search results into a context block for Gemma."""
    lines = []
    for r in results:
        if r.get('similarity', 0) < SIMILARITY_THRESHOLD:
            continue
        lines.append(format_result(r))
    return "\n".join(lines) if lines else ""


def build_rag_prompt(query: str, search_results: list) -> dict:
    """
    Build a RAG-grounded prompt for Gemma.
    Returns: { "prompt": str, "grounded": bool, "context_count": int, "fallback": str|None }
    
    If grounded=False, the caller should NOT send this to Gemma.
    """
    context = build_context_block(search_results)
    
    if not context:
        return {
            "prompt": "",
            "grounded": False,
            "context_count": 0,
            "fallback": f"חיפשתי \"{query}\" ולא מצאתי תוצאות מספיק רלוונטיות. אפשר לנסח אחרת?"
        }
    
    prompt = RAG_SYSTEM_PROMPT.format(context=context, user_query=query)
    grounded_count = len([r for r in search_results if r.get('similarity', 0) >= SIMILARITY_THRESHOLD])
    
    print(f"[RAG] Query: '{query}' | Grounded: {grounded_count} items")
    return {
        "prompt": prompt,
        "grounded": True,
        "context_count": grounded_count,
        "fallback": None
    }
