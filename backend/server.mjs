import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { researchPlace, suggestPlaces } from './research.mjs';

loadEnvFile(new URL('./.env', import.meta.url));

const port = Number(process.env.PORT ?? 8787);

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && request.url === '/research/place') {
    try {
      const body = await readJson(request);
      const result = await researchPlace({
        maxResultsPerProvider: Number(process.env.MAX_RESULTS_PER_PROVIDER ?? 2),
        place: body.place,
        topics: body.topics,
      });

      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Unknown backend error',
      });
    }
    return;
  }

  if (request.method === 'POST' && request.url === '/research/place-suggestions') {
    try {
      const body = await readJson(request);
      const result = await suggestPlaces({
        maxResults: Number(process.env.MAX_PLACE_SUGGESTIONS ?? 5),
        query: body.query,
      });

      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Unknown backend error',
      });
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, () => {
  console.log(`Roundtrip research backend listening on http://localhost:${port}`);
});

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Origin', '*');
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function loadEnvFile(fileUrl) {
  try {
    const content = readFileSync(fileUrl, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split('=');
      if (!process.env[key]) {
        process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // A .env file is optional. Environment variables can be provided by the shell or host.
  }
}
