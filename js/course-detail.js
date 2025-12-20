/**
 * 课程详情页脚本
 * 功能：显示课程信息，管理课文列表
 */
document.addEventListener('DOMContentLoaded', () => {
    const { Storage, Utils } = window.TextbookSystem;

    // 获取 URL 参数中的课程 ID
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');

    if (!courseId) {
        window.location.href = 'textbooks.html';
        return;
    }

    // 当前数据
    let currentCourse = null;
    let currentTextbook = null;

    function loadCourseData() {
        const courses = Storage.load('courses', []);
        currentCourse = courses.find(c => c.id === courseId);

        if (!currentCourse) {
            Utils.showMessage('课程不存在', 'error');
            setTimeout(() => {
                window.location.href = 'textbooks.html';
            }, 1500);
            return false;
        }

        const textbooks = Storage.load('textbooks', []);
        currentTextbook = textbooks.find(t => t.id === currentCourse.textbookId);

        return true;
    }

    if (!loadCourseData()) return;

    // ========== DOM 元素 ==========
    const elements = {
        breadcrumbTextbook: document.getElementById('breadcrumb-textbook'),
        breadcrumbCurrent: document.getElementById('breadcrumb-current'),
        courseNumber: document.getElementById('course-number'),
        courseName: document.getElementById('course-name'),
        courseDescription: document.getElementById('course-description'),
        textbookName: document.getElementById('textbook-name'),
        lessonCount: document.getElementById('lesson-count'),
        courseHeader: document.getElementById('course-header'),

        lessonList: document.getElementById('lesson-list'),
        emptyState: document.getElementById('empty-state'),
        searchInput: document.getElementById('search-input'),
        filterType: document.getElementById('filter-type'),

        editCourseBtn: document.getElementById('edit-course-btn'),
        addLessonBtn: document.getElementById('add-lesson-btn'),
        emptyAddBtn: document.getElementById('empty-add-btn'),

        // 编辑课程模态框
        courseModal: document.getElementById('course-modal'),
        courseModalClose: document.getElementById('course-modal-close'),
        courseModalCancel: document.getElementById('course-modal-cancel'),
        courseForm: document.getElementById('course-form'),
        editCourseName: document.getElementById('edit-course-name'),
        editCourseDescription: document.getElementById('edit-course-description'),
        editCourseOrder: document.getElementById('edit-course-order'),

        // 添加课文模态框
        addLessonModal: document.getElementById('add-lesson-modal'),
        addLessonModalClose: document.getElementById('add-lesson-modal-close'),
        addLessonModalCancel: document.getElementById('add-lesson-modal-cancel'),

        // 确认删除模态框
        confirmModal: document.getElementById('confirm-modal'),
        confirmModalClose: document.getElementById('confirm-modal-close'),
        confirmModalCancel: document.getElementById('confirm-modal-cancel'),
        confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
        deleteLessonId: document.getElementById('delete-lesson-id')
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

    // ========== 获取课程序号 ==========
    function getCourseNumber() {
        const courses = Storage.load('courses', []);
        const textbookCourses = courses
            .filter(c => c.textbookId === currentCourse.textbookId)
            .sort((a, b) => {
                const orderA = a.order !== undefined ? a.order : 9999;
                const orderB = b.order !== undefined ? b.order : 9999;
                if (orderA !== orderB) return orderA - orderB;
                return a.createdAt - b.createdAt;
            });

        return textbookCourses.findIndex(c => c.id === courseId) + 1;
    }

    // ========== 渲染课程信息 ==========
    function renderCourseInfo() {
        // 面包屑
        if (currentTextbook) {
            elements.breadcrumbTextbook.textContent = currentTextbook.name;
            elements.breadcrumbTextbook.href = `textbook-detail.html?id=${currentTextbook.id}`;
            elements.textbookName.textContent = currentTextbook.name;

            // 设置顶部颜色
            const color = currentTextbook.color || '#2563eb';
            elements.courseHeader.style.borderTop = `4px solid ${color}`;
        }

        elements.breadcrumbCurrent.textContent = currentCourse.name;
        elements.courseNumber.textContent = getCourseNumber();
        elements.courseName.textContent = currentCourse.name;
        elements.courseDescription.textContent = currentCourse.description || '暂无描述';

        document.title = `${currentCourse.name}`;

        updateStats();
    }

    // ========== 统计信息 ==========
    function updateStats() {
        const lessons = Storage.load('lessons', []);
        const courseLessons = lessons.filter(l => l.courseId === courseId);
        elements.lessonCount.textContent = courseLessons.length;
    }

    // ========== 渲染课文列表 ==========
    function renderLessons() {
        const lessons = Storage.load('lessons', []);
        const searchTerm = elements.searchInput.value.trim().toLowerCase();
        const filterType = elements.filterType.value;

        // 筛选当前课程的课文
        let courseLessons = lessons.filter(l => l.courseId === courseId);

        // 搜索过滤
        if (searchTerm) {
            courseLessons = courseLessons.filter(l =>
                l.title.toLowerCase().includes(searchTerm)
            );
        }

        // 类型过滤
        if (filterType) {
            courseLessons = courseLessons.filter(l => l.type === filterType);
        }

        // 按序号和创建时间排序
        courseLessons.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 9999;
            const orderB = b.order !== undefined ? b.order : 9999;
            if (orderA !== orderB) return orderA - orderB;
            return a.createdAt - b.createdAt;
        });

        if (courseLessons.length === 0) {
            elements.lessonList.style.display = 'none';
            elements.emptyState.style.display = 'block';

            if (searchTerm || filterType) {
                elements.emptyState.querySelector('h3').textContent = '未找到匹配的课文';
                elements.emptyState.querySelector('p').textContent = '尝试调整搜索条件';
                elements.emptyAddBtn.style.display = 'none';
            } else {
                elements.emptyState.querySelector('h3').textContent = '暂无课文';
                elements.emptyState.querySelector('p').textContent = '点击上方"添加课文"按钮，为这个课程创建第一篇课文';
                elements.emptyAddBtn.style.display = 'inline-flex';
            }
            return;
        }

        elements.lessonList.style.display = 'grid';
        elements.emptyState.style.display = 'none';

        elements.lessonList.innerHTML = courseLessons.map((lesson, index) => {
            const typeLabel = lesson.type === 'dialogue' ? '对话式' : '整体式';
            const typeClass = lesson.type === 'dialogue' ? 'tag-primary' : 'tag-success';
            const typeIcon = lesson.type === 'dialogue'
                ? '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>'
                : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>';

            // 获取内容预览
            let preview = '';
            if (lesson.type === 'dialogue' && lesson.dialogues && lesson.dialogues.length > 0) {
                preview = lesson.dialogues.slice(0, 2).map(d => `${d.speaker}: ${d.content}`).join(' / ');
            } else if (lesson.content) {
                preview = lesson.content;
            }
            preview = preview.length > 80 ? preview.substring(0, 80) + '...' : preview;

            return `
                <div class="card item-card card-clickable" data-id="${lesson.id}">
                    <div class="item-card-header">
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
                            <span class="lesson-number">${index + 1}</span>
                            <h3 class="item-card-title truncate">${escapeHtml(lesson.title)}</h3>
                        </div>
                        <span class="tag ${typeClass}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${typeIcon}
                            </svg>
                            ${typeLabel}
                        </span>
                    </div>

                    <p class="item-card-description">
                        ${preview ? escapeHtml(preview) : '<span style="color: var(--text-light);">暂无内容</span>'}
                    </p>

                    <div class="item-card-meta">
                        <span style="font-size: 0.75rem; color: var(--text-light);">
                            创建于 ${Utils.formatDate(lesson.createdAt)}
                        </span>
                        <div class="item-card-actions">
                            <button class="btn-icon edit-btn" data-id="${lesson.id}" title="编辑" aria-label="编辑">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon delete delete-btn" data-id="${lesson.id}" title="删除" aria-label="删除">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        bindLessonEvents();
        updateStats();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== 绑定课文事件 ==========
    function bindLessonEvents() {
        // 点击卡片进入课文详情/编辑
        document.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-icon')) return;

                const lessonId = card.dataset.id;
                window.location.href = `lesson-edit.html?id=${lessonId}`;
            });
        });

        // 编辑按钮
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lessonId = e.currentTarget.dataset.id;
                window.location.href = `lesson-edit.html?id=${lessonId}`;
            });
        });

        // 删除按钮
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openDeleteConfirm(e.currentTarget.dataset.id);
            });
        });
    }

    // ========== 编辑课程 ==========
    function openEditCourseModal() {
        elements.editCourseName.value = currentCourse.name;
        elements.editCourseDescription.value = currentCourse.description || '';
        elements.editCourseOrder.value = currentCourse.order !== undefined ? currentCourse.order : '';

        openModal(elements.courseModal);
    }

    function saveCourse(e) {
        e.preventDefault();

        const courses = Storage.load('courses', []);
        const index = courses.findIndex(c => c.id === courseId);

        if (index === -1) return;

        courses[index] = {
            ...courses[index],
            name: elements.editCourseName.value.trim(),
            description: elements.editCourseDescription.value.trim(),
            order: elements.editCourseOrder.value ? parseInt(elements.editCourseOrder.value) : undefined,
            updatedAt: Date.now()
        };

        Storage.save('courses', courses);
        currentCourse = courses[index];

        closeModal(elements.courseModal);
        renderCourseInfo();
        Utils.showMessage('课程更新成功', 'success');
    }

    // ========== 添加课文 ==========
    function openAddLessonModal() {
        openModal(elements.addLessonModal);
    }

    // 选择课文类型
    document.querySelectorAll('.lesson-type-card').forEach(card => {
        card.addEventListener('click', () => {
            const type = card.dataset.type;
            closeModal(elements.addLessonModal);

            // 跳转到课文编辑页面，带上类型和课程 ID
            window.location.href = `lesson-edit.html?courseId=${courseId}&type=${type}`;
        });
    });

    // ========== 删除课文 ==========
    function openDeleteConfirm(lessonId) {
        const lessons = Storage.load('lessons', []);
        const lesson = lessons.find(l => l.id === lessonId);

        if (!lesson) return;

        elements.deleteLessonId.value = lessonId;
        document.getElementById('confirm-message').textContent =
            `确定要删除课文"${lesson.title}"吗？此操作不可恢复。`;

        openModal(elements.confirmModal);
    }

    function deleteLesson() {
        const lessonId = elements.deleteLessonId.value;

        let lessons = Storage.load('lessons', []);
        lessons = lessons.filter(l => l.id !== lessonId);
        Storage.save('lessons', lessons);

        // 同步删除该课文的所有笔记
        let globalNotes = Storage.load('notes', []);
        const beforeCount = globalNotes.length;
        globalNotes = globalNotes.filter(n => n.lessonId !== lessonId);
        Storage.save('notes', globalNotes);
        const deletedCount = beforeCount - globalNotes.length;

        closeModal(elements.confirmModal);

        if (deletedCount > 0) {
            Utils.showMessage(`课文已删除,同时删除了 ${deletedCount} 条笔记`, 'success');
        } else {
            Utils.showMessage('课文已删除', 'success');
        }

        renderLessons();
    }

    // ========== 事件绑定 ==========

    // 编辑课程
    elements.editCourseBtn.addEventListener('click', openEditCourseModal);
    elements.courseModalClose.addEventListener('click', () => closeModal(elements.courseModal));
    elements.courseModalCancel.addEventListener('click', () => closeModal(elements.courseModal));
    elements.courseForm.addEventListener('submit', saveCourse);

    // 添加课文
    elements.addLessonBtn.addEventListener('click', openAddLessonModal);
    elements.emptyAddBtn.addEventListener('click', openAddLessonModal);
    elements.addLessonModalClose.addEventListener('click', () => closeModal(elements.addLessonModal));
    elements.addLessonModalCancel.addEventListener('click', () => closeModal(elements.addLessonModal));

    // 确认删除
    elements.confirmModalClose.addEventListener('click', () => closeModal(elements.confirmModal));
    elements.confirmModalCancel.addEventListener('click', () => closeModal(elements.confirmModal));
    elements.confirmDeleteBtn.addEventListener('click', deleteLesson);

    // 搜索和筛选
    elements.searchInput.addEventListener('input', Utils.debounce(() => {
        renderLessons();
    }, 300));

    elements.filterType.addEventListener('change', () => {
        renderLessons();
    });

    // 点击遮罩关闭
    [elements.courseModal, elements.addLessonModal, elements.confirmModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(elements.courseModal);
            closeModal(elements.addLessonModal);
            closeModal(elements.confirmModal);
        }
    });

    // ========== 初始化 ==========
    renderCourseInfo();
    renderLessons();
});