// Development mock API for local testing without KV storage
// This middleware simulates the edge functions for local development

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    // Check if we're in development mode (no KV available)
    const isDev = !context.env?.NOTES_KV;
    
    if (!isDev) {
        // In production, let the actual edge functions handle it
        return context.next();
    }
    
    // For development, use a simpler approach with mock data
    // This returns empty array initially, and the frontend will handle localStorage
    if (url.pathname === '/api/notes' && request.method === 'GET') {
        return new Response(JSON.stringify([]), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
    
    // Pass through to next handler
    return context.next();
}
