import express from 'express';
import cors from 'cors';
import { toggleClock } from './attendance.js';
import { handlePayFacWebhook } from './payfacWebhook.js';

const app = express();
app.use(cors());
app.use(express.json());

// HotelOS PayFac Credit Card Webhook Endpoint
app.post('/api/webhooks/payfac', handlePayFacWebhook);

app.post('/api/attendance/toggle', async (req, res) => {
    const { action } = req.body;
    console.log(`Received attendance toggle instruction: ${action}`);
    
    try {
        const result = await toggleClock(action);
        if (result.success) {
            console.log(`Successfully clocked ${action} for Rani.`);
            res.json(result);
        } else {
            console.error(`Failed to clock ${action}: ${result.error}`);
            // Retry logic mentioned by user: "Senzey is being slow today, retrying in 1 minute..."
            res.status(500).json({ error: 'Senzey is being slow today, retrying in 1 minute...', ...result });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

const PORT = 4028;
app.listen(PORT, () => {
    console.log(`Attendance Bridge & PayFac Webhook API running on port ${PORT}`);
});

