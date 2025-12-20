/**
 * 生词管理页面脚本
 * 功能：增删改查生词，搜索过滤，关联课文
 */
document.addEventListener('DOMContentLoaded', () => {
    // 获取全局模块
    const { Storage, Utils } = window.TextbookSystem;

    // ========== DOM 元素引用 ==========
    const elements = {
        // 列表和状态
        wordList: document.getElementById('word-list'),
        emptyState: document.getElementById('empty-state'),
        searchInput: document.getElementById('search-input'),

        // 统计
        totalCount: document.getElementById('total-count'),
        todayCount: document.getElementById('today-count'),

        // 添加按钮
        addWordBtn: document.getElementById('add-word-btn'),
        emptyAddBtn: document.getElementById('empty-add-btn'),

        // 生词模态框
        wordModal: document.getElementById('word-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalCloseBtn: document.getElementById('modal-close-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
        wordForm: document.getElementById('word-form'),

        // 表单字段
        wordId: document.getElementById('word-id'),
        wordText: document.getElementById('word-text'),
        wordPhonetic: document.getElementById('word-phonetic'),
        wordDefinition: document.getElementById('word-definition'),
        wordExample: document.getElementById('word-example'),
        wordLesson: document.getElementById('word-lesson'),

        // 确认删除模态框
        confirmModal: document.getElementById('confirm-modal'),
        confirmCloseBtn: document.getElementById('confirm-close-btn'),
        confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
        confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
        deleteWordId: document.getElementById('delete-word-id')
    };

    // ========== 模态框控制 ==========

    /**
     * 打开模态框
     * @param {HTMLElement} modal - 模态框元素
     */
    function openModal(modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    }

    /**
     * 关闭模态框
     * @param {HTMLElement} modal - 模态框元素
     */
    function closeModal(modal) {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // 恢复滚动
    }

    /**
     * 重置表单
     */
    function resetForm() {
        elements.wordForm.reset();
        elements.wordId.value = '';
        elements.modalTitle.textContent = '添加生词';
    }

    // ========== 数据操作 ==========

    /**
     * 获取所有课文（用于关联选择）
     */
    function loadLessonsForSelect() {
        const lessons = Storage.load('lessons', []);
        const courses = Storage.load('courses', []);
        const textbooks = Storage.load('textbooks', []);

        elements.wordLesson.innerHTML = '<option value="">不关联课文</option>';

        lessons.forEach(lesson => {
            const course = courses.find(c => c.id === lesson.courseId);
            const textbook = course ? textbooks.find(t => t.id === course.textbookId) : null;

            let label = lesson.title;
            if (course) {
                label = `${lesson.title} (${course.name})`;
            }
            if (textbook) {
                label = `${lesson.title} (${textbook.name} - ${course.name})`;
            }

            const option = document.createElement('option');
            option.value = lesson.id;
            option.textContent = label;
            elements.wordLesson.appendChild(option);
        });
    }

    /**
     * 更新统计信息
     */
    function updateStats() {
        const vocabulary = Storage.load('vocabulary', []);
        const today = new Date().toDateString();

        const todayWords = vocabulary.filter(w => {
            return new Date(w.createdAt).toDateString() === today;
        });

        elements.totalCount.textContent = vocabulary.length;
        elements.todayCount.textContent = todayWords.length;
    }

    /**
     * 渲染生词列表
     * @param {string} searchTerm - 搜索关键词
     */
    function renderVocabulary(searchTerm = '') {
        const vocabulary = Storage.load('vocabulary', []);
        const lessons = Storage.load('lessons', []);

        // 过滤搜索结果
        let filteredWords = vocabulary;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredWords = vocabulary.filter(w =>
                w.word.toLowerCase().includes(term) ||
                w.definition.toLowerCase().includes(term) ||
                (w.example && w.example.toLowerCase().includes(term))
            );
        }

        // 按创建时间倒序排列
        filteredWords.sort((a, b) => b.createdAt - a.createdAt);

        // 检查是否为空
        if (filteredWords.length === 0) {
            elements.wordList.style.display = 'none';
            elements.emptyState.style.display = 'block';

            if (searchTerm) {
                elements.emptyState.querySelector('h3').textContent = '未找到匹配的生词';
                elements.emptyState.querySelector('p').textContent = '尝试使用其他关键词搜索';
                elements.emptyAddBtn.style.display = 'none';
            } else {
                elements.emptyState.querySelector('h3').textContent = '暂无生词';
                elements.emptyState.querySelector('p').textContent = '点击上方"添加生词"按钮，开始积累您的词汇库';
                elements.emptyAddBtn.style.display = 'inline-flex';
            }
            return;
        }

        elements.wordList.style.display = 'grid';
        elements.emptyState.style.display = 'none';

        // 渲染卡片
        elements.wordList.innerHTML = filteredWords.map(word => {
            const lesson = lessons.find(l => l.id === word.lessonId);

            return `
                <div class="card word-card" data-id="${word.id}">
                    <div class="word-header">
                        <div>
                            <div class="word-text">${escapeHtml(word.word)}</div>
                            ${word.phonetic ? `<div class="word-phonetic">${escapeHtml(word.phonetic)}</div>` : ''}
                        </div>
                        ${lesson ? `
                            <span class="word-lesson-tag">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                                ${escapeHtml(lesson.title)}
                            </span>
                        ` : ''}
                    </div>

                    <p class="word-definition">${escapeHtml(word.definition)}</p>

                    ${word.example ? `
                        <div class="word-example">
                            "${escapeHtml(word.example)}"
                        </div>
                    ` : ''}

                    <div class="word-meta">
                        <span class="word-date">
                            添加于 ${Utils.formatDate(word.createdAt)}
                        </span>
                        <div class="word-actions">
                            <button class="btn-icon edit-btn" data-id="${word.id}"
                                    title="编辑" aria-label="编辑">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                     stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon delete delete-btn" data-id="${word.id}"
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

        // 绑定编辑和删除事件
        bindCardEvents();

        // 更新统计
        updateStats();
    }

    /**
     * HTML 转义，防止 XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 绑定卡片上的事件
     */
    function bindCardEvents() {
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
     * 打开编辑模态框
     */
    function openEditModal(id) {
        const vocabulary = Storage.load('vocabulary', []);
        const word = vocabulary.find(w => w.id === id);

        if (!word) return;

        loadLessonsForSelect();

        elements.wordId.value = word.id;
        elements.wordText.value = word.word;
        elements.wordPhonetic.value = word.phonetic || '';
        elements.wordDefinition.value = word.definition;
        elements.wordExample.value = word.example || '';
        elements.wordLesson.value = word.lessonId || '';
        elements.modalTitle.textContent = '编辑生词';

        openModal(elements.wordModal);
    }

    /**
     * 打开删除确认框
     */
    function openDeleteConfirm(id) {
        const vocabulary = Storage.load('vocabulary', []);
        const word = vocabulary.find(w => w.id === id);

        if (!word) return;

        elements.deleteWordId.value = id;
        document.getElementById('confirm-message').textContent =
            `确定要删除生词"${word.word}"吗？此操作不可恢复。`;

        openModal(elements.confirmModal);
    }

    /**
     * 保存生词
     */
    function saveWord(e) {
        e.preventDefault();

        const id = elements.wordId.value;
        const wordData = {
            word: elements.wordText.value.trim(),
            phonetic: elements.wordPhonetic.value.trim(),
            definition: elements.wordDefinition.value.trim(),
            example: elements.wordExample.value.trim(),
            lessonId: elements.wordLesson.value
        };

        if (!wordData.word || !wordData.definition) {
            Utils.showMessage('请填写生词和释义', 'error');
            return;
        }

        const vocabulary = Storage.load('vocabulary', []);

        if (id) {
            // 编辑模式
            const index = vocabulary.findIndex(w => w.id === id);
            if (index !== -1) {
                vocabulary[index] = {
                    ...vocabulary[index],
                    ...wordData,
                    updatedAt: Date.now()
                };
                Utils.showMessage('生词更新成功', 'success');
            }
        } else {
            // 添加模式
            vocabulary.push({
                id: Utils.generateId(),
                ...wordData,
                createdAt: Date.now()
            });
            Utils.showMessage('生词添加成功', 'success');
        }

        Storage.save('vocabulary', vocabulary);
        closeModal(elements.wordModal);
        resetForm();
        renderVocabulary(elements.searchInput.value);
    }

    /**
     * 删除生词
     */
    function deleteWord() {
        const id = elements.deleteWordId.value;
        let vocabulary = Storage.load('vocabulary', []);

        vocabulary = vocabulary.filter(w => w.id !== id);

        Storage.save('vocabulary', vocabulary);
        closeModal(elements.confirmModal);
        Utils.showMessage('生词已删除', 'success');
        renderVocabulary(elements.searchInput.value);
    }

    // ========== 事件绑定 ==========

    // 添加按钮点击
    elements.addWordBtn.addEventListener('click', () => {
        resetForm();
        loadLessonsForSelect();
        openModal(elements.wordModal);
    });

    elements.emptyAddBtn.addEventListener('click', () => {
        resetForm();
        loadLessonsForSelect();
        openModal(elements.wordModal);
    });

    // 模态框关闭
    elements.modalCloseBtn.addEventListener('click', () => closeModal(elements.wordModal));
    elements.modalCancelBtn.addEventListener('click', () => closeModal(elements.wordModal));

    elements.confirmCloseBtn.addEventListener('click', () => closeModal(elements.confirmModal));
    elements.confirmCancelBtn.addEventListener('click', () => closeModal(elements.confirmModal));

    // 点击遮罩关闭
    elements.wordModal.addEventListener('click', (e) => {
        if (e.target === elements.wordModal) {
            closeModal(elements.wordModal);
        }
    });

    elements.confirmModal.addEventListener('click', (e) => {
        if (e.target === elements.confirmModal) {
            closeModal(elements.confirmModal);
        }
    });

    // ESC 键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(elements.wordModal);
            closeModal(elements.confirmModal);
        }
    });

    // 表单提交
    elements.wordForm.addEventListener('submit', saveWord);

    // 确认删除
    elements.confirmDeleteBtn.addEventListener('click', deleteWord);

    // 搜索功能（防抖）
    elements.searchInput.addEventListener('input', Utils.debounce((e) => {
        renderVocabulary(e.target.value.trim());
    }, 300));

    // ========== 初始化 ==========
    renderVocabulary();
});