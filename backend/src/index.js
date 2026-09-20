import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import searchRouter from './routes/search.js';
import trackedRouter from './routes/tracked.js';
import historyRouter from './routes/history.js';
import scrapeRouter from './routes/scrape.js';

const app = express();
app.use(cors());
app.use(express.json());

// Render (and cron-job.org) need something to ping to confirm the
// service is alive. Also just genuinely useful while developing.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/search', searchRouter);
app.use('/api/tracked', trackedRouter);
app.use('/api/tracked', historyRouter); // adds /:id/history and /:id/log
app.use('/api/scrape', scrapeRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});