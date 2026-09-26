const file = Bun.file(new URL('./index.html', import.meta.url));
Bun.serve({
  hostname: '127.0.0.1',
  port: 4173,
  fetch: () => new Response(file, { headers: { 'Content-Type': 'text/html' } }),
});
console.info('IRIDA fixture: http://127.0.0.1:4173');
