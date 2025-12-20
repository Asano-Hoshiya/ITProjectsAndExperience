/**
 * 教材管理页面脚本
 * 功能：教材的增删改查，点击进入教材详情
 */
document.addEventListener('DOMContentLoaded', () => {
    const { Storage, Utils } = window.TextbookSystem;

    // ========== DOM 元素 ==========
    const elements = {
        textbookList: document.getElementById('textbook-list'),
        emptyState: document.getElementById('empty-state'),
        searchInput: document.getElementById('search-input'),

        totalCount: document.getElementById('total-count'),
        courseCount: document.getElementById('course-count'),
        lessonCount: document.getElementById('lesson-count'),

        addTextbookBtn: document.getElementById('add-textbook-btn'),
        emptyAddBtn: document.getElementById('empty-add-btn'),

        textbookModal: document.getElementById('textbook-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalCloseBtn: document.getElementById('modal-close-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
        textbookForm: document.getElementById('textbook-form'),

        textbookId: document.getElementById('textbook-id'),
        textbookName: document.getElementById('textbook-name'),
        textbookDescription: document.getElementById('textbook-description'),
        textbookColor: document.getElementById('textbook-color'),
        colorPicker: document.getElementById('color-picker'),

        confirmModal: document.getElementById('confirm-modal'),
        confirmCloseBtn: document.getElementById('confirm-close-btn'),
        confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
        confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
        deleteTextbookId: document.getElementById('delete-textbook-id')
    };

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
        elements.textbookForm.reset();
        elements.textbookId.value = '';
        elements.textbookColor.value = '#2563eb';
        elements.modalTitle.textContent = '添加教材';

        // 重置颜色选择
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.color === '#2563eb') {
                btn.classList.add('active');
            }
        });
    }

    // ========== 颜色选择器 ==========
    elements.colorPicker.addEventListener('click', (e) => {
        const colorBtn = e.target.closest('.color-option');
        if (!colorBtn) return;

        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.remove('active');
        });
        colorBtn.classList.add('active');
        elements.textbookColor.value = colorBtn.dataset.color;
    });

    // ========== 统计信息 ==========
    function updateStats() {
        const textbooks = Storage.load('textbooks', []);
        const courses = Storage.load('courses', []);
        const lessons = Storage.load('lessons', []);

        elements.totalCount.textContent = textbooks.length;
        elements.courseCount.textContent = courses.length;
        elements.lessonCount.textContent = lessons.length;
    }

    // ========== 获取教材下的统计 ==========
    function getTextbookStats(textbookId) {
        const courses = Storage.load('courses', []);
        const lessons = Storage.load('lessons', []);

        const textbookCourses = courses.filter(c => c.textbookId === textbookId);
        const courseIds = textbookCourses.map(c => c.id);
        const textbookLessons = lessons.filter(l => courseIds.includes(l.courseId));

        return {
            courseCount: textbookCourses.length,
            lessonCount: textbookLessons.length
        };
    }

    // ========== 渲染教材列表 ==========
    function renderTextbooks() {
        const textbooks = Storage.load('textbooks', []);
        const searchTerm = elements.searchInput.value.trim().toLowerCase();

        let filteredTextbooks = textbooks;
        if (searchTerm) {
            filteredTextbooks = textbooks.filter(t =>
                t.name.toLowerCase().includes(searchTerm) ||
                (t.description && t.description.toLowerCase().includes(searchTerm))
            );
        }

        // 按创建时间倒序
        filteredTextbooks.sort((a, b) => b.createdAt - a.createdAt);

        if (filteredTextbooks.length === 0) {
            elements.textbookList.style.display = 'none';
            elements.emptyState.style.display = 'block';

            if (searchTerm) {
                elements.emptyState.querySelector('h3').textContent = '未找到匹配的教材';
                elements.emptyState.querySelector('p').textContent = '尝试使用其他关键词搜索';
                elements.emptyAddBtn.style.display = 'none';
            } else {
                elements.emptyState.querySelector('h3').textContent = '暂无教材';
                elements.emptyState.querySelector('p').textContent = '点击上方"添加教材"按钮，创建您的第一本教材';
                elements.emptyAddBtn.style.display = 'inline-flex';
            }
            return;
        }

        elements.textbookList.style.display = 'grid';
        elements.emptyState.style.display = 'none';

        elements.textbookList.innerHTML = filteredTextbooks.map(textbook => {
            const stats = getTextbookStats(textbook.id);
            const color = textbook.color || '#2563eb';

            return `
                <div class="card item-card card-clickable" data-id="${textbook.id}">
                    <!-- 顶部颜色条 -->
                    <div style="height: 4px; background-color: ${color}; margin: -24px -24px 20px -24px; border-radius: var(--border-radius) var(--border-radius) 0 0;"></div>

                    <div class="item-card-header">
                        <h3 class="item-card-title">${escapeHtml(textbook.name)}</h3>
                    </div>

                    <p class="item-card-description">
                        ${textbook.description ? escapeHtml(textbook.description) : '<span style="color: var(--text-light);">暂无描述</span>'}
                    </p>

                    <div class="item-card-meta">
                        <div class="item-card-stats">
                            <span class="item-card-stat">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="7" height="7"></rect>
                                    <rect x="14" y="3" width="7" height="7"></rect>
                                    <rect x="14" y="14" width="7" height="7"></rect>
                                    <rect x="3" y="14" width="7" height="7"></rect>
                                </svg>
                                ${stats.courseCount} 个课程
                            </span>
                            <span class="item-card-stat">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                                ${stats.lessonCount} 篇课文
                            </span>
                        </div>
                        <div class="item-card-actions">
                            <button class="btn-icon edit-btn" data-id="${textbook.id}" title="编辑" aria-label="编辑">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon delete delete-btn" data-id="${textbook.id}" title="删除" aria-label="删除">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div style="margin-top: 12px; font-size: 0.75rem; color: var(--text-light);">
                        创建于 ${Utils.formatDate(textbook.createdAt)}
                    </div>
                </div>
            `;
        }).join('');

        bindCardEvents();
        updateStats();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== 绑定卡片事件 ==========
    function bindCardEvents() {
        // 点击卡片进入详情（排除按钮点击）
        document.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // 如果点击的是按钮，不跳转
                if (e.target.closest('.btn-icon')) return;

                const id = card.dataset.id;
                window.location.href = `textbook-detail.html?id=${id}`;
            });
        });

        // 编辑按钮
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                openEditModal(id);
            });
        });

        // 删除按钮
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                openDeleteConfirm(id);
            });
        });
    }

    // ========== 打开编辑模态框 ==========
    function openEditModal(id) {
        const textbooks = Storage.load('textbooks', []);
        const textbook = textbooks.find(t => t.id === id);

        if (!textbook) return;

        elements.textbookId.value = textbook.id;
        elements.textbookName.value = textbook.name;
        elements.textbookDescription.value = textbook.description || '';
        elements.textbookColor.value = textbook.color || '#2563eb';
        elements.modalTitle.textContent = '编辑教材';

        // 设置颜色选择
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.color === (textbook.color || '#2563eb')) {
                btn.classList.add('active');
            }
        });

        openModal(elements.textbookModal);
    }

    // ========== 打开删除确认框 ==========
    function openDeleteConfirm(id) {
        const textbooks = Storage.load('textbooks', []);
        const textbook = textbooks.find(t => t.id === id);

        if (!textbook) return;

        const stats = getTextbookStats(id);

        elements.deleteTextbookId.value = id;
        document.getElementById('confirm-message').textContent =
            `确定要删除教材"${textbook.name}"吗？该教材下有 ${stats.courseCount} 个课程和 ${stats.lessonCount} 篇课文。`;

        openModal(elements.confirmModal);
    }

    // ========== 保存教材 ==========
    function saveTextbook(e) {
        e.preventDefault();

        const id = elements.textbookId.value;
        const textbookData = {
            name: elements.textbookName.value.trim(),
            description: elements.textbookDescription.value.trim(),
            color: elements.textbookColor.value
        };

        if (!textbookData.name) {
            Utils.showMessage('请输入教材名称', 'error');
            return;
        }

        const textbooks = Storage.load('textbooks', []);

        if (id) {
            // 编辑模式
            const index = textbooks.findIndex(t => t.id === id);
            if (index !== -1) {
                textbooks[index] = {
                    ...textbooks[index],
                    ...textbookData,
                    updatedAt: Date.now()
                };
                Utils.showMessage('教材更新成功', 'success');
            }
        } else {
            // 添加模式
            textbooks.push({
                id: Utils.generateId(),
                ...textbookData,
                createdAt: Date.now()
            });
            Utils.showMessage('教材添加成功', 'success');
        }

        Storage.save('textbooks', textbooks);
        closeModal(elements.textbookModal);
        resetForm();
        renderTextbooks();
    }

    // ========== 删除教材 ==========
    function deleteTextbook() {
        const id = elements.deleteTextbookId.value;

        // 删除教材
        let textbooks = Storage.load('textbooks', []);
        textbooks = textbooks.filter(t => t.id !== id);
        Storage.save('textbooks', textbooks);

        // 删除关联的课程
        let courses = Storage.load('courses', []);
        const deletedCourseIds = courses.filter(c => c.textbookId === id).map(c => c.id);
        courses = courses.filter(c => c.textbookId !== id);
        Storage.save('courses', courses);

        // 删除关联的课文
        let lessons = Storage.load('lessons', []);
        const lessonIds = lessons.filter(l => deletedCourseIds.includes(l.courseId)).map(l => l.id);
        lessons = lessons.filter(l => !deletedCourseIds.includes(l.courseId));
        Storage.save('lessons', lessons);

        // 同步删除这些课文的所有笔记
        let globalNotes = Storage.load('notes', []);
        const beforeCount = globalNotes.length;
        globalNotes = globalNotes.filter(n => !lessonIds.includes(n.lessonId));
        Storage.save('notes', globalNotes);
        const deletedCount = beforeCount - globalNotes.length;

        closeModal(elements.confirmModal);

        if (deletedCount > 0) {
            Utils.showMessage(`教材已删除,同时删除了 ${deletedCount} 条笔记`, 'success');
        } else {
            Utils.showMessage('教材已删除', 'success');
        }

        renderTextbooks();
    }

    // ========== 事件绑定 ==========

    // 添加按钮
    elements.addTextbookBtn.addEventListener('click', () => {
        resetForm();
        openModal(elements.textbookModal);
    });

    elements.emptyAddBtn.addEventListener('click', () => {
        resetForm();
        openModal(elements.textbookModal);
    });

    // 搜索
    elements.searchInput.addEventListener('input', Utils.debounce(() => {
        renderTextbooks();
    }, 300));

    // 模态框
    elements.modalCloseBtn.addEventListener('click', () => closeModal(elements.textbookModal));
    elements.modalCancelBtn.addEventListener('click', () => closeModal(elements.textbookModal));
    elements.textbookForm.addEventListener('submit', saveTextbook);

    // 确认删除
    elements.confirmCloseBtn.addEventListener('click', () => closeModal(elements.confirmModal));
    elements.confirmCancelBtn.addEventListener('click', () => closeModal(elements.confirmModal));
    elements.confirmDeleteBtn.addEventListener('click', deleteTextbook);

    // 点击遮罩关闭
    elements.textbookModal.addEventListener('click', (e) => {
        if (e.target === elements.textbookModal) closeModal(elements.textbookModal);
    });
    elements.confirmModal.addEventListener('click', (e) => {
        if (e.target === elements.confirmModal) closeModal(elements.confirmModal);
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(elements.textbookModal);
            closeModal(elements.confirmModal);
        }
    });

    // ========== 初始化 ==========
    renderTextbooks();
});