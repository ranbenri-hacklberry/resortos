import asyncio
import random
import time  # <--- חסר היה
import aiohttp

class LoginRequest:
    def __init__(self, username, password):
        self.username = username
        self.password = password

    async def fetch(self, session):
        url = "https://deck-bar.senzey.com/login.php"
        headers = {
            "User-Agent": f"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded" # חשוב ל-PHP
        }
        
        # שים לב: וודא שאלו שמות השדות ב-HTML של Senzey (לפעמים זה 'user' ו-'pass')
        payload = {"username": self.username, "password": self.password}
        
        start_time = time.time()
        try:
            async with session.post(url, headers=headers, data=payload, timeout=10) as response:
                ttfb = round(time.time() - start_time, 2)
                if response.status == 200:
                    return f"Successful request. TTFB: {ttfb} s"
                else:
                    return f"Failed request (status code {response.status}). TTFB: {ttfb} s"
        except Exception as e:
            return f"Error: {str(e)}"

async def ramping_load_test():
    num_requests = 10
    # ClientSession אחד לכל הריצה - הרבה יותר יעיל למקס סטודיו
    async with aiohttp.ClientSession() as session:
        while True:
            print(f"\n--- Sending {num_requests} concurrent requests ---")
            tasks = [LoginRequest(f"ran_{i}", "pass123").fetch(session) for i in range(num_requests)]
            responses = await asyncio.gather(*tasks)

            successful = [r for r in responses if "Successful" in r]
            print(f"Results: {len(successful)} Success, {len(responses)-len(successful)} Failed")
            
            # אם ה-TTFB עולה מעל 2 שניות, הגעת לנקודת השבירה של ה-PHP
            num_requests += 20 
            await asyncio.sleep(1) # נשימה קצרה בין גל לגל

if __name__ == '__main__':
    try:
        asyncio.run(ramping_load_test()) # <--- התיקון לשם הפונקציה הנכון
    except KeyboardInterrupt:
        print("\nTest stopped by user.")
