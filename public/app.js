// EdgePad - Application Logic
class EdgePad {
    constructor() {
        this.currentNote = null;
        this.notes = [];
        this.useLocalStorage = false; // Will be set to true if API is not available
        this.init();
    }

    init() {
        this.loadNotes();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // New note button
        document.getElementById('newNoteBtn').addEventListener('click', () => this.createNewNote());
        
        // Save button
        document.getElementById('saveBtn').addEventListener('click', () => this.saveCurrentNote());
        
        // Delete button
        document.getElementById('deleteBtn').addEventListener('click', () => this.deleteCurrentNote());
        
        // Image button
        document.getElementById('imageBtn').addEventListener('click', () => {
            document.getElementById('imageInput').click();
        });
        
        // Image input change
        document.getElementById('imageInput').addEventListener('change', (e) => {
            this.handleImageUpload(e.target.files);
        });

        // Auto-save on content change (debounced)
        let saveTimeout;
        const autoSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                if (this.currentNote) {
                    this.saveCurrentNote(true);
                }
            }, 2000);
        };

        document.getElementById('noteTitle').addEventListener('input', autoSave);
        document.getElementById('noteContent').addEventListener('input', autoSave);
    }

    async loadNotes() {
        try {
            this.showLoading(true);
            
            // Try to fetch from API first
            try {
                const response = await fetch('/api/notes');
                if (response.ok) {
                    this.notes = await response.json();
                    this.useLocalStorage = false;
                    this.renderNotesList();
                    return;
                }
                // If response is not ok, fall back to localStorage
                console.log('API not available, using localStorage');
                this.useLocalStorage = true;
            } catch (apiError) {
                console.log('API error, using localStorage:', apiError.message);
                this.useLocalStorage = true;
            }
            
            // Fallback to localStorage
            const stored = localStorage.getItem('edgepad_notes');
            this.notes = stored ? JSON.parse(stored) : [];
            this.renderNotesList();
        } catch (error) {
            console.error('Failed to load notes:', error);
            this.showToast('加载笔记失败', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    renderNotesList() {
        const notesList = document.getElementById('notesList');
        
        if (this.notes.length === 0) {
            notesList.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-secondary);">暂无笔记</div>';
            return;
        }

        notesList.innerHTML = this.notes.map(note => `
            <div class="note-item ${this.currentNote?.id === note.id ? 'active' : ''}" 
                 data-id="${note.id}">
                <div class="note-item-title">${this.escapeHtml(note.title || '无标题')}</div>
                <div class="note-item-preview">${this.escapeHtml(this.getPreview(note.content))}</div>
                <div class="note-item-date">${this.formatDate(note.updatedAt)}</div>
            </div>
        `).join('');

        // Add click listeners to note items
        notesList.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => {
                const noteId = item.dataset.id;
                this.loadNote(noteId);
            });
        });
    }

    async createNewNote() {
        const newNote = {
            id: this.generateId(),
            title: '新笔记',
            content: '',
            images: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        try {
            this.showLoading(true);
            
            if (this.useLocalStorage) {
                // Use localStorage
                this.notes.unshift(newNote);
                this.saveToLocalStorage();
                this.renderNotesList();
                this.loadNote(newNote.id);
                this.showToast('笔记已创建', 'success');
            } else {
                // Use API
                const response = await fetch('/api/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newNote)
                });

                if (response.ok) {
                    const savedNote = await response.json();
                    this.notes.unshift(savedNote);
                    this.renderNotesList();
                    this.loadNote(savedNote.id);
                    this.showToast('笔记已创建', 'success');
                } else {
                    throw new Error('Failed to create note');
                }
            }
        } catch (error) {
            console.error('Failed to create note:', error);
            this.showToast('创建笔记失败', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadNote(noteId) {
        try {
            this.showLoading(true);
            
            let note;
            if (this.useLocalStorage) {
                // Load from memory
                note = this.notes.find(n => n.id === noteId);
            } else {
                // Load from API
                const response = await fetch(`/api/notes/${noteId}`);
                if (response.ok) {
                    note = await response.json();
                } else {
                    throw new Error('Failed to load note');
                }
            }
            
            if (note) {
                this.currentNote = note;
                this.displayNote(note);
            }
        } catch (error) {
            console.error('Failed to load note:', error);
            this.showToast('加载笔记失败', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayNote(note) {
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('editorContainer').style.display = 'flex';
        
        document.getElementById('noteTitle').value = note.title || '';
        document.getElementById('noteContent').value = note.content || '';
        
        this.renderImages(note.images || []);
        this.renderNotesList();
    }

    renderImages(images) {
        const container = document.getElementById('imagesContainer');
        
        if (!images || images.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = images.map((image, index) => `
            <div class="image-item">
                <img src="${image}" alt="Note image ${index + 1}">
                <div class="image-item-actions">
                    <button class="image-item-btn" data-image-index="${index}" title="删除图片">
                        🗑️
                    </button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners to delete buttons
        container.querySelectorAll('.image-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.imageIndex);
                this.removeImage(index);
            });
        });
    }

    async saveCurrentNote(silent = false) {
        if (!this.currentNote) return;

        const title = document.getElementById('noteTitle').value;
        const content = document.getElementById('noteContent').value;

        const updatedNote = {
            ...this.currentNote,
            title,
            content,
            updatedAt: new Date().toISOString()
        };

        try {
            if (this.useLocalStorage) {
                // Update in localStorage
                this.currentNote = updatedNote;
                const index = this.notes.findIndex(n => n.id === updatedNote.id);
                if (index !== -1) {
                    this.notes[index] = updatedNote;
                }
                this.saveToLocalStorage();
                this.renderNotesList();
                
                if (!silent) {
                    this.showToast('笔记已保存', 'success');
                }
            } else {
                // Save via API
                const response = await fetch(`/api/notes/${this.currentNote.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedNote)
                });

                if (response.ok) {
                    const savedNote = await response.json();
                    this.currentNote = savedNote;
                    
                    // Update in notes array
                    const index = this.notes.findIndex(n => n.id === savedNote.id);
                    if (index !== -1) {
                        this.notes[index] = savedNote;
                    }
                    
                    this.renderNotesList();
                    
                    if (!silent) {
                        this.showToast('笔记已保存', 'success');
                    }
                } else {
                    throw new Error('Failed to save note');
                }
            }
        } catch (error) {
            console.error('Failed to save note:', error);
            if (!silent) {
                this.showToast('保存失败', 'error');
            }
        }
    }

    async deleteCurrentNote() {
        if (!this.currentNote) return;

        if (!confirm('确定要删除这个笔记吗？')) {
            return;
        }

        try {
            this.showLoading(true);
            
            if (this.useLocalStorage) {
                // Delete from localStorage
                this.notes = this.notes.filter(n => n.id !== this.currentNote.id);
                this.saveToLocalStorage();
            } else {
                // Delete via API
                const response = await fetch(`/api/notes/${this.currentNote.id}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    this.notes = this.notes.filter(n => n.id !== this.currentNote.id);
                } else {
                    throw new Error('Failed to delete note');
                }
            }
            
            this.currentNote = null;
            document.getElementById('emptyState').style.display = 'flex';
            document.getElementById('editorContainer').style.display = 'none';
            
            this.renderNotesList();
            this.showToast('笔记已删除', 'success');
        } catch (error) {
            console.error('Failed to delete note:', error);
            this.showToast('删除失败', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handleImageUpload(files) {
        if (!files || files.length === 0 || !this.currentNote) return;

        try {
            this.showLoading(true);
            
            for (const file of files) {
                if (!file.type.startsWith('image/')) {
                    continue;
                }

                // Convert image to base64
                const base64 = await this.fileToBase64(file);
                
                // Add image to current note
                if (!this.currentNote.images) {
                    this.currentNote.images = [];
                }
                this.currentNote.images.push(base64);
            }

            // Save note with new images
            await this.saveCurrentNote(true);
            this.renderImages(this.currentNote.images);
            this.showToast('图片已添加', 'success');
            
            // Clear file input
            document.getElementById('imageInput').value = '';
        } catch (error) {
            console.error('Failed to upload images:', error);
            this.showToast('图片上传失败', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async removeImage(index) {
        if (!this.currentNote || !this.currentNote.images) return;

        if (!confirm('确定要删除这张图片吗？')) {
            return;
        }

        this.currentNote.images.splice(index, 1);
        await this.saveCurrentNote(true);
        this.renderImages(this.currentNote.images);
        this.showToast('图片已删除', 'success');
    }

    getPreview(content) {
        if (!content) return '无内容';
        return content.substring(0, 50) + (content.length > 50 ? '...' : '');
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        // Less than 1 minute
        if (diff < 60000) {
            return '刚刚';
        }
        // Less than 1 hour
        if (diff < 3600000) {
            return Math.floor(diff / 60000) + ' 分钟前';
        }
        // Less than 24 hours
        if (diff < 86400000) {
            return Math.floor(diff / 3600000) + ' 小时前';
        }
        // Less than 7 days
        if (diff < 604800000) {
            return Math.floor(diff / 86400000) + ' 天前';
        }
        
        return date.toLocaleDateString('zh-CN');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    saveToLocalStorage() {
        localStorage.setItem('edgepad_notes', JSON.stringify(this.notes));
    }

    generateId() {
        // Use crypto.randomUUID if available (modern browsers), fallback to timestamp + random
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return Date.now().toString(36) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }

    showLoading(show) {
        document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize the application
const edgepad = new EdgePad();
