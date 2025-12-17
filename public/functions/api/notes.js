// Edge function for listing all notes (GET /api/notes)
export async function onRequestGet(context) {
    try {
        const { env } = context;
        
        // Get all notes from KV storage
        // In production, this uses Cloudflare KV namespace
        // In development without KV, the middleware will handle the request
        const notesKey = 'notes:all';
        const notesData = await env.NOTES_KV?.get(notesKey, 'json');
        
        const notes = notesData || [];
        
        // Sort by updatedAt descending
        notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        return new Response(JSON.stringify(notes), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        console.error('Error fetching notes:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch notes' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Edge function for creating a new note (POST /api/notes)
export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const body = await request.json();
        
        // Generate a unique ID
        const id = generateId();
        const now = new Date().toISOString();
        
        const newNote = {
            id,
            title: body.title || '无标题',
            content: body.content || '',
            images: body.images || [],
            createdAt: now,
            updatedAt: now
        };
        
        // Get existing notes
        const notesKey = 'notes:all';
        const notesData = await env.NOTES_KV?.get(notesKey, 'json');
        const notes = notesData || [];
        
        // Add new note
        notes.push(newNote);
        
        // Save back to KV
        await env.NOTES_KV?.put(notesKey, JSON.stringify(notes));
        
        // Also save individual note
        await env.NOTES_KV?.put(`note:${id}`, JSON.stringify(newNote));
        
        return new Response(JSON.stringify(newNote), {
            status: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        console.error('Error creating note:', error);
        return new Response(JSON.stringify({ error: 'Failed to create note' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
