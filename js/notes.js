/**
 * notes.js
 * 笔记管理页面脚本
 * 功能：增删改查笔记，搜索过滤，关联教材和课文
 */
document.addEventListener('DOMContentLoaded', () => {
    // 获取全局模块
    const { Storage, Utils } = window.TextbookSystem;

    // ========== DOM 元素引用 ==========
    const elements = {
        // 列表和状态
        noteList: document.getElementById('note-list'),
        emptyState: document.getElementById('empty-state'),
        searchInput: document.getElementById('search-input'),
        filterTextbook: document.getElementById('filter-textbook'),
        filterLesson: document.getElementById('filter-lesson'),

        // 统计
        totalCount: document.getElementById('total-count'),
        weekCount: document.getElementById('week-count'),

        // 添加按钮
        addNoteBtn: document.getElementById('add-note-btn'),
        emptyAddBtn: document.getElementById('empty-add-btn'),

        // 编辑模态框
        noteModal: document.getElementById('note-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalCloseBtn: document.getElementById('modal-close-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
        noteForm: document.getElementById('note-form'),

        // 表单字段
        noteId: document.getElementById('note-id'),
        noteTitle: document.getElementById('note-title'),
        noteTextbook: document.getElementById('note-textbook'),
        noteLesson: document.getElementById('note-lesson'),
        noteContent: document.getElementById('note-content'),

        // 查看模态框
        viewModal: document.getElementById('view-modal'),
        viewTitle: document.getElementById('view-title'),
        viewContent: document.getElementById('view-content'),
        viewInfo: document.getElementById('view-info'),
        viewCloseBtn: document.getElementById('view-close-btn'),
        viewEditBtn: document.getElementById('view-edit-btn'),
        viewOkBtn: document.getElementById('view-ok-btn'),

        // 确认删除模态框
        confirmModal: document.getElementById('confirm-modal'),
        confirmCloseBtn: document.getElementById('confirm-close-btn'),
        confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
        confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
        deleteNoteId: document.getElementById('delete-note-id')
    };

    // 当前查看的笔记 ID（用于从查看切换到编辑）
    let currentViewingNoteId = null;

    // ========== 模态框控制 ==========
    function openModal(modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function resetForm() {
        elements.noteForm.reset();
        elements.noteId.value = '';
        elements.modalTitle.textContent = '添加笔记';
        loadLessonsForSelect('');
    }

    // ========== 数据加载 ==========

    /**
     * 加载教材选项
     */
    function loadTextbooksForFilter() {
        const textbooks = Storage.load('textbooks', []);

        // 筛选器
        elements.filterTextbook.innerHTML = '<option value="">所有教材</option>';
        textbooks.forEach(tb => {
            const option = document.createElement('option');
            option.value = tb.id;
            option.textContent = tb.name;
            elements.filterTextbook.appendChild(option);
        });

        // 表单选择器
        elements.noteTextbook.innerHTML = '<option value="">不关联教材</option>';
        textbooks.forEach(tb => {
            const option = document.createElement('option');
            option.value = tb.id;
            option.textContent = tb.name;
            elements.noteTextbook.appendChild(option);
        });
    }

    /**
     * 加载课文选项（根据教材筛选）
     */
    function loadLessonsForFilter(textbookId) {
        const lessons = Storage.load('lessons', []);
        const courses = Storage.load('courses', []);

        let filteredLessons = lessons;

        if (textbookId) {
            // 找到该教材下的所有课程
            const courseIds = courses
                .filter(c => c.textbookId === textbookId)
                .map(c => c.id);
            // 筛选这些课程下的课文
            filteredLessons = lessons.filter(l => courseIds.includes(l.courseId));
        }

        elements.filterLesson.innerHTML = '<option value="">所有课文</option>';
        filteredLessons.forEach(lesson => {
            const option = document.createElement('option');
            option.value = lesson.id;
            option.textContent = lesson.title;
            elements.filterLesson.appendChild(option);
        });
    }

    /**
     * 加载表单中的课文选项（根据选择的教材）
     */
    function loadLessonsForSelect(textbookId) {
        const lessons = Storage.load('lessons', []);
        const courses = Storage.load('courses', []);

        let filteredLessons = lessons;

        if (textbookId) {
            const courseIds = courses
                .filter(c => c.textbookId === textbookId)
                .map(c => c.id);
            filteredLessons = lessons.filter(l => courseIds.includes(l.courseId));
        }

        elements.noteLesson.innerHTML = '<option value="">不关联课文</option>';
        filteredLessons.forEach(lesson => {
            const course = courses.find(c => c.id === lesson.courseId);
            const option = document.createElement('option');
            option.value = lesson.id;
            option.textContent = course ? `${lesson.title} (${course.name})` : lesson.title;
            elements.noteLesson.appendChild(option);
        });
    }

    /**
     * 更新统计信息
     */
    function updateStats() {
        const notes = Storage.load('notes', []);
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const weekNotes = notes.filter(n => new Date(n.createdAt) >= weekAgo);

        elements.totalCount.textContent = notes.length;
        elements.weekCount.textContent = weekNotes.length;
    }

    /**
     * 渲染笔记列表
     */
    function renderNotes() {
        const notes = Storage.load('notes', []);
        const lessons = Storage.load('lessons', []);
        const courses = Storage.load('courses', []);
        const textbooks = Storage.load('textbooks', []);

        const searchTerm = elements.searchInput.value.trim().toLowerCase();
        const filterTextbookId = elements.filterTextbook.value;
        const filterLessonId = elements.filterLesson.value;

        // 过滤
        let filteredNotes = notes;

        // 搜索过滤
        if (searchTerm) {
            filteredNotes = filteredNotes.filter(n =>
                n.title.toLowerCase().includes(searchTerm) ||
                n.content.toLowerCase().includes(searchTerm)
            );
        }

        // 课文过滤
        if (filterLessonId) {
            filteredNotes = filteredNotes.filter(n => n.lessonId === filterLessonId);
        }
        // 教材过滤（通过课程关联）
        else if (filterTextbookId) {
            const courseIds = courses
                .filter(c => c.textbookId === filterTextbookId)
                .map(c => c.id);
            const lessonIds = lessons
                .filter(l => courseIds.includes(l.courseId))
                .map(l => l.id);
            filteredNotes = filteredNotes.filter(n =>
                lessonIds.includes(n.lessonId) || n.textbookId === filterTextbookId
            );
        }

        // 按时间倒序
        filteredNotes.sort((a, b) => b.createdAt - a.createdAt);

        // 检查是否为空
        if (filteredNotes.length === 0) {
            elements.noteList.style.display = 'none';
            elements.emptyState.style.display = 'block';

            if (searchTerm || filterTextbookId || filterLessonId) {
                elements.emptyState.querySelector('h3').textContent = '未找到匹配的笔记';
                elements.emptyState.querySelector('p').textContent = '尝试调整搜索条件';
                elements.emptyAddBtn.style.display = 'none';
            } else {
                elements.emptyState.querySelector('h3').textContent = '暂无笔记';
                elements.emptyState.querySelector('p').textContent = '点击上方"添加笔记"按钮，开始记录您的学习心得';
                elements.emptyAddBtn.style.display = 'inline-flex';
            }
            return;
        }

        elements.noteList.style.display = 'grid';
        elements.emptyState.style.display = 'none';

        // 渲染卡片
        elements.noteList.innerHTML = filteredNotes.map(note => {
            const lesson = lessons.find(l => l.id === note.lessonId);
            const course = lesson ? courses.find(c => c.id === lesson.courseId) : null;
            const textbook = note.textbookId ?
                textbooks.find(t => t.id === note.textbookId) :
                (course ? textbooks.find(t => t.id === course.textbookId) : null);

            return `
                <div class="card note-card" data-id="${note.id}">
                    <div class="note-header">
                        <h3 class="note-title">${escapeHtml(note.title)}</h3>
                    </div>

                    <p class="note-content">${escapeHtml(note.content)}</p>

                    <div class="note-tags">
                        ${textbook ? `
                            <span class="note-tag textbook-tag">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                </svg>
                                ${escapeHtml(textbook.name)}
                            </span>
                        ` : ''}
                        ${lesson ? `
                            <span class="note-tag lesson-tag">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                                ${escapeHtml(lesson.title)}
                            </span>
                        ` : ''}
                    </div>

                    <div class="note-meta">
                        <span class="note-date">
                            ${Utils.formatDate(note.createdAt)}
                        </span>
                        <div class="note-actions">
                            <button class="btn-icon view-btn" data-id="${note.id}"
                                    title="查看" aria-label="查看">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                     stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                            <button class="btn-icon edit-btn" data-id="${note.id}"
                                    title="编辑" aria-label="编辑">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                     stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon delete delete-btn" data-id="${note.id}"
                                    title="删除" aria-label="删除">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                     stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        bindCardEvents();
        updateStats();
    }

    /**
     * HTML 转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 绑定卡片事件
     */
    function bindCardEvents() {
        // 查看按钮
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                openViewModal(id);
            });
        });

        // 编辑按钮
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                openEditModal(id);
            });
        });

        // 删除按钮
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                openDeleteConfirm(id);
            });
        });
    }

    /**
     * 打开查看模态框
     */
    function openViewModal(id) {
        const notes = Storage.load('notes', []);
        const lessons = Storage.load('lessons', []);
        const courses = Storage.load('courses', []);
        const textbooks = Storage.load('textbooks', []);

        const note = notes.find(n => n.id === id);
        if (!note) return;

        currentViewingNoteId = id;

        const lesson = lessons.find(l => l.id === note.lessonId);
        const course = lesson ? courses.find(c => c.id === lesson.courseId) : null;
        const textbook = note.textbookId ?
            textbooks.find(t => t.id === note.textbookId) :
            (course ? textbooks.find(t => t.id === course.textbookId) : null);

        elements.viewTitle.textContent = note.title;
        elements.viewContent.textContent = note.content;

        let infoHtml = `<p><strong>创建时间：</strong>${Utils.formatDate(note.createdAt)}</p>`;
        if (note.updatedAt) {
            infoHtml += `<p><strong>更新时间：</strong>${Utils.formatDate(note.updatedAt)}</p>`;
        }
        if (textbook) {
            infoHtml += `<p><strong>关联教材：</strong>${escapeHtml(textbook.name)}</p>`;
        }
        if (lesson) {
            infoHtml += `<p><strong>关联课文：</strong>${escapeHtml(lesson.title)}</p>`;
        }

        elements.viewInfo.innerHTML = infoHtml;

        openModal(elements.viewModal);
    }

    /**
     * 打开编辑模态框
     */
    function openEditModal(id) {
        const notes = Storage.load('notes', []);
        const note = notes.find(n => n.id === id);

        if (!note) return;

        loadTextbooksForFilter();

        elements.noteId.value = note.id;
        elements.noteTitle.value = note.title;
        elements.noteTextbook.value = note.textbookId || '';
        loadLessonsForSelect(note.textbookId || '');
        elements.noteLesson.value = note.lessonId || '';
        elements.noteContent.value = note.content;
        elements.modalTitle.textContent = '编辑笔记';

        openModal(elements.noteModal);
    }

    /**
     * 打开删除确认框
     */
    function openDeleteConfirm(id) {
        const notes = Storage.load('notes', []);
        const note = notes.find(n => n.id === id);

        if (!note) return;

        elements.deleteNoteId.value = id;
        document.getElementById('confirm-message').textContent =
            `确定要删除笔记"${note.title}"吗？此操作不可恢复。`;

        openModal(elements.confirmModal);
    }

    /**
     * 保存笔记
     */
    function saveNote(e) {
        e.preventDefault();

        const id = elements.noteId.value;
        const noteData = {
            title: elements.noteTitle.value.trim(),
            textbookId: elements.noteTextbook.value,
            lessonId: elements.noteLesson.value,
            content: elements.noteContent.value.trim()
        };

        if (!noteData.title || !noteData.content) {
            Utils.showMessage('请填写标题和内容', 'error');
            return;
        }

        const notes = Storage.load('notes', []);

        if (id) {
            // 编辑模式
            const index = notes.findIndex(n => n.id === id);
            if (index !== -1) {
                notes[index] = {
                    ...notes[index],
                    ...noteData,
                    updatedAt: new Date().toISOString()
                };
                Utils.showMessage('笔记更新成功', 'success');
            }
        } else {
            // 添加模式
            notes.push({
                id: Utils.generateId(),
                ...noteData,
                createdAt: new Date().toISOString()
            });
            Utils.showMessage('笔记添加成功', 'success');
        }

        Storage.save('notes', notes);
        closeModal(elements.noteModal);
        resetForm();
        renderNotes();
    }

    /**
     * 删除笔记
     */
    function deleteNote() {
        const id = elements.deleteNoteId.value;
        let notes = Storage.load('notes', []);

        notes = notes.filter(n => n.id !== id);

        Storage.save('notes', notes);
        closeModal(elements.confirmModal);
        Utils.showMessage('笔记已删除', 'success');
        renderNotes();
    }

    // ========== 事件绑定 ==========

    // 添加按钮
    elements.addNoteBtn.addEventListener('click', () => {
        resetForm();
        loadTextbooksForFilter();
        openModal(elements.noteModal);
    });

    elements.emptyAddBtn.addEventListener('click', () => {
        resetForm();
        loadTextbooksForFilter();
        openModal(elements.noteModal);
    });

    // 教材选择变化时更新课文选项
    elements.noteTextbook.addEventListener('change', (e) => {
        loadLessonsForSelect(e.target.value);
    });

    // 筛选器变化
    elements.filterTextbook.addEventListener('change', (e) => {
        loadLessonsForFilter(e.target.value);
        elements.filterLesson.value = '';
        renderNotes();
    });

    elements.filterLesson.addEventListener('change', () => {
        renderNotes();
    });

    // 搜索
    elements.searchInput.addEventListener('input', Utils.debounce(() => {
        renderNotes();
    }, 300));

    // 编辑模态框
    elements.modalCloseBtn.addEventListener('click', () => closeModal(elements.noteModal));
    elements.modalCancelBtn.addEventListener('click', () => closeModal(elements.noteModal));
    elements.noteForm.addEventListener('submit', saveNote);

    // 查看模态框
    elements.viewCloseBtn.addEventListener('click', () => closeModal(elements.viewModal));
    elements.viewOkBtn.addEventListener('click', () => closeModal(elements.viewModal));
    elements.viewEditBtn.addEventListener('click', () => {
        closeModal(elements.viewModal);
        if (currentViewingNoteId) {
            openEditModal(currentViewingNoteId);
        }
    });

    // 确认删除模态框
    elements.confirmCloseBtn.addEventListener('click', () => closeModal(elements.confirmModal));
    elements.confirmCancelBtn.addEventListener('click', () => closeModal(elements.confirmModal));
    elements.confirmDeleteBtn.addEventListener('click', deleteNote);

    // 点击遮罩关闭
    elements.noteModal.addEventListener('click', (e) => {
        if (e.target === elements.noteModal) closeModal(elements.noteModal);
    });
    elements.viewModal.addEventListener('click', (e) => {
        if (e.target === elements.viewModal) closeModal(elements.viewModal);
    });
    elements.confirmModal.addEventListener('click', (e) => {
        if (e.target === elements.confirmModal) closeModal(elements.confirmModal);
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(elements.noteModal);
            closeModal(elements.viewModal);
            closeModal(elements.confirmModal);
        }
    });

    // ========== 初始化 ==========
    loadTextbooksForFilter();
    loadLessonsForFilter('');
    renderNotes();
});