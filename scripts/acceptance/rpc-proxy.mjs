import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

// Local acceptance fault injection only. Never used by the delivered app's config.
const state = JSON.parse(readFileSync('.runtime/acceptance/state.json', 'utf8'));
const { indexerSecret } = JSON.parse(readFileSync('.runtime/acceptance/credentials.json', 'utf8'));
if (state.rpcUrl !== 'http://127.0.0.1:8545' || state.chainId !== 31337) throw new Error('Local acceptance chain required');
let fault = null, injected = 0;
createServer(async (request, response) => {
  try {
    let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Request too large'); }
    if (request.url === '/control') {
      if (request.headers.authorization !== `Bearer ${indexerSecret}`) { response.writeHead(403).end(); return; }
      if (request.method === 'POST') { fault = JSON.parse(raw); injected = 0; }
      response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({ fault, injected })); return;
    }
    const call = JSON.parse(raw);
    if (fault && fault.remaining > 0 && call.method === fault.method) {
      fault.remaining--; injected++;
      response.setHeader('Content-Type','application/json');
      if (fault.status) { response.writeHead(fault.status); response.end(JSON.stringify({ error:'Acceptance RPC rate limit' })); }
      else response.end(JSON.stringify({ jsonrpc:'2.0',id:call.id,error:{code:-32002,message:'Acceptance upstream request timed out'} }));
      return;
    }
    const result = await fetch(state.rpcUrl, { method:'POST',headers:{'Content-Type':'application/json'},body:raw,signal:AbortSignal.timeout(15_000) });
    response.writeHead(result.status,{'Content-Type':'application/json'});response.end(await result.text());
  } catch { response.writeHead(502,{'Content-Type':'application/json'});response.end(JSON.stringify({error:'Acceptance upstream unavailable'})); }
}).listen(8546,'127.0.0.1',() => console.log('Local acceptance RPC fault proxy listening on 8546.'));
