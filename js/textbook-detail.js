/**
 * 教材详情页脚本
 * 功能：显示教材信息，管理课程列表
 */
document.addEventListener('DOMContentLoaded', () => {
    const { Storage, Utils } = window.TextbookSystem;

    // 获取 URL 参数中的教材 ID
    const urlParams = new URLSearchParams(window.location.search);
    const textbookId = urlParams.get('id');

    // 如果没有 ID，返回教材列表
    if (!textbookId) {
        window.location.href = 'textbooks.html';
        return;
    }

    // 获取教材信息
    let currentTextbook = null;

    function loadTextbook() {
        const textbooks = Storage.load('textbooks', []);
        currentTextbook = textbooks.find(t => t.id === textbookId);

        if (!currentTextbook) {
            Utils.showMessage('教材不存在', 'error');
            setTimeout(() => {
                window.location.href = 'textbooks.html';
            }, 1500);
            return false;
        }

        return true;
    }

    if (!loadTextbook()) return;

    // ========== DOM 元素 ==========
    const elements = {
        breadcrumbCurrent: document.getElementById('breadcrumb-current'),
        textbookName: document.getElementById('textbook-name'),
        textbookDescription: document.getElementById('textbook-description'),
        textbookDate: document.getElementById('textbook-date'),
        courseCount: document.getElementById('course-count'),
        lessonCount: document.getElementById('lesson-count'),
        textbookHeader: document.getElementById('textbook-header'),

        courseList: document.getElementById('course-list'),
        emptyState: document.getElementById('empty-state'),
        searchInput: document.getElementById('search-input'),

        editTextbookBtn: document.getElementById('edit-textbook-btn'),
        addCourseBtn: document.getElementById('add-course-btn'),
        emptyAddBtn: document.getElementById('empty-add-btn'),

        // 教材编辑模态框
        textbookModal: document.getElementById('textbook-modal'),
        textbookModalClose: document.getElementById('textbook-modal-close'),
        textbookModalCancel: document.getElementById('textbook-modal-cancel'),
        textbookForm: document.getElementById('textbook-form'),
        editTextbookName: document.getElementById('edit-textbook-name'),
        editTextbookDescription: document.getElementById('edit-textbook-description'),
        editTextbookColor: document.getElementById('edit-textbook-color'),
        colorPicker: document.getElementById('color-picker'),

        // 课程模态框
        courseModal: document.getElementById('course-modal'),
        courseModalTitle: document.getElementById('course-modal-title'),
        courseModalClose: document.getElementById('course-modal-close'),
        courseModalCancel: document.getElementById('course-modal-cancel'),
        courseForm: document.getElementById('course-form'),
        courseId: document.getElementById('course-id'),
        courseName: document.getElementById('course-name'),
        courseDescription: document.getElementById('course-description'),
        courseOrder: document.getElementById('course-order'),

        // 确认删除模态框
        confirmModal: document.getElementById('confirm-modal'),
        confirmModalClose: document.getElementById('confirm-modal-close'),
        confirmModalCancel: document.getElementById('confirm-modal-cancel'),
        confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
        deleteCourseId: document.getElementById('delete-course-id')
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

    // ========== 渲染教材信息 ==========
    function renderTextbookInfo() {
        const color = currentTextbook.color || '#2563eb';

        // 设置顶部颜色条
        elements.textbookHeader.style.borderTop = `4px solid ${color}`;

        elements.breadcrumbCurrent.textContent = currentTextbook.name;
        elements.textbookName.textContent = currentTextbook.name;
        elements.textbookDescription.textContent = currentTextbook.description || '暂无描述';
        elements.textbookDate.textContent = Utils.formatDate(currentTextbook.createdAt);

        // 更新页面标题
        document.title = `${currentTextbook.name}`;

        updateStats();
    }

    // ========== 统计信息 ==========
    function updateStats() {
        const courses = Storage.load('courses', []);
        const lessons = Storage.load('lessons', []);

        const textbookCourses = courses.filter(c => c.textbookId === textbookId);
        const courseIds = textbookCourses.map(c => c.id);
        const textbookLessons = lessons.filter(l => courseIds.includes(l.courseId));

        elements.courseCount.textContent = textbookCourses.length;
        elements.lessonCount.textContent = textbookLessons.length;
    }

    // ========== 获取课程下的课文数 ==========
    function getLessonCount(courseId) {
        const lessons = Storage.load('lessons', []);
        return lessons.filter(l => l.courseId === courseId).length;
    }

    // ========== 渲染课程列表 ==========
    function renderCourses() {
        const courses = Storage.load('courses', []);
        const searchTerm = elements.searchInput.value.trim().toLowerCase();

        // 筛选当前教材的课程
        let textbookCourses = courses.filter(c => c.textbookId === textbookId);

        // 搜索过滤
        if (searchTerm) {
            textbookCourses = textbookCourses.filter(c =>
                c.name.toLowerCase().includes(searchTerm) ||
                (c.description && c.description.toLowerCase().includes(searchTerm))
            );
        }

        // 按序号和创建时间排序
        textbookCourses.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 9999;
            const orderB = b.order !== undefined ? b.order : 9999;
            if (orderA !== orderB) return orderA - orderB;
            return a.createdAt - b.createdAt;
        });

        if (textbookCourses.length === 0) {
            elements.courseList.style.display = 'none';
            elements.emptyState.style.display = 'block';

            if (searchTerm) {
                elements.emptyState.querySelector('h3').textContent = '未找到匹配的课程';
                elements.emptyState.querySelector('p').textContent = '尝试使用其他关键词搜索';
                elements.emptyAddBtn.style.display = 'none';
            } else {
                elements.emptyState.querySelector('h3').textContent = '暂无课程';
                elements.emptyState.querySelector('p').textContent = '点击上方"添加课程"按钮，为这本教材创建第一个课程';
                elements.emptyAddBtn.style.display = 'inline-flex';
            }
            return;
        }

        elements.courseList.style.display = 'grid';
        elements.emptyState.style.display = 'none';

        elements.courseList.innerHTML = textbookCourses.map((course, index) => {
            const lessonCount = getLessonCount(course.id);

            return `
                <div class="card item-card card-clickable" data-id="${course.id}">
                    <div class="item-card-header">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span class="course-number">${index + 1}</span>
                            <h3 class="item-card-title">${escapeHtml(course.name)}</h3>
                        </div>
                    </div>

                    <p class="item-card-description">
                        ${course.description ? escapeHtml(course.description) : '<span style="color: var(--text-light);">暂无描述</span>'}
                    </p>

                    <div class="item-card-meta">
                        <div class="item-card-stats">
                            <span class="item-card-stat">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                                ${lessonCount} 篇课文
                            </span>
                        </div>
                        <div class="item-card-actions">
                            <button class="btn-icon edit-btn" data-id="${course.id}" title="编辑" aria-label="编辑">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon delete delete-btn" data-id="${course.id}" title="删除" aria-label="删除">
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

        bindCourseEvents();
        updateStats();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== 绑定课程卡片事件 ==========
    function bindCourseEvents() {
        // 点击卡片进入课程详情
        document.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-icon')) return;

                const courseId = card.dataset.id;
                window.location.href = `course-detail.html?id=${courseId}`;
            });
        });

        // 编辑按钮
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditCourseModal(e.currentTarget.dataset.id);
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

    // ========== 编辑教材 ==========
    function openEditTextbookModal() {
        elements.editTextbookName.value = currentTextbook.name;
        elements.editTextbookDescription.value = currentTextbook.description || '';
        elements.editTextbookColor.value = currentTextbook.color || '#2563eb';

        // 设置颜色选择
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.color === (currentTextbook.color || '#2563eb')) {
                btn.classList.add('active');
            }
        });

        openModal(elements.textbookModal);
    }

    function saveTextbook(e) {
        e.preventDefault();

        const textbooks = Storage.load('textbooks', []);
        const index = textbooks.findIndex(t => t.id === textbookId);

        if (index === -1) return;

        textbooks[index] = {
            ...textbooks[index],
            name: elements.editTextbookName.value.trim(),
            description: elements.editTextbookDescription.value.trim(),
            color: elements.editTextbookColor.value,
            updatedAt: Date.now()
        };

        Storage.save('textbooks', textbooks);
        currentTextbook = textbooks[index];

        closeModal(elements.textbookModal);
        renderTextbookInfo();
        Utils.showMessage('教材更新成功', 'success');
    }

    // ========== 课程操作 ==========
    function resetCourseForm() {
        elements.courseForm.reset();
        elements.courseId.value = '';
        elements.courseModalTitle.textContent = '添加课程';
    }

    function openEditCourseModal(courseId) {
        const courses = Storage.load('courses', []);
        const course = courses.find(c => c.id === courseId);

        if (!course) return;

        elements.courseId.value = course.id;
        elements.courseName.value = course.name;
        elements.courseDescription.value = course.description || '';
        elements.courseOrder.value = course.order !== undefined ? course.order : '';
        elements.courseModalTitle.textContent = '编辑课程';

        openModal(elements.courseModal);
    }

    function saveCourse(e) {
        e.preventDefault();

        const id = elements.courseId.value;
        const courseData = {
            name: elements.courseName.value.trim(),
            description: elements.courseDescription.value.trim(),
            order: elements.courseOrder.value ? parseInt(elements.courseOrder.value) : undefined,
            textbookId: textbookId
        };

        if (!courseData.name) {
            Utils.showMessage('请输入课程名称', 'error');
            return;
        }

        const courses = Storage.load('courses', []);

        if (id) {
            const index = courses.findIndex(c => c.id === id);
            if (index !== -1) {
                courses[index] = {
                    ...courses[index],
                    ...courseData,
                    updatedAt: Date.now()
                };
                Utils.showMessage('课程更新成功', 'success');
            }
        } else {
            courses.push({
                id: Utils.generateId(),
                ...courseData,
                createdAt: Date.now()
            });
            Utils.showMessage('课程添加成功', 'success');
        }

        Storage.save('courses', courses);
        closeModal(elements.courseModal);
        resetCourseForm();
        renderCourses();
    }

    function openDeleteConfirm(courseId) {
        const courses = Storage.load('courses', []);
        const course = courses.find(c => c.id === courseId);

        if (!course) return;

        const lessonCount = getLessonCount(courseId);

        elements.deleteCourseId.value = courseId;
        document.getElementById('confirm-message').textContent =
            `确定要删除课程"${course.name}"吗？该课程下有 ${lessonCount} 篇课文。`;

        openModal(elements.confirmModal);
    }

    function deleteCourse() {
        const courseId = elements.deleteCourseId.value;

        // 删除课程
        let courses = Storage.load('courses', []);
        courses = courses.filter(c => c.id !== courseId);
        Storage.save('courses', courses);

        // 删除关联的课文
        let lessons = Storage.load('lessons', []);
        const lessonIds = lessons.filter(l => l.courseId === courseId).map(l => l.id);
        lessons = lessons.filter(l => l.courseId !== courseId);
        Storage.save('lessons', lessons);

        // 同步删除这些课文的所有笔记
        let globalNotes = Storage.load('notes', []);
        const beforeCount = globalNotes.length;
        globalNotes = globalNotes.filter(n => !lessonIds.includes(n.lessonId));
        Storage.save('notes', globalNotes);
        const deletedCount = beforeCount - globalNotes.length;

        closeModal(elements.confirmModal);

        if (deletedCount > 0) {
            Utils.showMessage(`课程已删除,同时删除了 ${deletedCount} 条笔记`, 'success');
        } else {
            Utils.showMessage('课程已删除', 'success');
        }

        renderCourses();
    }

    // ========== 颜色选择器 ==========
    elements.colorPicker.addEventListener('click', (e) => {
        const colorBtn = e.target.closest('.color-option');
        if (!colorBtn) return;

        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.remove('active');
        });
        colorBtn.classList.add('active');
        elements.editTextbookColor.value = colorBtn.dataset.color;
    });

    // ========== 事件绑定 ==========

    // 编辑教材
    elements.editTextbookBtn.addEventListener('click', openEditTextbookModal);
    elements.textbookModalClose.addEventListener('click', () => closeModal(elements.textbookModal));
    elements.textbookModalCancel.addEventListener('click', () => closeModal(elements.textbookModal));
    elements.textbookForm.addEventListener('submit', saveTextbook);

    // 添加课程
    elements.addCourseBtn.addEventListener('click', () => {
        resetCourseForm();
        openModal(elements.courseModal);
    });
    elements.emptyAddBtn.addEventListener('click', () => {
        resetCourseForm();
        openModal(elements.courseModal);
    });

    // 课程模态框
    elements.courseModalClose.addEventListener('click', () => closeModal(elements.courseModal));
    elements.courseModalCancel.addEventListener('click', () => closeModal(elements.courseModal));
    elements.courseForm.addEventListener('submit', saveCourse);

    // 确认删除
    elements.confirmModalClose.addEventListener('click', () => closeModal(elements.confirmModal));
    elements.confirmModalCancel.addEventListener('click', () => closeModal(elements.confirmModal));
    elements.confirmDeleteBtn.addEventListener('click', deleteCourse);

    // 搜索
    elements.searchInput.addEventListener('input', Utils.debounce(() => {
        renderCourses();
    }, 300));

    // 点击遮罩关闭
    [elements.textbookModal, elements.courseModal, elements.confirmModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(elements.textbookModal);
            closeModal(elements.courseModal);
            closeModal(elements.confirmModal);
        }
    });

    // ========== 初始化 ==========
    renderTextbookInfo();
    renderCourses();
});