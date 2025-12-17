// Edge function for getting a specific note (GET /api/notes/:id)
export async function onRequestGet(context) {
    try {
        const { params, env } = context;
        const noteId = params.id;
        
        // Get note from KV
        const noteData = await env.NOTES_KV?.get(`note:${noteId}`, 'json');
        
        if (!noteData) {
            return new Response(JSON.stringify({ error: 'Note not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        return new Response(JSON.stringify(noteData), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        console.error('Error fetching note:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch note' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Edge function for updating a note (PUT /api/notes/:id)
export async function onRequestPut(context) {
    try {
        const { request, params, env } = context;
        const noteId = params.id;
        const body = await request.json();
        
        // Get existing note
        const existingNote = await env.NOTES_KV?.get(`note:${noteId}`, 'json');
        
        if (!existingNote) {
            return new Response(JSON.stringify({ error: 'Note not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Update note
        const updatedNote = {
            ...existingNote,
            title: body.title || existingNote.title,
            content: body.content !== undefined ? body.content : existingNote.content,
            images: body.images || existingNote.images,
            updatedAt: new Date().toISOString()
        };
        
        // Save individual note
        await env.NOTES_KV?.put(`note:${noteId}`, JSON.stringify(updatedNote));
        
        // Update in notes list
        const notesKey = 'notes:all';
        const notesData = await env.NOTES_KV?.get(notesKey, 'json');
        const notes = notesData || [];
        
        const noteIndex = notes.findIndex(n => n.id === noteId);
        if (noteIndex !== -1) {
            notes[noteIndex] = updatedNote;
        } else {
            notes.push(updatedNote);
        }
        
        await env.NOTES_KV?.put(notesKey, JSON.stringify(notes));
        
        return new Response(JSON.stringify(updatedNote), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        console.error('Error updating note:', error);
        return new Response(JSON.stringify({ error: 'Failed to update note' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Edge function for deleting a note (DELETE /api/notes/:id)
export async function onRequestDelete(context) {
    try {
        const { params, env } = context;
        const noteId = params.id;
        
        // Delete individual note
        await env.NOTES_KV?.delete(`note:${noteId}`);
        
        // Remove from notes list
        const notesKey = 'notes:all';
        const notesData = await env.NOTES_KV?.get(notesKey, 'json');
        const notes = notesData || [];
        
        const filteredNotes = notes.filter(n => n.id !== noteId);
        await env.NOTES_KV?.put(notesKey, JSON.stringify(filteredNotes));
        
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        console.error('Error deleting note:', error);
        return new Response(JSON.stringify({ error: 'Failed to delete note' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
