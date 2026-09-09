import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, 'session.json');

export async function toggleClock(action) {
    const username = process.env.SENZEY_USERNAME;
    const password = process.env.SENZEY_PASSWORD;
    if (!username || !password) {
        return { success: false, error: 'Senzey credentials are not configured' };
    }

    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1280, height: 800 });

    try {
        if (fs.existsSync(SESSION_FILE)) {
            const cookiesString = fs.readFileSync(SESSION_FILE, 'utf8');
            const cookies = JSON.parse(cookiesString);
            await page.setCookie(...cookies);
            console.log('Session restored from cache.');
        }

        await page.goto('https://deck-bar.senzey.com/login.php', { waitUntil: 'networkidle2', timeout: 30000 });

        const needsLogin = await page.$('#username');

        if (needsLogin) {
            console.log('Logging in to Senzey...');
            await page.type('#username', username);
            await page.type('#password', password);
            await Promise.all([
                page.click('button.btn'),
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
            ]);

            const cookies = await page.cookies();
            fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2), { mode: 0o600 });
        }

        console.log(`Attempting to clock ${action === 'in' ? 'IN' : 'OUT'}...`);

        const targetText = action === 'in' ? 'כניסה' : 'יציאה';
        
        const targetButton = await page.evaluateHandle((text) => {
            const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a, div.btn'));
            return btns.find(btn => (btn.textContent || btn.value || '').includes(text));
        }, targetText);

        if (!targetButton.asElement()) {
            throw new Error(`Could not find button containing "${targetText}"`);
        }

        await targetButton.asElement().click();
        
        await new Promise(r => setTimeout(r, 4000)); 

        const timestamp = new Date().getTime();
        const screenshotName = `attendance-${action}-${timestamp}.png`;
        const publicDir = path.join(__dirname, '../public/attendance');
        const screenshotPath = path.join(publicDir, screenshotName);
        
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`Screenshot saved to ${screenshotPath}`);

        return {
            success: true,
            action: action,
            time: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
            screenshot: `/attendance/${screenshotName}`
        };

    } catch (error) {
        console.error('Attendance Bridge Error:', error);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}
