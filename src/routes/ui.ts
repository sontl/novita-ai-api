/**
 * UI routes for serving the web management interface
 */

import { Router } from 'express';
import path from 'path';

const router = Router();

/**
 * Serve the main UI
 */
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * Serve static assets (if needed in the future)
 */
router.get('/assets/*', (req, res) => {
  const filePath = path.join(__dirname, '../public', req.path);
  res.sendFile(filePath);
});

export { router as uiRouter };