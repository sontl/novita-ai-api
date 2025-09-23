/**
 * Tests for UI routes and static file serving
 */

import request from 'supertest';
import { app } from '../index';

describe('UI Routes', () => {
  describe('GET /', () => {
    it('should serve the main UI page', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toContain('Novita GPU Instance Manager');
      expect(response.text).toContain('<script src="/app.js"></script>');
    });
  });

  describe('GET /app.js', () => {
    it('should serve the JavaScript file', async () => {
      const response = await request(app)
        .get('/app.js')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/javascript|text\/javascript/);
      expect(response.text).toContain('refreshData');
      expect(response.text).toContain('loadInstances');
      expect(response.text).toContain('syncInstances');
    });
  });

  describe('Static file serving', () => {
    it('should serve static files with correct MIME types', async () => {
      // Test HTML file
      const htmlResponse = await request(app)
        .get('/index.html')
        .expect(200);
      
      expect(htmlResponse.headers['content-type']).toMatch(/text\/html/);

      // Test JavaScript file
      const jsResponse = await request(app)
        .get('/app.js')
        .expect(200);
      
      expect(jsResponse.headers['content-type']).toMatch(/application\/javascript|text\/javascript/);
    });
  });
});