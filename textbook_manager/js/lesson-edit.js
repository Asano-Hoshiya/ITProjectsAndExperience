/**
 * lesson-edit.js
 * 课文编辑页面脚本
 * 功能：对话式编辑、富文本编辑、笔记管理、生词添加、连接线
 */

(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', init);

    // ========== 全局变量 ==========
    let currentLesson = null;
    let currentCourse = null;
    let currentTextbook = null;
    let speakers = [];
    let dialogues = [];
    let lessonNotes = [];
    let hasChanges = false;
    let pendingNavigation = null;
    let selectedRange = null;
    let selectedText = '';
    let selectionSource = null;
    let selectedDialogueIndex = -1;
    let activeNoteId = null;
    let currentReplacementDialogueIndex = -1;

    let savedColorRange = null; // 保存选中的范围用于颜色实时预览
    let currentTextColor = '#000000';
    let currentBgColor = '#ffff00';

    const { Storage, Utils } = window.TextbookSystem;
    const NARRATOR_ID = '__narrator__';

    // ========== 笔记同步删除辅助函数 ==========
    function deleteNotesByLessonId(lessonId) {
        let globalNotes = Storage.load('notes', []);
        const beforeCount = globalNotes.length;
        globalNotes = globalNotes.filter(n => n.lessonId !== lessonId);
        const deletedCount = beforeCount - globalNotes.length;
        Storage.save('notes', globalNotes);
        return deletedCount;
    }

    function deleteNotesByCourseId(courseId) {
        const lessons = Storage.load('lessons', []);
        const lessonIds = lessons.filter(l => l.courseId === courseId).map(l => l.id);

        let globalNotes = Storage.load('notes', []);
        const beforeCount = globalNotes.length;
        globalNotes = globalNotes.filter(n => !lessonIds.includes(n.lessonId));
        const deletedCount = beforeCount - globalNotes.length;
        Storage.save('notes', globalNotes);
        return deletedCount;
    }

    function deleteNotesByTextbookId(textbookId) {
        const courses = Storage.load('courses', []);
        const lessons = Storage.load('lessons', []);

        const courseIds = courses.filter(c => c.textbookId === textbookId).map(c => c.id);
        const lessonIds = lessons.filter(l => courseIds.includes(l.courseId)).map(l => l.id);

        let globalNotes = Storage.load('notes', []);
        const beforeCount = globalNotes.length;
        globalNotes = globalNotes.filter(n => !lessonIds.includes(n.lessonId));
        const deletedCount = beforeCount - globalNotes.length;
        Storage.save('notes', globalNotes);
        return deletedCount;
    }

    // ========== 初始化 ==========
    function init() {
        const urlParams = new URLSearchParams(window.location.search);
        const lessonId = urlParams.get('id');
        const courseId = urlParams.get('courseId');
        const lessonType = urlParams.get('type');
        const isEditMode = !!lessonId;

        if (!initData(isEditMode, lessonId, courseId, lessonType)) return;

        renderPageInfo();

        // 先绑定事件
        bindEvents();

        // 先渲染笔记，让笔记卡片存在于 DOM 中
        console.log('=== init: 开始渲染笔记 ===');
        renderNotes();
        console.log('=== init: 笔记渲染完成，笔记数量:', lessonNotes.length);

        // 然后显示编辑器（编辑器会应用高亮）
        if (currentLesson.type === 'dialogue') {
            showDialogueEditor();
        } else {
            showArticleEditor();
        }

        // 延迟初始化连接线,确保 DOM 已渲染
        console.log('=== init: 初始化连接线 ===');
        initConnectorLines();

        // 多次延迟更新连接线，确保所有内容都已加载完成
        setTimeout(() => {
            console.log('第一次尝试更新连接线');
            updateConnectorLines();
        }, 200);

        setTimeout(() => {
            console.log('第二次尝试更新连接线');
            updateConnectorLines();
        }, 500);

        setTimeout(() => {
            console.log('第三次尝试更新连接线');
            updateConnectorLines();
        }, 1000);
    }

    // ========== 数据初始化 ==========
    function initData(isEditMode, lessonId, courseId, lessonType) {
        if (isEditMode) {
            const lessons = Storage.load('lessons', []);
            currentLesson = lessons.find(l => l.id === lessonId);

            if (!currentLesson) {
                Utils.showMessage('课文不存在', 'error');
                setTimeout(() => window.location.href = 'textbooks.html', 1500);
                return false;
            }

            const courses = Storage.load('courses', []);
            currentCourse = courses.find(c => c.id === currentLesson.courseId);

            if (currentLesson.type === 'dialogue') {
                speakers = currentLesson.speakers || [];
                dialogues = currentLesson.dialogues || [];
                ensureNarratorExists();
            }

            // 从全局 notes 加载该课文的笔记
            const allNotes = Storage.load('notes', []);
            lessonNotes = allNotes.filter(n => n.lessonId === lessonId);

            console.log('=== initData 加载笔记 ===');
            console.log('课文 ID:', lessonId);
            console.log('全局笔记总数:', allNotes.length);
            console.log('该课文笔记数:', lessonNotes.length);
            console.log('笔记详情:', lessonNotes);

            // 迁移旧的 textOffset 到 textContext
            let needsUpdate = false;
            lessonNotes.forEach(note => {
                if (note.source === 'article' && note.textOffset !== undefined && !note.textContext) {
                    // 尝试重新计算上下文
                    if (currentLesson.content) {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = currentLesson.content;
                        const fullText = tempDiv.textContent;
                        const offset = note.textOffset;

                        note.textContext = {
                            before: fullText.substring(Math.max(0, offset - 30), offset),
                            after: fullText.substring(offset + note.selectedText.length, offset + note.selectedText.length + 30),
                            text: note.selectedText
                        };

                        delete note.textOffset; // 删除旧字段
                        needsUpdate = true;
                    }
                }
            });

            if (needsUpdate) {
                Storage.save('notes', allNotes);
            }

            // 保持向后兼容
            if (currentLesson.notes && currentLesson.notes.length > 0) {
                currentLesson.notes.forEach(oldNote => {
                    // 检查全局 notes 中是否已存在
                    if (!allNotes.find(n => n.id === oldNote.id)) {
                        const migratedNote = {
                            ...oldNote,
                            lessonId: currentLesson.id,
                            courseId: currentLesson.courseId,
                            textbookId: currentTextbook?.id
                        };
                        allNotes.push(migratedNote);
                        lessonNotes.push(migratedNote);
                    }
                });
                Storage.save('notes', allNotes);

                // 迁移后从课文对象中删除
                const lessons = Storage.load('lessons', []);
                const lessonIndex = lessons.findIndex(l => l.id === currentLesson.id);
                if (lessonIndex !== -1) {
                    delete lessons[lessonIndex].notes;
                    Storage.save('lessons', lessons);
                }
            }

        } else if (courseId && lessonType) {
            const courses = Storage.load('courses', []);
            currentCourse = courses.find(c => c.id === courseId);

            if (!currentCourse) {
                Utils.showMessage('课程不存在', 'error');
                setTimeout(() => window.location.href = 'textbooks.html', 1500);
                return false;
            }

            currentLesson = {
                id: null,
                title: '',
                type: lessonType,
                courseId: courseId,
                content: '',
                dialogues: [],
                speakers: [],
                notes: []
            };

            if (lessonType === 'dialogue') {
                speakers = [
                    createNarratorSpeaker(),
                    { id: Utils.generateId(), name: 'A', position: 'left', color: '#2563eb', avatarType: 'letter' },
                    { id: Utils.generateId(), name: 'B', position: 'right', color: '#10b981', avatarType: 'letter' }
                ];
            }

            lessonNotes = [];
        } else {
            window.location.href = 'textbooks.html';
            return false;
        }

        if (currentCourse) {
            const textbooks = Storage.load('textbooks', []);
            currentTextbook = textbooks.find(t => t.id === currentCourse.textbookId);
        }

        console.log('initData 完成，lessonNotes 数量:', lessonNotes.length);
        return true;
    }

    function createNarratorSpeaker() {
        return { id: NARRATOR_ID, name: '旁白', position: 'center', isNarrator: true, avatarType: 'none' };
    }

    function ensureNarratorExists() {
        const hasNarrator = speakers.some(s => s.id === NARRATOR_ID || s.isNarrator);
        if (!hasNarrator) {
            speakers.unshift(createNarratorSpeaker());
        } else {
            const narratorIndex = speakers.findIndex(s => s.id === NARRATOR_ID || s.isNarrator);
            if (narratorIndex > 0) {
                const narrator = speakers.splice(narratorIndex, 1)[0];
                narrator.id = NARRATOR_ID;
                narrator.isNarrator = true;
                speakers.unshift(narrator);
            }
        }
    }

    // ========== 页面渲染 ==========
    function renderPageInfo() {
        const isEditMode = !!currentLesson.id;

        if (currentTextbook) {
            const el = document.getElementById('breadcrumb-textbook');
            if (el) {
                el.textContent = currentTextbook.name;
                el.href = `textbook-detail.html?id=${currentTextbook.id}`;
            }
        }

        if (currentCourse) {
            const el = document.getElementById('breadcrumb-course');
            if (el) {
                el.textContent = currentCourse.name;
                el.href = `course-detail.html?id=${currentCourse.id}`;
            }
        }

        const breadcrumbCurrent = document.getElementById('breadcrumb-current');
        if (breadcrumbCurrent) {
            breadcrumbCurrent.textContent = isEditMode ? '编辑课文' : '新建课文';
        }
        document.title = (isEditMode ? '编辑课文' : '新建课文');

        const infoTextbook = document.getElementById('info-textbook');
        if (infoTextbook) infoTextbook.textContent = currentTextbook ? currentTextbook.name : '-';

        const infoCourse = document.getElementById('info-course');
        if (infoCourse) infoCourse.textContent = currentCourse ? currentCourse.name : '-';

        const infoType = document.getElementById('info-type');
        if (infoType) infoType.textContent = currentLesson.type === 'dialogue' ? '对话式' : '整体式';

        if (isEditMode && currentLesson.createdAt) {
            const createdRow = document.getElementById('info-created-row');
            const createdEl = document.getElementById('info-created');
            if (createdRow) createdRow.style.display = 'flex';
            if (createdEl) createdEl.textContent = Utils.formatDate(currentLesson.createdAt);
        }

        const titleInput = document.getElementById('lesson-title');
        if (titleInput) titleInput.value = currentLesson.title || '';

        const orderInput = document.getElementById('lesson-order');
        if (orderInput) orderInput.value = currentLesson.order !== undefined ? currentLesson.order : '';
    }

    // ========== 对话式编辑器 ==========
    function showDialogueEditor() {
        const editor = document.getElementById('dialogue-editor');
        const stats = document.getElementById('dialogue-stats');
        if (editor) editor.style.display = 'block';
        if (stats) stats.style.display = 'block';

        renderSpeakers();
        renderDialogues();
        updateSpeakerSelect();
        updateDialogueStats();
    }

    function renderSpeakers() {
        const speakerList = document.getElementById('speaker-list');
        if (!speakerList) return;

        const displaySpeakers = speakers.filter(s => !s.isNarrator);

        if (displaySpeakers.length === 0) {
            speakerList.innerHTML = '<p class="text-secondary" style="font-size: 0.875rem;">暂无角色，请添加</p>';
            return;
        }

        speakerList.innerHTML = displaySpeakers.map(speaker => {
            const avatarContent = speaker.avatarType === 'image' && speaker.avatarImage
                ? `<img src="${speaker.avatarImage}" alt="${escapeHtml(speaker.name)}">`
                : speaker.name.charAt(0).toUpperCase();
            const avatarStyle = speaker.avatarType === 'image' && speaker.avatarImage ? '' : `background-color: ${speaker.color};`;

            return `
                <div class="speaker-card" data-id="${speaker.id}">
                    <div class="speaker-avatar" style="${avatarStyle}">${avatarContent}</div>
                    <div class="speaker-info">
                        <div class="speaker-name">${escapeHtml(speaker.name)}</div>
                        <div class="speaker-position">${speaker.position === 'left' ? '居左' : '居右'}</div>
                    </div>
                    <div class="speaker-actions">
                        <button type="button" class="btn-icon edit-speaker-btn" data-id="${speaker.id}" title="编辑">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button type="button" class="btn-icon delete delete-speaker-btn" data-id="${speaker.id}" title="删除">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        speakerList.querySelectorAll('.edit-speaker-btn').forEach(btn => {
            btn.addEventListener('click', () => openSpeakerModal(btn.dataset.id));
        });
        speakerList.querySelectorAll('.delete-speaker-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteSpeaker(btn.dataset.id));
        });
    }

    function updateSpeakerSelect() {
        const select = document.getElementById('current-speaker');
        const positionSelect = document.getElementById('current-position');
        if (!select) return;

        let options = '<option value="">选择角色</option>';
        const narrator = speakers.find(s => s.isNarrator);
        if (narrator) options += `<option value="${NARRATOR_ID}">── 旁白 ──</option>`;

        speakers.filter(s => !s.isNarrator).forEach(s => {
            options += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
        });

        select.innerHTML = options;

        const normalSpeakers = speakers.filter(s => !s.isNarrator);
        if (normalSpeakers.length > 0 && positionSelect) {
            select.value = normalSpeakers[0].id;
            positionSelect.value = normalSpeakers[0].position;
            positionSelect.disabled = false;
        }
    }

    function renderDialogues() {
        const preview = document.getElementById('dialogue-preview');
        if (!preview) return;

        if (dialogues.length === 0) {
            preview.innerHTML = `
                <div class="dialogue-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <p>暂无对话内容</p>
                    <span>在下方选择角色并输入对话</span>
                </div>
            `;
            return;
        }

        preview.innerHTML = dialogues.map((dialogue, index) => {
            const isNarrator = dialogue.speakerId === NARRATOR_ID || dialogue.isNarrator;

            if (isNarrator) {
                return `
                    <div class="dialogue-message narrator" data-index="${index}">
                        <div class="msg-content">
                            <div class="msg-bubble" data-index="${index}">${renderDialogueContent(dialogue, index)}</div>
                        </div>
                        <div class="msg-actions">
                            <button type="button" class="msg-action-btn move-up-btn" data-index="${index}" title="上移" ${index === 0 ? 'disabled' : ''}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="18 15 12 9 6 15"></polyline>
                                </svg>
                            </button>
                            <button type="button" class="msg-action-btn move-down-btn" data-index="${index}" title="下移" ${index === dialogues.length - 1 ? 'disabled' : ''}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                            <button type="button" class="msg-delete" data-index="${index}" title="删除">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }

            const speaker = speakers.find(s => s.id === dialogue.speakerId) || { name: '未知', color: '#64748b', avatarType: 'letter' };
            const position = dialogue.position || speaker.position || 'left';
            const avatarContent = speaker.avatarType === 'image' && speaker.avatarImage
                ? `<img src="${speaker.avatarImage}" alt="${escapeHtml(speaker.name)}">`
                : speaker.name.charAt(0).toUpperCase();
            const avatarStyle = speaker.avatarType === 'image' && speaker.avatarImage
                ? `background-image: url(${speaker.avatarImage}); background-size: cover;`
                : `background-color: ${speaker.color};`;

            return `
                <div class="dialogue-message ${position}" data-index="${index}">
                    <div class="avatar-wrapper">
                        <div class="msg-avatar" style="${avatarStyle}">${speaker.avatarType !== 'image' ? avatarContent : ''}</div>
                        <span class="msg-speaker-name">${escapeHtml(speaker.name)}</span>
                    </div>
                    <div class="msg-content">
                        <div class="msg-bubble" data-index="${index}">${renderDialogueContent(dialogue, index)}</div>
                        <div class="msg-time">${dialogue.time || ''}</div>
                    </div>
                    <div class="msg-actions">
                        <button type="button" class="msg-action-btn move-up-btn" data-index="${index}" title="上移" ${index === 0 ? 'disabled' : ''}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="18 15 12 9 6 15"></polyline>
                            </svg>
                        </button>
                        <button type="button" class="msg-action-btn move-down-btn" data-index="${index}" title="下移" ${index === dialogues.length - 1 ? 'disabled' : ''}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <button type="button" class="msg-delete" data-index="${index}" title="删除">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 绑定删除按钮事件
        preview.querySelectorAll('.msg-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                dialogues.splice(index, 1);

                lessonNotes = lessonNotes.map(note => {
                    if (note.source === 'dialogue' && note.dialogueIndex !== undefined) {
                        if (note.dialogueIndex === index) {
                            return null;
                        } else if (note.dialogueIndex > index) {
                            return { ...note, dialogueIndex: note.dialogueIndex - 1 };
                        }
                    }
                    return note;
                }).filter(Boolean);

                renderDialogues();
                renderNotes();
                updateDialogueStats();
                updateConnectorLines();
                markChanged();
            });
        });

        // 绑定上移按钮事件
        preview.querySelectorAll('.move-up-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                moveDialogue(index, 'up');
            });
        });

        // 绑定下移按钮事件
        preview.querySelectorAll('.move-down-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                moveDialogue(index, 'down');
            });
        });

        preview.querySelectorAll('.dialogue-message .msg-bubble').forEach(bubble => {
            bubble.addEventListener('mouseup', handleDialogueTextSelection);
        });

        // 绑定可替换文本点击事件
        preview.querySelectorAll('.replaceable-text').forEach(span => {
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                const dialogueIndex = parseInt(span.dataset.dialogueIndex);
                openReplacementModal(dialogueIndex);
            });
        });

        preview.scrollTop = preview.scrollHeight;
        // 确保滚动完成后再更新连接线
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                updateConnectorLines();
            });
        });
    }

    // 移动对话位置
    function moveDialogue(index, direction) {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === dialogues.length - 1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        // 交换对话位置
        [dialogues[index], dialogues[targetIndex]] = [dialogues[targetIndex], dialogues[index]];

        // 更新笔记的 dialogueIndex
        lessonNotes = lessonNotes.map(note => {
            if (note.source === 'dialogue' && note.dialogueIndex !== undefined) {
                if (note.dialogueIndex === index) {
                    return { ...note, dialogueIndex: targetIndex };
                } else if (note.dialogueIndex === targetIndex) {
                    return { ...note, dialogueIndex: index };
                }
            }
            return note;
        });

        // 同步更新全局笔记
        const globalNotes = Storage.load('notes', []);
        lessonNotes.forEach(note => {
            const globalIndex = globalNotes.findIndex(n => n.id === note.id);
            if (globalIndex !== -1) {
                globalNotes[globalIndex] = note;
            }
        });
        Storage.save('notes', globalNotes);

        renderDialogues();
        renderNotes();
        updateConnectorLines();
        markChanged();
    }

    function renderDialogueContent(dialogue, index) {
        let content;

        // 如果有替换标记，从 rawContent 重建
        if (dialogue.rawContent && dialogue.replacements && dialogue.replacements.length > 0) {
            content = dialogue.rawContent;

            // 按标记 ID 替换，使用正则精确匹配每个标记
            dialogue.replacements.forEach(rep => {
                const regex = new RegExp(`\\[${rep.id}\\](.*?)\\[[\\\\/]${rep.id}\\]`, 'g');
                const replaceableHtml = `<span class="replaceable-text" data-dialogue-index="${index}" data-replacement-id="${rep.id}">${escapeHtml(rep.current)}</span>`;
                content = content.replace(regex, replaceableHtml);
            });
        } else {
            content = escapeHtml(dialogue.content);
        }

        // 处理笔记高亮
        lessonNotes.forEach(note => {
            if (note.source === 'dialogue' && note.dialogueIndex === index && note.selectedText) {
                const escapedText = escapeHtml(note.selectedText);
                const highlightHtml = `<span class="highlight" style="background-color: ${note.highlightColor || '#fef08a'};" data-note-id="${note.id}" data-dialogue-index="${index}">${escapedText}</span>`;
                content = content.replace(escapedText, highlightHtml);
            }
        });

        return content;
    }

    function handleDialogueTextSelection(e) {
        const selection = window.getSelection();
        if (selection.isCollapsed || selection.toString().trim() === '') {
            hideSelectionPopup();
            return;
        }

        selectedText = selection.toString().trim();
        selectedRange = selection.getRangeAt(0).cloneRange();
        selectionSource = 'dialogue';
        selectedDialogueIndex = parseInt(e.currentTarget.dataset.index);

        showSelectionPopup(selection);
    }

    function sendDialogue() {
        const speakerSelect = document.getElementById('current-speaker');
        const positionSelect = document.getElementById('current-position');
        const input = document.getElementById('dialogue-input');

        if (!speakerSelect || !input) return;

        const speakerId = speakerSelect.value;
        const position = positionSelect ? positionSelect.value : 'left';
        const rawContent = input.value.trim();

        if (!speakerId) { Utils.showMessage('请选择角色', 'error'); return; }
        if (!rawContent) { Utils.showMessage('请输入对话内容', 'error'); return; }

        const isNarrator = speakerId === NARRATOR_ID;

        // 解析替换标记 [n]text[\n] 或 [n]text[/n]
        const replacements = [];
        const regex = /\[(\d+)\](.*?)\[[\\/]\1\]/g;
        let match;

        while ((match = regex.exec(rawContent)) !== null) {
            replacements.push({
                id: parseInt(match[1]),
                original: match[2],
                current: match[2]
            });
        }

        // 移除标记，保留内容
        const content = rawContent.replace(/\[(\d+)\](.*?)\[[\\/]\1\]/g, '$2');

        dialogues.push({
            speakerId,
            position: isNarrator ? 'center' : position,
            content,
            rawContent: replacements.length > 0 ? rawContent : undefined,
            replacements: replacements.length > 0 ? replacements : undefined,
            isNarrator,
            time: isNarrator ? '' : new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        });

        input.value = '';
        renderDialogues();
        updateDialogueStats();
        markChanged();
    }

    function updateDialogueStats() {
        const normalDialogues = dialogues.filter(d => !d.isNarrator && d.speakerId !== NARRATOR_ID);
        const dialogueCount = document.getElementById('dialogue-count');
        const speakerCount = document.getElementById('speaker-count');

        if (dialogueCount) dialogueCount.textContent = normalDialogues.length;
        if (speakerCount) speakerCount.textContent = speakers.filter(s => !s.isNarrator).length;
    }

    // ========== 角色管理 ==========
    let editingSpeakerId = null;
    let tempAvatarImage = null;

    function openSpeakerModal(speakerId = null) {
        editingSpeakerId = speakerId;
        const modal = document.getElementById('speaker-modal');
        const form = document.getElementById('speaker-form');
        if (!modal || !form) return;

        form.reset();
        tempAvatarImage = null;

        const modalTitle = document.getElementById('speaker-modal-title');
        const speakerIdInput = document.getElementById('speaker-id');
        const speakerNameInput = document.getElementById('speaker-name');
        const speakerColorInput = document.getElementById('speaker-color');

        if (speakerId) {
            const speaker = speakers.find(s => s.id === speakerId);
            if (!speaker) return;

            if (modalTitle) modalTitle.textContent = '编辑角色';
            if (speakerIdInput) speakerIdInput.value = speaker.id;
            if (speakerNameInput) speakerNameInput.value = speaker.name;
            if (speakerColorInput) speakerColorInput.value = speaker.color || '#2563eb';

            const positionRadio = document.querySelector(`input[name="speaker-position"][value="${speaker.position}"]`);
            if (positionRadio) positionRadio.checked = true;

            const avatarType = speaker.avatarType || 'letter';
            const avatarTypeRadio = document.querySelector(`input[name="avatar-type"][value="${avatarType}"]`);
            if (avatarTypeRadio) avatarTypeRadio.checked = true;
            toggleAvatarType(avatarType);

            if (avatarType === 'image' && speaker.avatarImage) {
                tempAvatarImage = speaker.avatarImage;
                updateAvatarPreview(speaker.avatarImage);
            } else {
                updateAvatarPreview(null, speaker.name, speaker.color);
            }

            document.querySelectorAll('#speaker-color-picker .color-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color === speaker.color);
            });
        } else {
            if (modalTitle) modalTitle.textContent = '添加角色';
            if (speakerIdInput) speakerIdInput.value = '';

            const letterRadio = document.querySelector('input[name="avatar-type"][value="letter"]');
            if (letterRadio) letterRadio.checked = true;
            toggleAvatarType('letter');
            updateAvatarPreview(null, 'A', '#2563eb');

            document.querySelectorAll('#speaker-color-picker .color-option').forEach((btn, i) => {
                btn.classList.toggle('active', i === 0);
            });
        }

        openModal(modal);
    }

    function toggleAvatarType(type) {
        const uploadArea = document.getElementById('avatar-upload-area');
        const colorGroup = document.getElementById('avatar-color-group');

        if (uploadArea) uploadArea.style.display = type === 'image' ? 'block' : 'none';
        if (colorGroup) colorGroup.style.display = type === 'image' ? 'none' : 'block';
    }

    function updateAvatarPreview(imageUrl, letter = 'A', color = '#2563eb') {
        const preview = document.getElementById('avatar-preview');
        const letterEl = document.getElementById('avatar-letter');
        const imageEl = document.getElementById('avatar-image');

        if (!preview) return;

        if (imageUrl) {
            if (letterEl) letterEl.style.display = 'none';
            if (imageEl) {
                imageEl.style.display = 'block';
                imageEl.src = imageUrl;
            }
            preview.style.backgroundColor = 'transparent';
        } else {
            if (letterEl) {
                letterEl.style.display = 'block';
                letterEl.textContent = (letter || 'A').charAt(0).toUpperCase();
            }
            if (imageEl) imageEl.style.display = 'none';
            preview.style.backgroundColor = color;
        }
    }

    function saveSpeaker(e) {
        e.preventDefault();

        const idInput = document.getElementById('speaker-id');
        const nameInput = document.getElementById('speaker-name');
        const colorInput = document.getElementById('speaker-color');
        const positionRadio = document.querySelector('input[name="speaker-position"]:checked');
        const avatarTypeRadio = document.querySelector('input[name="avatar-type"]:checked');

        const id = idInput ? idInput.value : '';
        const name = nameInput ? nameInput.value.trim() : '';
        const color = colorInput ? colorInput.value : '#2563eb';
        const position = positionRadio ? positionRadio.value : 'left';
        const avatarType = avatarTypeRadio ? avatarTypeRadio.value : 'letter';

        if (!name) { Utils.showMessage('请输入角色名称', 'error'); return; }

        if (speakers.find(s => s.name === name && s.id !== id && !s.isNarrator)) {
            Utils.showMessage('角色名称已存在', 'error');
            return;
        }

        const speakerData = {
            name,
            color,
            position,
            avatarType,
            avatarImage: avatarType === 'image' ? tempAvatarImage : null
        };

        if (id) {
            const index = speakers.findIndex(s => s.id === id);
            if (index !== -1) speakers[index] = { ...speakers[index], ...speakerData };
        } else {
            speakers.push({ id: Utils.generateId(), ...speakerData });
        }

        closeModal(document.getElementById('speaker-modal'));
        renderSpeakers();
        updateSpeakerSelect();
        updateDialogueStats();
        renderDialogues();
        markChanged();
        Utils.showMessage(id ? '角色已更新' : '角色已添加', 'success');
    }

    function deleteSpeaker(speakerId) {
        if (speakerId === NARRATOR_ID) {
            Utils.showMessage('旁白角色不能删除', 'error');
            return;
        }
        if (speakers.filter(s => !s.isNarrator).length <= 1) {
            Utils.showMessage('至少需要保留一个角色', 'error');
            return;
        }

        const usedCount = dialogues.filter(d => d.speakerId === speakerId).length;
        if (usedCount > 0 && !confirm(`该角色有 ${usedCount} 条对话，确定删除吗？`)) return;

        speakers = speakers.filter(s => s.id !== speakerId);
        renderSpeakers();
        updateSpeakerSelect();
        updateDialogueStats();
        renderDialogues();
        markChanged();
        Utils.showMessage('角色已删除', 'success');
    }

    // ========== 头像裁剪 ==========
    let cropData = { x: 0, y: 0, size: 100 };
    let imageDisplayRect = { x: 0, y: 0, width: 0, height: 0 }; // 图片实际显示区域
    let isDragging = false;
    let isResizing = false;
    let resizeHandle = null;
    let startX, startY, startCropX, startCropY, startCropSize;

    function initCropModal(imageUrl) {
        const image = document.getElementById('crop-image');
        if (!image) return;

        image.src = imageUrl;
        image.onload = () => {
            // 等待图片渲染完成
            setTimeout(() => {
                calculateImageDisplayRect();
                initCropBox();
                openModal(document.getElementById('crop-modal'));
                bindCropEvents();
            }, 50);
        };
    }

    // 计算图片在容器中的实际显示区域
    function calculateImageDisplayRect() {
        const image = document.getElementById('crop-image');
        const cropArea = document.getElementById('crop-area');
        if (!image || !cropArea) return;

        const containerWidth = cropArea.clientWidth;
        const containerHeight = cropArea.clientHeight;
        const naturalWidth = image.naturalWidth;
        const naturalHeight = image.naturalHeight;

        // 计算图片实际显示尺寸（考虑 max-width 和 max-height 限制）
        let displayWidth = naturalWidth;
        let displayHeight = naturalHeight;

        // 获取图片的计算样式
        const computedStyle = window.getComputedStyle(image);
        const maxWidth = parseFloat(computedStyle.maxWidth) || containerWidth;
        const maxHeight = parseFloat(computedStyle.maxHeight) || containerHeight;

        // 按比例缩放
        const scaleX = Math.min(1, maxWidth / naturalWidth, containerWidth / naturalWidth);
        const scaleY = Math.min(1, maxHeight / naturalHeight, containerHeight / naturalHeight);
        const scale = Math.min(scaleX, scaleY);

        displayWidth = naturalWidth * scale;
        displayHeight = naturalHeight * scale;

        // 计算图片在容器中的偏移（居中显示）
        const offsetX = (containerWidth - displayWidth) / 2;
        const offsetY = (containerHeight - displayHeight) / 2;

        imageDisplayRect = {
            x: Math.max(0, offsetX),
            y: Math.max(0, offsetY),
            width: displayWidth,
            height: displayHeight
        };

        // 更新裁剪框的定位参考
        const cropBox = document.getElementById('crop-box');
        if (cropBox) {
            cropBox.style.position = 'absolute';
        }
    }

    function initCropBox() {
        const image = document.getElementById('crop-image');
        const cropArea = document.getElementById('crop-area');
        if (!image || !cropArea) return;

        // 获取图片实际渲染尺寸和位置
        const imageRect = image.getBoundingClientRect();
        const cropAreaRect = cropArea.getBoundingClientRect();

        const imageOffsetX = imageRect.left - cropAreaRect.left;
        const imageOffsetY = imageRect.top - cropAreaRect.top;
        const imgWidth = imageRect.width;
        const imgHeight = imageRect.height;

        // 初始裁剪框大小为图片短边的 60%
        const minDimension = Math.min(imgWidth, imgHeight);
        const initialSize = Math.floor(minDimension * 0.6);

        // 裁剪框初始位置居中于图片
        cropData = {
            x: imageOffsetX + Math.floor((imgWidth - initialSize) / 2),
            y: imageOffsetY + Math.floor((imgHeight - initialSize) / 2),
            size: initialSize
        };

        // 重置缩放滑块
        const zoomSlider = document.getElementById('crop-zoom');
        if (zoomSlider) zoomSlider.value = 1;
        const zoomValue = document.getElementById('zoom-value');
        if (zoomValue) zoomValue.textContent = '100%';

        updateCropBox();
        updateCropPreview();
    }

    function updateCropBox() {
        const cropBox = document.getElementById('crop-box');
        if (!cropBox) return;

        cropBox.style.left = cropData.x + 'px';
        cropBox.style.top = cropData.y + 'px';
        cropBox.style.width = cropData.size + 'px';
        cropBox.style.height = cropData.size + 'px';
    }

    function updateCropPreview() {
    const preview = document.getElementById('crop-preview');
    const image = document.getElementById('crop-image');
    const cropArea = document.getElementById('crop-area');
    if (!preview || !image || !cropArea) return;

    const imageRect = image.getBoundingClientRect();
    const cropAreaRect = cropArea.getBoundingClientRect();

    const imageOffsetX = imageRect.left - cropAreaRect.left;
    const imageOffsetY = imageRect.top - cropAreaRect.top;
    const imgWidth = imageRect.width;
    const imgHeight = imageRect.height;

    if (imgWidth === 0 || imgHeight === 0) return;

    // 预览框大小
    const previewSize = 80;

    // 计算裁剪框相对于图片的位置
    const relativeX = cropData.x - imageOffsetX;
    const relativeY = cropData.y - imageOffsetY;

    // 计算缩放比例
    const scale = previewSize / cropData.size;

    preview.style.backgroundImage = `url(${image.src})`;
    preview.style.backgroundSize = `${imgWidth * scale}px ${imgHeight * scale}px`;
    preview.style.backgroundPosition = `-${relativeX * scale}px -${relativeY * scale}px`;
    preview.style.backgroundRepeat = 'no-repeat';
}

    function bindCropEvents() {
        const cropBox = document.getElementById('crop-box');
        const cropArea = document.getElementById('crop-area');

        if (!cropBox || !cropArea) return;

        // 裁剪框拖动
        cropBox.addEventListener('mousedown', handleCropMouseDown);
        document.addEventListener('mousemove', handleCropMouseMove);
        document.addEventListener('mouseup', handleCropMouseUp);

        // 触摸事件支持
        cropBox.addEventListener('touchstart', handleCropTouchStart, { passive: false });
        document.addEventListener('touchmove', handleCropTouchMove, { passive: false });
        document.addEventListener('touchend', handleCropMouseUp);

        // 缩放滑块
        const zoomSlider = document.getElementById('crop-zoom');
        if (zoomSlider) {
            zoomSlider.addEventListener('input', handleZoomChange);
        }

        // 窗口大小变化时重新计算
        window.addEventListener('resize', handleCropResize);
    }

    function handleCropResize() {
        calculateImageDisplayRect();

        // 确保裁剪框仍在图片范围内
        constrainCropBox();
        updateCropBox();
        updateCropPreview();
    }

    // 确保裁剪框在图片边界内
    function constrainCropBox() {
        const minX = imageDisplayRect.x;
        const minY = imageDisplayRect.y;
        const maxX = imageDisplayRect.x + imageDisplayRect.width - cropData.size;
        const maxY = imageDisplayRect.y + imageDisplayRect.height - cropData.size;

        cropData.x = Math.max(minX, Math.min(maxX, cropData.x));
        cropData.y = Math.max(minY, Math.min(maxY, cropData.y));

        // 如果裁剪框太大，缩小它
        const maxSize = Math.min(imageDisplayRect.width, imageDisplayRect.height);
        if (cropData.size > maxSize) {
            cropData.size = maxSize;
            cropData.x = imageDisplayRect.x + (imageDisplayRect.width - maxSize) / 2;
            cropData.y = imageDisplayRect.y + (imageDisplayRect.height - maxSize) / 2;
        }
    }

    function handleCropMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();

        const target = e.target;

        if (target.classList.contains('crop-handle')) {
            isResizing = true;
            resizeHandle = target.classList.contains('nw') ? 'nw' :
                           target.classList.contains('ne') ? 'ne' :
                           target.classList.contains('sw') ? 'sw' : 'se';
        } else {
            isDragging = true;
        }

        startX = e.clientX;
        startY = e.clientY;
        startCropX = cropData.x;
        startCropY = cropData.y;
        startCropSize = cropData.size;
    }

    function handleCropTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];

            const target = e.target;
            if (target.classList.contains('crop-handle')) {
                isResizing = true;
                resizeHandle = target.classList.contains('nw') ? 'nw' :
                               target.classList.contains('ne') ? 'ne' :
                               target.classList.contains('sw') ? 'sw' : 'se';
            } else {
                isDragging = true;
            }

            startX = touch.clientX;
            startY = touch.clientY;
            startCropX = cropData.x;
            startCropY = cropData.y;
            startCropSize = cropData.size;
        }
    }

    function handleCropMouseMove(e) {
        if (!isDragging && !isResizing) return;

        const image = document.getElementById('crop-image');
        if (!image) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // 获取图片元素的实际渲染位置和尺寸
        const imageRect = image.getBoundingClientRect();
        const cropArea = document.getElementById('crop-area');
        const cropAreaRect = cropArea.getBoundingClientRect();

        // 图片相对于裁剪区域容器的偏移
        const imageOffsetX = imageRect.left - cropAreaRect.left;
        const imageOffsetY = imageRect.top - cropAreaRect.top;

        // 图片边界
        const minX = imageOffsetX;
        const minY = imageOffsetY;
        const imgWidth = imageRect.width;
        const imgHeight = imageRect.height;
        const minSize = 40;

        if (isResizing) {
            let newSize = startCropSize;
            let newX = startCropX;
            let newY = startCropY;

            const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;

            switch (resizeHandle) {
                case 'se':
                    newSize = startCropSize + delta;
                    break;
                case 'sw':
                    newSize = startCropSize - deltaX;
                    newX = startCropX + startCropSize - newSize;
                    break;
                case 'ne':
                    newSize = startCropSize + deltaX;
                    newY = startCropY + startCropSize - newSize;
                    break;
                case 'nw':
                    newSize = startCropSize - delta;
                    newX = startCropX + startCropSize - newSize;
                    newY = startCropY + startCropSize - newSize;
                    break;
            }

            // 限制最小尺寸
            newSize = Math.max(minSize, newSize);

            // 限制最大尺寸（不能超出图片边界）
            const maxSizeFromX = (minX + imgWidth) - newX;
            const maxSizeFromY = (minY + imgHeight) - newY;
            newSize = Math.min(newSize, maxSizeFromX, maxSizeFromY);

            // 确保不超出左上边界
            if (newX < minX) {
                newSize = newSize - (minX - newX);
                newX = minX;
            }
            if (newY < minY) {
                newSize = newSize - (minY - newY);
                newY = minY;
            }

            newSize = Math.max(minSize, newSize);

            cropData.x = newX;
            cropData.y = newY;
            cropData.size = newSize;

        } else if (isDragging) {
            let newX = startCropX + deltaX;
            let newY = startCropY + deltaY;

            // 边界限制 - 只能在图片元素范围内移动
            newX = Math.max(minX, Math.min(minX + imgWidth - cropData.size, newX));
            newY = Math.max(minY, Math.min(minY + imgHeight - cropData.size, newY));

            cropData.x = newX;
            cropData.y = newY;
        }

        updateCropBox();
        updateCropPreview();
    }

    function handleCropTouchMove(e) {
        if ((!isDragging && !isResizing) || e.touches.length !== 1) return;

        e.preventDefault();
        const touch = e.touches[0];

        handleCropMouseMove({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }

    function handleCropMouseUp() {
        isDragging = false;
        isResizing = false;
        resizeHandle = null;
    }

    function handleZoomChange(e) {
        const image = document.getElementById('crop-image');
        const cropArea = document.getElementById('crop-area');
        if (!image || !cropArea) return;

        const imageRect = image.getBoundingClientRect();
        const cropAreaRect = cropArea.getBoundingClientRect();

        const imageOffsetX = imageRect.left - cropAreaRect.left;
        const imageOffsetY = imageRect.top - cropAreaRect.top;
        const imgWidth = imageRect.width;
        const imgHeight = imageRect.height;

        const zoom = parseFloat(e.target.value);
        const zoomValue = document.getElementById('zoom-value');
        if (zoomValue) zoomValue.textContent = Math.round(zoom * 100) + '%';

        // 计算新的裁剪框大小
        const minDimension = Math.min(imgWidth, imgHeight);
        const baseSize = minDimension * 0.6;
        const newSize = Math.max(40, Math.min(minDimension, baseSize / zoom));

        // 保持裁剪框中心位置
        const centerX = cropData.x + cropData.size / 2;
        const centerY = cropData.y + cropData.size / 2;

        let newX = centerX - newSize / 2;
        let newY = centerY - newSize / 2;

        // 边界检查
        newX = Math.max(imageOffsetX, Math.min(imageOffsetX + imgWidth - newSize, newX));
        newY = Math.max(imageOffsetY, Math.min(imageOffsetY + imgHeight - newSize, newY));

        cropData.x = newX;
        cropData.y = newY;
        cropData.size = newSize;

        updateCropBox();
        updateCropPreview();
    }

    function confirmCrop() {
    const image = document.getElementById('crop-image');
    const cropArea = document.getElementById('crop-area');
    if (!image || !cropArea) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 200;
    canvas.height = 200;

    // 获取图片实际渲染尺寸和位置
    const imageRect = image.getBoundingClientRect();
    const cropAreaRect = cropArea.getBoundingClientRect();

    const imageOffsetX = imageRect.left - cropAreaRect.left;
    const imageOffsetY = imageRect.top - cropAreaRect.top;

    // 计算裁剪框相对于图片的位置
    const relativeX = cropData.x - imageOffsetX;
    const relativeY = cropData.y - imageOffsetY;

    // 计算显示尺寸到原始尺寸的比例
    const scaleX = image.naturalWidth / imageRect.width;
    const scaleY = image.naturalHeight / imageRect.height;

    // 原始图片中的裁剪区域
    const sourceX = relativeX * scaleX;
    const sourceY = relativeY * scaleY;
    const sourceWidth = cropData.size * scaleX;
    const sourceHeight = cropData.size * scaleY;

    ctx.drawImage(
        image,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, 200, 200
    );

    tempAvatarImage = canvas.toDataURL('image/jpeg', 0.9);
    updateAvatarPreview(tempAvatarImage);
    closeModal(document.getElementById('crop-modal'));
    cleanupCropEvents();
}

    function cleanupCropEvents() {
        document.removeEventListener('mousemove', handleCropMouseMove);
        document.removeEventListener('mouseup', handleCropMouseUp);
        document.removeEventListener('touchmove', handleCropTouchMove);
        document.removeEventListener('touchend', handleCropMouseUp);
        window.removeEventListener('resize', handleCropResize);
    }

    // ========== 整体式编辑器 ==========
    function showArticleEditor() {
        const editor = document.getElementById('article-editor');
        const stats = document.getElementById('article-stats');

        if (editor) editor.style.display = 'block';
        if (stats) stats.style.display = 'block';

        const content = document.getElementById('richtext-content');
        if (content) {
            content.innerHTML = currentLesson.content || '<p></p>';
            content.setAttribute('data-placeholder', '在此输入课文内容...');
        }

        initRichtextEditor();

        // 延迟应用高亮，确保 DOM 已完全渲染
        requestAnimationFrame(() => {
            console.log('开始应用文章高亮');
            applyHighlightsToArticle();
            updateArticleStats();
            // 延迟更新连接线
            setTimeout(() => {
                console.log('从 showArticleEditor 更新连接线');
                updateConnectorLines();
            }, 200);
        });
    }

    function initRichtextEditor() {
        const editor = document.getElementById('richtext-content');
        const wrapper = document.getElementById('richtext-content-wrapper');
        if (!editor) return;

        // 初始化选区保存
        initSelectionSaver();

        // 工具栏命令
        document.querySelectorAll('.toolbar-btn[data-command]').forEach(btn => {
            // 特殊处理清除格式按钮
            if (btn.dataset.command === 'removeFormat') {
                btn.addEventListener('click', () => {
                    removeFormatExceptHighlights();
                    editor.focus();
                    markChanged();
                });
            }
            // 特殊处理无序列表
            else if (btn.dataset.command === 'insertUnorderedList') {
                btn.addEventListener('click', () => {
                    insertList('ul');
                    editor.focus();
                    markChanged();
                });
            }
            // 特殊处理有序列表
            else if (btn.dataset.command === 'insertOrderedList') {
                btn.addEventListener('click', () => {
                    insertList('ol');
                    editor.focus();
                    markChanged();
                });
            }
            // 其他标准命令
            else {
                btn.addEventListener('click', () => {
                    document.execCommand(btn.dataset.command, false, null);
                    editor.focus();
                    markChanged();
                });
            }
        });

        // 下拉选择
        const formatBlock = document.getElementById('format-block');
        if (formatBlock) {
            formatBlock.addEventListener('change', e => {
                document.execCommand('formatBlock', false, e.target.value);
                editor.focus();
                markChanged();
            });
        }

        const fontFamily = document.getElementById('font-family');
        if (fontFamily) {
            fontFamily.addEventListener('change', e => {
                document.execCommand('fontName', false, e.target.value);
                editor.focus();
                markChanged();
            });
        }

        const fontSize = document.getElementById('font-size');
        if (fontSize) {
            fontSize.addEventListener('change', e => {
                applyFontSize(e.target.value);
                markChanged();
            });
        }

        const lineHeight = document.getElementById('line-height');
        if (lineHeight) {
            lineHeight.addEventListener('change', e => {
                editor.style.lineHeight = e.target.value;
                markChanged();
            });
        }

        // 文字颜色 - 应用按钮
        const textColorApplyBtn = document.getElementById('text-color-apply-btn');
        if (textColorApplyBtn) {
            textColorApplyBtn.addEventListener('click', () => {
                applyTextColor(currentTextColor);
                editor.focus();
                markChanged();
            });
        }

        // 文字颜色 - 选择器按钮
        const textColorPickerBtn = document.getElementById('text-color-picker-btn');
        const textColorPickerPopup = document.getElementById('text-color-picker-popup');
        if (textColorPickerBtn && textColorPickerPopup) {
            textColorPickerBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                // 保存当前选区
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    // 检查选区是否在编辑器内
                    if (editor.contains(range.commonAncestorContainer)) {
                        savedColorRange = range.cloneRange();
                        console.log('保存了颜色选区:', savedColorRange);
                    } else {
                        console.log('选区不在编辑器内');
                        savedColorRange = null;
                    }
                } else {
                    console.log('没有选区');
                    savedColorRange = null;
                }

                // 关闭背景色选择器
                const bgPopup = document.getElementById('bg-color-picker-popup');
                if (bgPopup) bgPopup.style.display = 'none';

                // 切换显示
                if (textColorPickerPopup.style.display === 'block') {
                    textColorPickerPopup.style.display = 'none';
                    savedColorRange = null;
                } else {
                    // 定位弹窗
                    const rect = textColorPickerBtn.getBoundingClientRect();
                    textColorPickerPopup.style.left = rect.left + 'px';
                    textColorPickerPopup.style.top = (rect.bottom + 5) + 'px';
                    textColorPickerPopup.style.display = 'block';
                }
            });
        }

        // 文字颜色 - 预设颜色按钮
        document.querySelectorAll('#text-color-picker-popup .color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                console.log('点击预设颜色:', color);
                applyColorWithSavedRange(color, 'text', true);
                currentTextColor = color;
                const colorBar = document.getElementById('text-color-bar');
                if (colorBar) colorBar.style.backgroundColor = color;
                const preview = document.getElementById('text-color-preview');
                if (preview) preview.style.backgroundColor = color;
            });
        });

        // 文字颜色 - 自定义颜色输入
        const textColorCustomInput = document.getElementById('text-color-custom-input');
        if (textColorCustomInput) {
            // input 事件：拖动时实时预览
            textColorCustomInput.addEventListener('input', (e) => {
                const color = e.target.value;
                console.log('文字颜色 input:', color, 'savedColorRange:', savedColorRange);

                const preview = document.getElementById('text-color-preview');
                if (preview) preview.style.backgroundColor = color;

                // 实时应用到文本
                if (savedColorRange) {
                    applyColorWithSavedRange(color, 'text', false);
                }
            });

            // change 事件：松开鼠标时更新当前颜色
            textColorCustomInput.addEventListener('change', (e) => {
                const color = e.target.value;
                currentTextColor = color;
                const colorBar = document.getElementById('text-color-bar');
                if (colorBar) colorBar.style.backgroundColor = color;
                markChanged();
            });
        }

        // 文字颜色 - 关闭按钮
        const textColorPickerClose = document.getElementById('text-color-picker-close');
        if (textColorPickerClose && textColorPickerPopup) {
            textColorPickerClose.addEventListener('click', () => {
                textColorPickerPopup.style.display = 'none';
                savedColorRange = null;
            });
        }

        // 背景颜色 - 应用按钮
        const bgColorApplyBtn = document.getElementById('bg-color-apply-btn');
        if (bgColorApplyBtn) {
            bgColorApplyBtn.addEventListener('click', () => {
                applyBackgroundColor(currentBgColor);
                editor.focus();
                markChanged();
            });
        }

        // 背景颜色 - 选择器按钮
        const bgColorPickerBtn = document.getElementById('bg-color-picker-btn');
        const bgColorPickerPopup = document.getElementById('bg-color-picker-popup');
        if (bgColorPickerBtn && bgColorPickerPopup) {
            bgColorPickerBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                // 保存当前选区
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    // 检查选区是否在编辑器内
                    if (editor.contains(range.commonAncestorContainer)) {
                        savedColorRange = range.cloneRange();
                        console.log('保存了颜色选区:', savedColorRange);
                    } else {
                        console.log('选区不在编辑器内');
                        savedColorRange = null;
                    }
                } else {
                    console.log('没有选区');
                    savedColorRange = null;
                }

                // 关闭文字色选择器
                if (textColorPickerPopup) textColorPickerPopup.style.display = 'none';

                // 切换显示
                if (bgColorPickerPopup.style.display === 'block') {
                    bgColorPickerPopup.style.display = 'none';
                    savedColorRange = null;
                } else {
                    // 定位弹窗
                    const rect = bgColorPickerBtn.getBoundingClientRect();
                    bgColorPickerPopup.style.left = rect.left + 'px';
                    bgColorPickerPopup.style.top = (rect.bottom + 5) + 'px';
                    bgColorPickerPopup.style.display = 'block';
                }
            });
        }

        // 背景颜色 - 预设颜色按钮
        document.querySelectorAll('#bg-color-picker-popup .color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                console.log('点击预设颜色:', color);
                applyColorWithSavedRange(color, 'background', true);
                currentBgColor = color;
                const colorBar = document.getElementById('bg-color-bar');
                if (colorBar) colorBar.style.backgroundColor = color;
                const preview = document.getElementById('bg-color-preview');
                if (preview) preview.style.backgroundColor = color;
            });
        });

        // 背景颜色 - 自定义颜色输入
        const bgColorCustomInput = document.getElementById('bg-color-custom-input');
        if (bgColorCustomInput) {
            // input 事件：拖动时实时预览
            bgColorCustomInput.addEventListener('input', (e) => {
                const color = e.target.value;
                console.log('背景颜色 input:', color, 'savedColorRange:', savedColorRange);

                const preview = document.getElementById('bg-color-preview');
                if (preview) preview.style.backgroundColor = color;

                // 实时应用到文本
                if (savedColorRange) {
                    applyColorWithSavedRange(color, 'background', false);
                }
            });

            // change 事件：松开鼠标时更新当前颜色
            bgColorCustomInput.addEventListener('change', (e) => {
                const color = e.target.value;
                currentBgColor = color;
                const colorBar = document.getElementById('bg-color-bar');
                if (colorBar) colorBar.style.backgroundColor = color;
                markChanged();
            });
        }

        // 背景颜色 - 关闭按钮
        const bgColorPickerClose = document.getElementById('bg-color-picker-close');
        if (bgColorPickerClose && bgColorPickerPopup) {
            bgColorPickerClose.addEventListener('click', () => {
                bgColorPickerPopup.style.display = 'none';
                savedColorRange = null;
            });
        }

        // 点击其他地方关闭颜色选择器
        document.addEventListener('click', (e) => {
            if (textColorPickerPopup && !textColorPickerPopup.contains(e.target) &&
                !textColorPickerBtn?.contains(e.target)) {
                textColorPickerPopup.style.display = 'none';
                savedColorRange = null;
            }
            if (bgColorPickerPopup && !bgColorPickerPopup.contains(e.target) &&
                !bgColorPickerBtn?.contains(e.target)) {
                bgColorPickerPopup.style.display = 'none';
                savedColorRange = null;
            }
        });

        // 媒体插入
        document.getElementById('insert-image-btn')?.addEventListener('click', () => openMediaModal('image'));
        document.getElementById('insert-video-btn')?.addEventListener('click', () => openMediaModal('video'));
        document.getElementById('insert-audio-btn')?.addEventListener('click', () => openMediaModal('audio'));
        document.getElementById('insert-link-btn')?.addEventListener('click', openLinkModal);
        document.getElementById('insert-table-btn')?.addEventListener('click', openTableModal);

        // 内容变化
        editor.addEventListener('input', () => {
            updateArticleStats();
            markChanged();
            requestAnimationFrame(() => updateConnectorLines());
        });

        // 文本选择
        editor.addEventListener('mouseup', handleArticleTextSelection);

        // 滚动时更新连接线
        if (wrapper) {
            wrapper.addEventListener('scroll', () => requestAnimationFrame(() => updateConnectorLines()));
        }

        // 快捷键
        editor.addEventListener('keydown', e => {
            if (e.ctrlKey || e.metaKey) {
                const key = e.key.toLowerCase();
                if (key === 'b') { e.preventDefault(); document.execCommand('bold'); }
                else if (key === 'i') { e.preventDefault(); document.execCommand('italic'); }
                else if (key === 'u') { e.preventDefault(); document.execCommand('underline'); }
            }
        });

        // 链接点击处理
        editor.addEventListener('click', (e) => {
            const link = e.target.closest('a.editor-link');
            if (link) {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    window.open(link.href, link.target || '_blank');
                } else {
                    e.preventDefault();
                }
            }
        });

        // 链接悬停提示
        editor.addEventListener('mouseover', (e) => {
            const link = e.target.closest('a.editor-link');
            if (link) {
                link.title = `Ctrl+点击打开: ${link.href}`;
                link.style.cursor = 'pointer';
            }
        });
    }

    function insertList(type) {
        const editor = document.getElementById('richtext-content');
        if (!editor) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // 检查当前是否已经在列表中
        let currentList = range.commonAncestorContainer;
        while (currentList && currentList !== editor) {
            if (currentList.nodeType === Node.ELEMENT_NODE) {
                if (currentList.tagName === 'UL' || currentList.tagName === 'OL') {
                    // 如果已经在列表中，切换列表类型或移除列表
                    if (currentList.tagName.toLowerCase() === type) {
                        // 相同类型，移除列表
                        removeList(currentList);
                    } else {
                        // 不同类型，转换列表
                        convertList(currentList, type);
                    }
                    return;
                }
            }
            currentList = currentList.parentNode;
        }

        // 不在列表中，创建新列表
        try {
            // 尝试使用原生命令
            const command = type === 'ul' ? 'insertUnorderedList' : 'insertOrderedList';
            const success = document.execCommand(command, false, null);

            if (!success) {
                // 如果原生命令失败，手动创建列表
                createNewList(type, range);
            }
        } catch (e) {
            console.error('列表插入失败:', e);
            createNewList(type, range);
        }
    }

    function createNewList(type, range) {
        const editor = document.getElementById('richtext-content');
        if (!editor) return;

        // 获取选中的内容或当前段落
        let content = '';
        let startNode = range.startContainer;

        // 查找当前段落
        while (startNode && startNode !== editor && startNode.nodeType !== Node.ELEMENT_NODE) {
            startNode = startNode.parentNode;
        }

        if (startNode && startNode !== editor) {
            // 如果在段落中，使用段落内容
            if (startNode.tagName === 'P' || startNode.tagName === 'DIV') {
                content = startNode.innerHTML || '项目';
                startNode.remove();
            } else {
                content = selection.toString() || '项目';
                range.deleteContents();
            }
        } else {
            content = selection.toString() || '项目';
            if (content) {
                range.deleteContents();
            }
        }

        // 创建列表
        const list = document.createElement(type);
        const li = document.createElement('li');
        li.innerHTML = content;
        list.appendChild(li);

        // 插入列表
        range.insertNode(list);

        // 添加一个空段落在列表后面
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        list.parentNode.insertBefore(p, list.nextSibling);

        // 将光标移到列表项中
        const newRange = document.createRange();
        newRange.selectNodeContents(li);
        newRange.collapse(false);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(newRange);
    }

    function removeList(listElement) {
        const editor = document.getElementById('richtext-content');
        if (!editor || !listElement) return;

        // 将列表项转换为段落
        const items = Array.from(listElement.querySelectorAll('li'));
        const fragment = document.createDocumentFragment();

        items.forEach(li => {
            const p = document.createElement('p');
            p.innerHTML = li.innerHTML || '<br>';
            fragment.appendChild(p);
        });

        listElement.parentNode.replaceChild(fragment, listElement);
    }

    function convertList(listElement, newType) {
        if (!listElement) return;

        const newList = document.createElement(newType);
        newList.innerHTML = listElement.innerHTML;
        listElement.parentNode.replaceChild(newList, listElement);
    }

    // 使用保存的范围应用颜色
    function applyColorWithSavedRange(color, type, shouldMarkChange = false) {
        if (!savedColorRange) {
            return;
        }

        const editor = document.getElementById('richtext-content');
        if (!editor) return;

        try {
            // 恢复选区
            const selection = window.getSelection();
            selection.removeAllRanges();

            // 克隆范围以避免修改原始范围
            const rangeClone = savedColorRange.cloneRange();
            selection.addRange(rangeClone);

            // 应用颜色
            if (type === 'text') {
                applyTextColor(color);
            } else {
                applyBackgroundColor(color);
            }

            // 重新保存范围（因为应用颜色后范围可能改变）
            if (selection.rangeCount > 0) {
                savedColorRange = selection.getRangeAt(0).cloneRange();
            }

            if (shouldMarkChange) {
                markChanged();
            }
        } catch (e) {
            console.error('应用颜色失败:', e);
        }
    }

    // 清除格式但保留笔记高亮
    function removeFormatExceptHighlights() {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            return;
        }

        const range = selection.getRangeAt(0);
        const editor = document.getElementById('richtext-content');
        if (!editor || !editor.contains(range.commonAncestorContainer)) {
            return;
        }

        try {
            // 创建一个临时容器来处理选中的内容
            const tempDiv = document.createElement('div');
            const clonedContent = range.cloneContents();
            tempDiv.appendChild(clonedContent);

            // 递归清理格式，但保留笔记高亮
            cleanFormattingKeepHighlights(tempDiv);

            // 删除原选区内容
            range.deleteContents();

            // 插入清理后的内容
            const fragment = document.createDocumentFragment();
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }

            // 记录插入位置
            const insertPoint = range.startContainer;
            const insertOffset = range.startOffset;

            range.insertNode(fragment);

            // 重新选中清理后的内容
            const newRange = document.createRange();
            newRange.setStart(insertPoint, insertOffset);
            newRange.setEndAfter(insertPoint.nodeType === Node.TEXT_NODE ? insertPoint : insertPoint.childNodes[insertOffset + fragment.childNodes.length - 1] || insertPoint);

            selection.removeAllRanges();
            selection.addRange(newRange);

        } catch (e) {
            console.error('清除格式失败:', e);
        }
    }

    // 递归清理格式，保留笔记高亮
    function cleanFormattingKeepHighlights(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;

            // 如果是笔记高亮元素，完全保留它
            if (element.classList && element.classList.contains('highlight') && element.dataset.noteId) {
                return; // 不处理高亮元素
            }

            // 保留的标签列表（结构性标签）
            const keepTags = ['P', 'BR', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                             'UL', 'OL', 'LI', 'BLOCKQUOTE', 'TABLE', 'TR', 'TD', 'TH', 'THEAD', 'TBODY',
                             'IMG', 'VIDEO', 'AUDIO', 'A'];

            if (!keepTags.includes(element.tagName)) {
                // 不在保留列表中的标签，解包它（保留内容但移除标签）
                const parent = element.parentNode;
                if (parent) {
                    // 将子节点移到父节点中
                    while (element.firstChild) {
                        const child = element.firstChild;
                        parent.insertBefore(child, element);
                        // 递归处理移出的子节点
                        if (child.nodeType === Node.ELEMENT_NODE) {
                            cleanFormattingKeepHighlights(child);
                        }
                    }
                    // 移除空的元素
                    parent.removeChild(element);
                    return;
                }
            }

            // 清除所有行内样式
            if (element.hasAttribute('style')) {
                element.removeAttribute('style');
            }

            // 清除其他格式属性（保留特定的必要属性）
            const keepAttrs = ['href', 'src', 'alt', 'title', 'controls', 'colspan', 'rowspan'];
            const attrs = Array.from(element.attributes);
            attrs.forEach(attr => {
                if (!keepAttrs.includes(attr.name) && attr.name !== 'class') {
                    element.removeAttribute(attr.name);
                }
            });

            // 如果是保留的标签但有不必要的 class（除了高亮），清除它
            if (element.className && !element.classList.contains('highlight')) {
                element.removeAttribute('class');
            }

            // 递归处理子节点
            const children = Array.from(element.childNodes);
            children.forEach(child => {
                cleanFormattingKeepHighlights(child);
            });
        }
    }

    function applyTextColor(color) {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            return;
        }

        const range = selection.getRangeAt(0);

        // 强制重新应用：先移除旧的颜色，再应用新的
        const span = document.createElement('span');
        span.style.color = color;

        try {
            // 提取选中内容
            const contents = range.extractContents();

            // 清理内部的颜色样式
            cleanColorStyles(contents, 'color');

            // 应用新颜色
            span.appendChild(contents);
            range.insertNode(span);

            // 重新选中
            selection.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            selection.addRange(newRange);
        } catch (e) {
            console.error('应用文字颜色失败:', e);
        }
    }

    function applyBackgroundColor(color) {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            return;
        }

        const range = selection.getRangeAt(0);

        // 强制重新应用：先移除旧的背景色，再应用新的
        const span = document.createElement('span');
        span.style.backgroundColor = color;

        try {
            // 提取选中内容
            const contents = range.extractContents();

            // 清理内部的背景色样式
            cleanColorStyles(contents, 'backgroundColor');

            // 应用新背景色
            span.appendChild(contents);
            range.insertNode(span);

            // 重新选中
            selection.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            selection.addRange(newRange);
        } catch (e) {
            console.error('应用背景颜色失败:', e);
        }
    }

    // 清理颜色样式的辅助函数
    function cleanColorStyles(node, styleProperty) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            // 如果是 span 元素且只有颜色样式，移除 span
            if (node.tagName === 'SPAN') {
                const style = node.style;
                if (style[styleProperty]) {
                    style[styleProperty] = '';
                    // 如果 span 没有其他样式了，解包它
                    if (!node.getAttribute('style') || node.getAttribute('style').trim() === '') {
                        const parent = node.parentNode;
                        while (node.firstChild) {
                            parent.insertBefore(node.firstChild, node);
                        }
                        parent.removeChild(node);
                        return;
                    }
                }
            }

            // 递归处理子节点
            const children = Array.from(node.childNodes);
            children.forEach(child => cleanColorStyles(child, styleProperty));
        }
    }

    function applyBackgroundColorComplex(range, color) {
        const editor = document.getElementById('richtext-content');
        if (!editor) return;

        // 提取选中的内容
        const fragment = range.extractContents();

        // 创建包含背景色的容器
        const span = document.createElement('span');
        span.style.backgroundColor = color;
        span.appendChild(fragment);

        // 插入回去
        range.insertNode(span);

        // 重新选中
        const selection = window.getSelection();
        selection.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        selection.addRange(newRange);
    }

    function applyFontSize(size) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = size;
            try { range.surroundContents(span); } catch (e) {}
        }
        document.getElementById('richtext-content')?.focus();
    }

    function handleArticleTextSelection(e) {
        const selection = window.getSelection();
        if (selection.isCollapsed || selection.toString().trim() === '') {
            hideSelectionPopup();
            return;
        }

        selectedText = selection.toString().trim();
        selectedRange = selection.getRangeAt(0).cloneRange();
        selectionSource = 'article';
        selectedDialogueIndex = -1;

        // 记录上下文而非绝对位置
        const editor = document.getElementById('richtext-content');
        const fullText = editor.textContent;
        const range = selection.getRangeAt(0);

        // 创建一个范围从编辑器开始到选中文本开始
        const preRange = document.createRange();
        preRange.selectNodeContents(editor);
        preRange.setEnd(range.startContainer, range.startOffset);
        const offset = preRange.toString().length;

        // 获取前后文用于精确定位（各取30个字符）
        const beforeText = fullText.substring(Math.max(0, offset - 30), offset);
        const afterText = fullText.substring(offset + selectedText.length, offset + selectedText.length + 30);

        window.selectedTextContext = {
            text: selectedText,
            before: beforeText,
            after: afterText,
            offset: offset  // 保留作为备用
        };

        showSelectionPopup(selection);
    }

    function updateArticleStats() {
        const editor = document.getElementById('richtext-content');
        const text = editor?.textContent || '';

        const wordCount = document.getElementById('word-count');
        const paragraphCount = document.getElementById('paragraph-count');

        if (wordCount) wordCount.textContent = text.replace(/\s/g, '').length;
        if (paragraphCount) paragraphCount.textContent = editor?.querySelectorAll('p, h1, h2, h3, h4, li, blockquote').length || 1;
    }

    // ========== 选中文本弹窗 ==========
    function showSelectionPopup(selection) {
        const popup = document.getElementById('selection-popup');
        if (!popup) {
            console.error('selection-popup not found');
            return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const popupWidth = 260;
        const popupHeight = 45;

        // 使用 fixed 定位，基于视口计算位置
        let left = rect.left + (rect.width / 2) - (popupWidth / 2);
        let top = rect.top - popupHeight - 10;

        // 边界检查
        left = Math.max(10, Math.min(window.innerWidth - popupWidth - 10, left));
        if (top < 10) {
            top = rect.bottom + 10;
        }

        popup.style.position = 'fixed';
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
        popup.style.display = 'flex';
        popup.style.zIndex = '9999';
    }

    function hideSelectionPopup() {
        const popup = document.getElementById('selection-popup');
        if (popup) {
            popup.style.display = 'none';
        }
    }

    // ========== 媒体插入 ==========
    function openMediaModal(type) {
        // 打开模态框前保存当前选区
        saveCurrentSelection();

        const titles = { image: '插入图片', video: '插入视频', audio: '插入音频' };
        const fileTypes = { image: '支持 JPG、PNG、GIF、WebP', video: '支持 MP4、WebM', audio: '支持 MP3、WAV、OGG' };
        const accepts = { image: 'image/*', video: 'video/*', audio: 'audio/*' };

        const mediaType = document.getElementById('media-type');
        const modalTitle = document.getElementById('media-modal-title');
        const fileTypesEl = document.getElementById('media-file-types');
        const fileInput = document.getElementById('media-file-input');
        const uploadPreview = document.getElementById('upload-preview');
        const mediaUrl = document.getElementById('media-url');

        if (mediaType) mediaType.value = type;
        if (modalTitle) modalTitle.textContent = titles[type];
        if (fileTypesEl) fileTypesEl.textContent = fileTypes[type];
        if (fileInput) fileInput.accept = accepts[type];
        if (uploadPreview) uploadPreview.style.display = 'none';
        if (mediaUrl) mediaUrl.value = '';

        switchMediaTab('upload');
        openModal(document.getElementById('media-modal'));
    }

    function switchMediaTab(tabName) {
        document.querySelectorAll('.media-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        document.querySelectorAll('.media-tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tabName));
    }

    // 选区保存逻辑移到函数中，在 DOM 加载后调用
    let savedRange = null;

    function saveCurrentSelection() {
        const editor = document.getElementById('richtext-content');
        if (!editor) return;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        // 检查选区是否在编辑器内
        if (editor.contains(range.commonAncestorContainer) || editor === range.commonAncestorContainer) {
            savedRange = range.cloneRange(); // ★ 使用 cloneRange 避免原始 range 被修改
        }
    }

    function initSelectionSaver() {
        const editor = document.getElementById('richtext-content');
        if (!editor) return;

        // 在编辑器中操作时保存选区
        editor.addEventListener('mouseup', saveCurrentSelection);
        editor.addEventListener('keyup', saveCurrentSelection);

        // 编辑器失去焦点前保存选区
        editor.addEventListener('blur', saveCurrentSelection);
    }

    function insertMedia() {
        const type = document.getElementById('media-type')?.value;
        const activeTab = document.querySelector('.media-tab.active')?.dataset.tab;
        let element;

        if (activeTab === 'url') {
            const url = document.getElementById('media-url')?.value.trim();
            if (!url) {
                Utils.showMessage('请输入链接', 'error');
                return;
            }

            if (type === 'image') {
                element = `<img src="${url}" style="max-width:100%;height:auto;">`;
            } else if (type === 'video') {
                element = `<video src="${url}" controls style="max-width:100%;"></video>`;
            } else {
                element = `<audio src="${url}" controls></audio>`;
            }
        } else {
            const media = document.querySelector('#upload-preview img, #upload-preview video, #upload-preview audio');
            if (!media) {
                Utils.showMessage('请选择文件', 'error');
                return;
            }
            element = media.outerHTML;
        }

        const editor = document.getElementById('richtext-content');
        const wrapper = document.getElementById('richtext-content-wrapper');
        if (!editor) return;

        // 先关闭模态框
        closeModal(document.getElementById('media-modal'));

        // 保存当前滚动位置
        const scrollTop = wrapper ? wrapper.scrollTop : 0;
        const windowScrollY = window.scrollY;

        // 使用 preventScroll 选项防止 focus 导致的滚动
        editor.focus({ preventScroll: true });

        // 使用 requestAnimationFrame 确保焦点已设置
        requestAnimationFrame(() => {
            const selection = window.getSelection();
            selection.removeAllRanges();

            let range;

            if (savedRange && isRangeValid(savedRange, editor)) {
                range = savedRange;
            } else {
                range = document.createRange();

                if (editor.lastChild) {
                    if (editor.lastChild.nodeType === Node.TEXT_NODE) {
                        range.setStartAfter(editor.lastChild);
                    } else {
                        range.selectNodeContents(editor.lastChild);
                        range.collapse(false);
                    }
                } else {
                    range.selectNodeContents(editor);
                    range.collapse(false);
                }
            }

            selection.addRange(range);

            // 插入内容
            range.deleteContents();
            const fragment = range.createContextualFragment(element + '<p><br></p>');
            range.insertNode(fragment);

            // 将光标移动到插入内容之后
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);

            // 清除保存的选区
            savedRange = null;

            // 恢复滚动位置
            if (wrapper) {
                wrapper.scrollTop = scrollTop;
            }
            window.scrollTo(0, windowScrollY);

            // 可选：滚动到插入的媒体位置
            // requestAnimationFrame(() => {
            //     const insertedMedia = editor.querySelector('img:last-of-type, video:last-of-type, audio:last-of-type');
            //     if (insertedMedia && wrapper) {
            //         const mediaRect = insertedMedia.getBoundingClientRect();
            //         const wrapperRect = wrapper.getBoundingClientRect();
            //         const relativeTop = mediaRect.top - wrapperRect.top + wrapper.scrollTop;
            //         wrapper.scrollTo({
            //             top: Math.max(0, relativeTop - 50),
            //             behavior: 'smooth'
            //         });
            //     }
            // });

            markChanged();
        });
    }

    // 检查 range 是否仍然有效
    function isRangeValid(range, container) {
        try {
            // 检查 range 的起始和结束节点是否仍在容器内
            return container.contains(range.startContainer) && container.contains(range.endContainer);
        } catch (e) {
            return false;
        }
    }

    function openLinkModal() {
        saveCurrentSelection();

        const linkText = document.getElementById('link-text');
        const linkUrl = document.getElementById('link-url');

        if (linkText) linkText.value = window.getSelection().toString();
        if (linkUrl) linkUrl.value = '';

        openModal(document.getElementById('link-modal'));
    }

    function insertLink() {
        const text = document.getElementById('link-text')?.value.trim();
        const url = document.getElementById('link-url')?.value.trim();
        const newTab = document.getElementById('link-new-tab')?.checked;

        if (!url) { Utils.showMessage('请输入链接地址', 'error'); return; }

        const target = newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
        const linkHtml = `<a href="${url}"${target} class="editor-link">${text || url}</a>`;

        const editor = document.getElementById('richtext-content');
        const wrapper = document.getElementById('richtext-content-wrapper');
        if (!editor) return;

        closeModal(document.getElementById('link-modal'));

        // 保存滚动位置
        const scrollTop = wrapper ? wrapper.scrollTop : 0;
        const windowScrollY = window.scrollY;

        editor.focus({ preventScroll: true });

        requestAnimationFrame(() => {
            const selection = window.getSelection();

            if (savedRange && isRangeValid(savedRange, editor)) {
                selection.removeAllRanges();
                selection.addRange(savedRange);

                const range = selection.getRangeAt(0);
                range.deleteContents();
                const fragment = range.createContextualFragment(linkHtml);
                range.insertNode(fragment);
                range.collapse(false);
            } else {
                editor.insertAdjacentHTML('beforeend', linkHtml);
            }

            savedRange = null;

            // 恢复滚动位置
            if (wrapper) wrapper.scrollTop = scrollTop;
            window.scrollTo(0, windowScrollY);

            markChanged();
        });
    }

    function openTableModal() {
        // 保存选区
        saveCurrentSelection();

        const rows = document.getElementById('table-rows');
        const cols = document.getElementById('table-cols');

        if (rows) rows.value = 3;
        if (cols) cols.value = 3;

        openModal(document.getElementById('table-modal'));
    }

    function insertTable() {
        const rows = parseInt(document.getElementById('table-rows')?.value) || 3;
        const cols = parseInt(document.getElementById('table-cols')?.value) || 3;
        const hasHeader = document.getElementById('table-header')?.checked;

        let tableHtml = '<table class="editor-table"><tbody>';
        for (let i = 0; i < rows; i++) {
            tableHtml += '<tr>';
            for (let j = 0; j < cols; j++) {
                if (i === 0 && hasHeader) {
                    tableHtml += '<th><br></th>';
                } else {
                    tableHtml += '<td><br></td>';
                }
            }
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table><p><br></p>';

        const editor = document.getElementById('richtext-content');
        const wrapper = document.getElementById('richtext-content-wrapper');
        if (!editor) return;

        closeModal(document.getElementById('table-modal'));

        // 保存滚动位置
        const scrollTop = wrapper ? wrapper.scrollTop : 0;
        const windowScrollY = window.scrollY;

        editor.focus({ preventScroll: true });

        requestAnimationFrame(() => {
            const selection = window.getSelection();

            if (savedRange && isRangeValid(savedRange, editor)) {
                selection.removeAllRanges();
                selection.addRange(savedRange);

                const range = selection.getRangeAt(0);
                range.deleteContents();
                const fragment = range.createContextualFragment(tableHtml);
                range.insertNode(fragment);
                range.collapse(false);
            } else {
                editor.insertAdjacentHTML('beforeend', tableHtml);
            }

            savedRange = null;

            // 恢复滚动位置
            if (wrapper) wrapper.scrollTop = scrollTop;
            window.scrollTo(0, windowScrollY);

            markChanged();
        });
    }

    // ========== 笔记管理 ==========
    function renderNotes() {
        const noteList = document.getElementById('notes-list');
        const emptyEl = document.getElementById('notes-empty');
        const countBadge = document.getElementById('note-count-badge');

        if (countBadge) countBadge.textContent = lessonNotes.length;

        console.log('renderNotes 被调用，笔记数量:', lessonNotes.length);
        console.log('笔记详情:', lessonNotes);

        if (lessonNotes.length === 0) {
            if (noteList) noteList.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'flex';
            console.log('没有笔记，显示空状态');
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        if (!noteList) {
            console.error('找不到 notes-list 元素');
            return;
        }

        console.log('开始渲染笔记卡片');

        noteList.innerHTML = lessonNotes.map(note => {
            console.log('渲染笔记:', note.id, note.content);
            return `
                <div class="note-card ${activeNoteId === note.id ? 'active' : ''}" 
                     data-note-id="${note.id}"
                     data-source="${note.source || ''}"
                     data-dialogue-index="${note.dialogueIndex !== undefined ? note.dialogueIndex : ''}"
                     data-selected-text="${escapeHtml(note.selectedText || '')}">
                    ${note.selectedText ? `
                        <div class="note-quote" style="border-left-color: ${note.highlightColor || '#fef08a'}">
                            "${escapeHtml(note.selectedText)}"
                        </div>
                    ` : ''}
                    <div class="note-content">${escapeHtml(note.content || '(仅高亮)')}</div>
                    <div class="note-meta">
                        <span class="note-time">${Utils.formatDate(note.createdAt)}</span>
                        <div class="note-actions">
                            <button type="button" class="btn-icon edit-note-btn" data-id="${note.id}" title="编辑">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button type="button" class="btn-icon delete delete-note-btn" data-id="${note.id}" title="删除">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        console.log('笔记卡片渲染完成，HTML 长度:', noteList.innerHTML.length);

        // 绑定笔记点击事件
        noteList.querySelectorAll('.note-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.note-actions')) return;
                handleNoteClick(card);
            });
        });

        // 编辑笔记
        noteList.querySelectorAll('.edit-note-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditNoteModal(btn.dataset.id);
            });
        });

        // 删除笔记
        noteList.querySelectorAll('.delete-note-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteNote(btn.dataset.id);
            });
        });

        console.log('笔记事件绑定完成');

        // 延迟更新连接线，确保 DOM 已渲染
        requestAnimationFrame(() => {
            console.log('准备更新连接线 (从 renderNotes)');
            updateConnectorLines();
        });
    }

    function handleNoteClick(noteCard) {
        const noteId = noteCard.dataset.noteId;
        const source = noteCard.dataset.source;
        const text = noteCard.dataset.selectedText;

        document.querySelectorAll('.note-card').forEach(c => c.classList.remove('active'));
        noteCard.classList.add('active');
        activeNoteId = noteId;

        if (text) {
            scrollToHighlightedText(noteId, source);
        }

        requestAnimationFrame(() => updateConnectorLines());
    }

    function scrollToHighlightedText(noteId, source) {
        let container, highlightEl;

        if (source === 'dialogue') {
            container = document.getElementById('dialogue-preview');
            highlightEl = container?.querySelector(`.highlight[data-note-id="${noteId}"]`);
        } else {
            container = document.getElementById('richtext-content-wrapper');
            const editor = document.getElementById('richtext-content');
            highlightEl = editor?.querySelector(`.highlight[data-note-id="${noteId}"]`);
        }

        if (!highlightEl || !container) {
            console.warn('无法找到高亮元素或容器', { noteId, source });
            return;
        }

        // 使用 getBoundingClientRect 计算相对位置
        const containerRect = container.getBoundingClientRect();
        const highlightRect = highlightEl.getBoundingClientRect();

        // 计算高亮元素相对于容器可视区域的当前位置
        // 然后加上容器的当前滚动位置，得到元素在整个内容中的位置
        const relativeTop = highlightRect.top - containerRect.top + container.scrollTop;

        // 计算目标滚动位置（使高亮元素在容器中垂直居中）
        const targetScrollTop = relativeTop - (container.clientHeight / 2) + (highlightRect.height / 2);

        container.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
        });

        // 添加闪烁效果
        highlightEl.classList.add('highlight-flash');
        setTimeout(() => highlightEl.classList.remove('highlight-flash'), 1500);
    }

    function openNoteModal() {
        if (!selectedText) {
            Utils.showMessage('请先选择文本', 'error');
            return;
        }

        const display = document.getElementById('selected-text-display');
        const content = document.getElementById('note-content');
        const highlightColor = document.getElementById('highlight-color');

        if (display) display.textContent = `"${selectedText}"`;
        if (content) content.value = '';
        if (highlightColor) highlightColor.value = '#fef08a';

        // 重置高亮颜色选择
        document.querySelectorAll('#highlight-colors .highlight-color').forEach((btn, i) => {
            btn.classList.toggle('active', i === 0);
        });

        openModal(document.getElementById('note-modal'));
        hideSelectionPopup();
    }

    function openEditNoteModal(noteId) {
        const note = lessonNotes.find(n => n.id === noteId);
        if (!note) return;

        const display = document.getElementById('selected-text-display');
        const content = document.getElementById('note-content');
        const highlightColor = document.getElementById('highlight-color');

        if (display) display.textContent = note.selectedText ? `"${note.selectedText}"` : '(无关联文本)';
        if (content) content.value = note.content || '';
        if (highlightColor) highlightColor.value = note.highlightColor || '#fef08a';

        // 设置高亮颜色选择
        document.querySelectorAll('#highlight-colors .highlight-color').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === (note.highlightColor || '#fef08a'));
        });

        // 存储正在编辑的笔记ID
        const form = document.getElementById('note-form');
        if (form) form.dataset.editId = noteId;

        openModal(document.getElementById('note-modal'));
    }

    function saveNote(e) {
        e.preventDefault();

        const form = document.getElementById('note-form');
        const editId = form?.dataset.editId;
        const content = document.getElementById('note-content')?.value.trim();
        const highlightColor = document.getElementById('highlight-color')?.value || '#fef08a';

        if (!content) {
            Utils.showMessage('请输入笔记内容', 'error');
            return;
        }

        const globalNotes = Storage.load('notes', []);

        if (editId) {
            // 编辑模式
            const noteIndex = lessonNotes.findIndex(n => n.id === editId);
            if (noteIndex !== -1) {
                lessonNotes[noteIndex].content = content;
                lessonNotes[noteIndex].highlightColor = highlightColor;
                lessonNotes[noteIndex].updatedAt = new Date().toISOString();
                lessonNotes[noteIndex].isHighlightOnly = false;

                const globalIndex = globalNotes.findIndex(n => n.id === editId);
                if (globalIndex !== -1) {
                    globalNotes[globalIndex].content = content;
                    globalNotes[globalIndex].highlightColor = highlightColor;
                    globalNotes[globalIndex].updatedAt = new Date().toISOString();
                }
            }
            delete form.dataset.editId;
        } else {
            // 新建模式
            const context = window.selectedTextContext || {};
            const note = {
                id: Utils.generateId(),
                title: selectedText ? `笔记 - ${selectedText.substring(0, 20)}...` : '课文笔记',
                content,
                selectedText: selectedText,
                source: selectionSource,
                dialogueIndex: selectionSource === 'dialogue' ? selectedDialogueIndex : undefined,
                // 保存上下文而非绝对位置
                textContext: selectionSource === 'article' ? {
                    before: context.before || '',
                    after: context.after || '',
                    text: context.text || selectedText
                } : undefined,
                highlightColor: highlightColor,
                lessonId: currentLesson.id,
                courseId: currentLesson.courseId,
                textbookId: currentTextbook?.id,
                createdAt: new Date().toISOString(),
                isHighlightOnly: false
            };

            lessonNotes.push(note);
            globalNotes.push(note);
            activeNoteId = note.id;
        }

        Storage.save('notes', globalNotes);
        closeModal(document.getElementById('note-modal'));

        // 重新渲染内容和笔记
        if (currentLesson.type === 'dialogue') {
            renderDialogues();
        } else {
            applyHighlightsToArticle();
        }

        renderNotes();
        markChanged();

        // 使用多次 requestAnimationFrame 确保 DOM 完全渲染
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    console.log('开始绘制连接线');
                    updateConnectorLines();
                });
            });
        });

        Utils.showMessage(editId ? '笔记已更新' : '笔记已添加', 'success');
    }

    function deleteNote(noteId) {
        if (!confirm('确定删除这条笔记吗？')) return;

        // 从 lessonNotes 删除
        lessonNotes = lessonNotes.filter(n => n.id !== noteId);

        // 从全局 notes 删除
        let globalNotes = Storage.load('notes', []);
        globalNotes = globalNotes.filter(n => n.id !== noteId);
        Storage.save('notes', globalNotes);

        if (activeNoteId === noteId) {
            activeNoteId = null;
        }

        if (currentLesson.type === 'dialogue') {
            renderDialogues();
        } else {
            applyHighlightsToArticle();
        }

        renderNotes();
        updateConnectorLines();
        markChanged();
        Utils.showMessage('笔记已删除', 'success');
    }

    function addHighlight() {
        if (!selectedText || !selectedRange) {
            Utils.showMessage('请先选择文本', 'error');
            return;
        }

        const color = '#fef08a';
        const globalNotes = Storage.load('notes', []);
        const context = window.selectedTextContext || {};

        const note = {
            id: Utils.generateId(),
            title: `高亮 - ${selectedText.substring(0, 20)}...`,
            content: '',
            selectedText: selectedText,
            source: selectionSource,
            dialogueIndex: selectionSource === 'dialogue' ? selectedDialogueIndex : undefined,
            // 保存上下文
            textContext: selectionSource === 'article' ? {
                before: context.before || '',
                after: context.after || '',
                text: context.text || selectedText
            } : undefined,
            highlightColor: color,
            lessonId: currentLesson.id,
            courseId: currentLesson.courseId,
            textbookId: currentTextbook?.id,
            createdAt: new Date().toISOString(),
            isHighlightOnly: true
        };

        lessonNotes.push(note);
        globalNotes.push(note);
        Storage.save('notes', globalNotes);

        activeNoteId = note.id;

        hideSelectionPopup();

        if (currentLesson.type === 'dialogue') {
            renderDialogues();
        } else {
            applyHighlightsToArticle();
        }

        renderNotes();
        markChanged();

        // 延迟更新连接线
        setTimeout(() => {
            updateConnectorLines();
        }, 100);

        Utils.showMessage('高亮已添加', 'success');
    }

    function applyHighlightsToArticle() {
        const editor = document.getElementById('richtext-content');
        if (!editor) {
            console.error('找不到 richtext-content 元素');
            return;
        }

        console.log('=== applyHighlightsToArticle 开始 ===');

        // 先移除所有现有高亮,保留纯文本
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = editor.innerHTML;
        tempDiv.querySelectorAll('.highlight').forEach(el => {
            const textNode = document.createTextNode(el.textContent);
            el.parentNode.replaceChild(textNode, el);
        });
        tempDiv.normalize();
        editor.innerHTML = tempDiv.innerHTML;

        // 获取所有文章笔记
        const articleNotes = lessonNotes.filter(n => n.source === 'article' && n.selectedText);

        console.log('文章笔记数量:', articleNotes.length);

        if (articleNotes.length === 0) {
            console.log('没有文章笔记需要高亮');
            return;
        }

        const fullText = editor.textContent;
        console.log('文章全文长度:', fullText.length);

        // 为每个笔记找到最佳匹配位置并高亮
        articleNotes.forEach(note => {
            const targetText = note.selectedText;
            const context = note.textContext;

            console.log('处理笔记:', note.id, '目标文本:', targetText.substring(0, 20) + '...');

            let bestMatch = findBestTextMatch(fullText, targetText, context);

            if (bestMatch === -1) {
                console.warn('❌ 无法找到匹配文本:', targetText.substring(0, 20));
                return;
            }

            console.log('✅ 找到匹配位置:', bestMatch);

            // 在找到的位置应用高亮
            applyHighlightAtPosition(editor, bestMatch, targetText.length, note.id, note.highlightColor);
        });

        console.log('=== applyHighlightsToArticle 完成 ===');

        // 验证高亮是否应用成功
        const highlights = editor.querySelectorAll('.highlight');
        console.log('应用后的高亮元素数量:', highlights.length);
        highlights.forEach(h => {
            console.log('高亮元素:', h.dataset.noteId, h.textContent.substring(0, 20));
        });

        // 使用多次 RAF 确保 DOM 完全更新后再绘制连接线
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    console.log('从 applyHighlightsToArticle 准备更新连接线');
                    updateConnectorLines();
                });
            });
        });
    }

    // 智能文本匹配函数
    function findBestTextMatch(fullText, targetText, context) {
        // 查找所有可能的匹配位置
        const matches = [];
        let searchPos = 0;

        while (true) {
            const pos = fullText.indexOf(targetText, searchPos);
            if (pos === -1) break;
            matches.push(pos);
            searchPos = pos + 1;
        }

        if (matches.length === 0) return -1;
        if (matches.length === 1) return matches[0];

        // 如果有多个匹配，使用上下文选择最佳匹配
        if (context && (context.before || context.after)) {
            let bestMatch = matches[0];
            let bestScore = 0;

            for (const pos of matches) {
                let score = 0;

                // 检查前文匹配度
                if (context.before) {
                    const actualBefore = fullText.substring(Math.max(0, pos - 30), pos);
                    score += calculateSimilarity(context.before, actualBefore);
                }

                // 检查后文匹配度
                if (context.after) {
                    const actualAfter = fullText.substring(pos + targetText.length, pos + targetText.length + 30);
                    score += calculateSimilarity(context.after, actualAfter);
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = pos;
                }
            }

            return bestMatch;
        }

        // 没有上下文信息，返回第一个匹配
        return matches[0];
    }

    // 计算文本相似度
    function calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;

        const len = Math.min(str1.length, str2.length);
        let matches = 0;

        for (let i = 0; i < len; i++) {
            if (str1[i] === str2[i]) matches++;
        }

        return matches / Math.max(str1.length, str2.length);
    }

    // 在指定位置应用高亮
    function applyHighlightAtPosition(editor, startPos, length, noteId, color) {
        const walker = document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let currentPos = 0;
        let startNode = null;
        let startOffset = 0;
        let endNode = null;
        let endOffset = 0;

        // 找到起始和结束的文本节点及偏移
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const nodeLength = node.textContent.length;

            if (currentPos + nodeLength > startPos && !startNode) {
                startNode = node;
                startOffset = startPos - currentPos;
            }

            if (currentPos + nodeLength >= startPos + length) {
                endNode = node;
                endOffset = startPos + length - currentPos;
                break;
            }

            currentPos += nodeLength;
        }

        if (!startNode || !endNode) return;

        // 创建 range 并应用高亮
        try {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);

            const highlightSpan = document.createElement('span');
            highlightSpan.className = 'highlight';
            highlightSpan.style.backgroundColor = color || '#fef08a';
            highlightSpan.setAttribute('data-note-id', noteId);

            range.surroundContents(highlightSpan);
        } catch (e) {
            // 如果跨越多个节点，使用更复杂的方法
            console.warn('高亮跨越多个节点，使用备用方法', e);
            applyHighlightComplex(editor, startNode, startOffset, endNode, endOffset, noteId, color);
        }
    }

    // 处理跨节点高亮
    function applyHighlightComplex(editor, startNode, startOffset, endNode, endOffset, noteId, color) {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);

        const contents = range.extractContents();
        const highlightSpan = document.createElement('span');
        highlightSpan.className = 'highlight';
        highlightSpan.style.backgroundColor = color || '#fef08a';
        highlightSpan.setAttribute('data-note-id', noteId);
        highlightSpan.appendChild(contents);

        range.insertNode(highlightSpan);
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ========== 生词管理 ==========
    function openVocabModal() {
        if (!selectedText) {
            Utils.showMessage('请先选择文本', 'error');
            return;
        }

        const wordInput = document.getElementById('vocab-word');
        const phoneticInput = document.getElementById('vocab-phonetic');
        const definitionInput = document.getElementById('vocab-definition');
        const exampleInput = document.getElementById('vocab-example');

        if (wordInput) wordInput.value = selectedText;
        if (phoneticInput) phoneticInput.value = '';
        if (definitionInput) definitionInput.value = '';
        if (exampleInput) exampleInput.value = '';

        openModal(document.getElementById('vocab-modal'));
        hideSelectionPopup();
    }

    function saveVocabulary(e) {
        e.preventDefault();

        const word = document.getElementById('vocab-word')?.value.trim();
        const phonetic = document.getElementById('vocab-phonetic')?.value.trim();
        const definition = document.getElementById('vocab-definition')?.value.trim();
        const example = document.getElementById('vocab-example')?.value.trim();

        if (!word) {
            Utils.showMessage('请输入生词', 'error');
            return;
        }

        if (!definition) {
            Utils.showMessage('请输入释义', 'error');
            return;
        }

        const vocabulary = Storage.load('vocabulary', []);

        const existing = vocabulary.find(v => v.word === word && v.lessonId === currentLesson.id);
        if (existing) {
            Utils.showMessage('该生词在本课中已存在', 'error');
            return;
        }

        vocabulary.push({
            id: Utils.generateId(),
            word,
            phonetic,
            definition,
            example,
            lessonId: currentLesson.id,
            courseId: currentLesson.courseId,
            createdAt: new Date().toISOString()
        });

        Storage.save('vocabulary', vocabulary);
        closeModal(document.getElementById('vocab-modal'));
        Utils.showMessage('生词已添加', 'success');
    }

    // ========== 连接线功能 ==========
    let connectorSvg = null;
    let rafId = null;

    // 可见性阈值：元素可见比例超过此值才算可见
    const VISIBILITY_THRESHOLD = 0.3; // 30%

    function initConnectorLines() {
        connectorSvg = document.getElementById('note-connector-svg');
        if (!connectorSvg) {
            console.log('创建新的 SVG 连接线容器');
            connectorSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            connectorSvg.id = 'note-connector-svg';
            connectorSvg.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 1000;
                overflow: visible;
            `;

            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defs.innerHTML = `
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" opacity="0.7"/>
                </marker>
                <marker id="arrowhead-active" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
                </marker>
            `;
            connectorSvg.appendChild(defs);
            document.body.appendChild(connectorSvg);
            console.log('SVG 容器已添加到 body');
        } else {
            console.log('使用现有的 SVG 容器');
        }

        const scrollOptions = { passive: true };

        window.addEventListener('scroll', onScrollUpdate, scrollOptions);
        window.addEventListener('resize', onScrollUpdate, scrollOptions);

        const dialoguePreview = document.getElementById('dialogue-preview');
        const articleWrapper = document.getElementById('richtext-content-wrapper');
        const notesList = document.getElementById('notes-list');
        const editorSidebar = document.querySelector('.editor-sidebar');

        dialoguePreview?.addEventListener('scroll', onScrollUpdate, scrollOptions);
        articleWrapper?.addEventListener('scroll', onScrollUpdate, scrollOptions);
        notesList?.addEventListener('scroll', onScrollUpdate, scrollOptions);
        editorSidebar?.addEventListener('scroll', onScrollUpdate, scrollOptions);
    }

    function onScrollUpdate() {
        if (rafId) {
            cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(updateConnectorLines);
    }

    // 计算元素在容器内的可见比例
    function getVisibilityRatio(elementRect, containerRect) {
        if (!containerRect) {
            // 如果没有容器，使用视口
            containerRect = {
                top: 0,
                bottom: window.innerHeight,
                left: 0,
                right: window.innerWidth
            };
        }

        const elementHeight = elementRect.height;
        const elementWidth = elementRect.width;

        if (elementHeight === 0 || elementWidth === 0) return 0;

        // 计算可见区域
        const visibleTop = Math.max(elementRect.top, containerRect.top);
        const visibleBottom = Math.min(elementRect.bottom, containerRect.bottom);
        const visibleLeft = Math.max(elementRect.left, containerRect.left);
        const visibleRight = Math.min(elementRect.right, containerRect.right);

        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);

        // 返回可见面积比例
        const visibleArea = visibleHeight * visibleWidth;
        const totalArea = elementHeight * elementWidth;

        return visibleArea / totalArea;
    }

    function updateConnectorLines() {
        if (!connectorSvg) {
            console.warn('connectorSvg 不存在，尝试重新初始化');
            initConnectorLines();
            if (!connectorSvg) return;
        }

        console.log('=== 开始更新连接线 ===');
        console.log('笔记数量:', lessonNotes.length);
        console.log('SVG 元素:', connectorSvg);

        const lines = connectorSvg.querySelectorAll('.connector-line');
        lines.forEach(line => line.remove());

        const notesList = document.getElementById('notes-list');
        const notesListRect = notesList?.getBoundingClientRect();

        lessonNotes.forEach(note => {
            if (!note.selectedText) {
                console.log(`笔记 ${note.id} 没有选中文本`);
                return;
            }

            const noteCard = document.querySelector(`.note-card[data-note-id="${note.id}"]`);
            if (!noteCard) {
                console.warn(`找不到笔记卡片: ${note.id}`);
                return;
            }

            let highlightEl, contentContainer;
            if (note.source === 'dialogue') {
                contentContainer = document.getElementById('dialogue-preview');
                highlightEl = contentContainer?.querySelector(`.highlight[data-note-id="${note.id}"]`);
            } else {
                contentContainer = document.getElementById('richtext-content-wrapper');
                const editor = document.getElementById('richtext-content');
                highlightEl = editor?.querySelector(`.highlight[data-note-id="${note.id}"]`);
            }

            if (!highlightEl) {
                console.warn(`找不到高亮元素: ${note.id}, source: ${note.source}`);
                return;
            }
            if (!contentContainer) {
                console.warn(`找不到内容容器: ${note.source}`);
                return;
            }

            console.log(`找到笔记 ${note.id} 的高亮元素和卡片`);

            const noteRect = noteCard.getBoundingClientRect();
            const highlightRect = highlightEl.getBoundingClientRect();
            const contentContainerRect = contentContainer.getBoundingClientRect();

            // 计算笔记卡片在笔记列表中的可见比例
            const noteVisibilityInList = notesListRect
                ? getVisibilityRatio(noteRect, notesListRect)
                : 1;

            // 计算笔记卡片在视口中的可见比例
            const noteVisibilityInViewport = getVisibilityRatio(noteRect, null);

            // 笔记整体可见性取较小值
            const noteVisibility = Math.min(noteVisibilityInList, noteVisibilityInViewport);

            // 计算高亮在课文容器中的可见比例
            const highlightVisibilityInContainer = getVisibilityRatio(highlightRect, contentContainerRect);

            // 计算高亮在视口中的可见比例
            const highlightVisibilityInViewport = getVisibilityRatio(highlightRect, null);

            // 高亮整体可见性取较小值
            const highlightVisibility = Math.min(highlightVisibilityInContainer, highlightVisibilityInViewport);

            // 只有两者可见比例都超过阈值才绘制连接线
            if (noteVisibility < VISIBILITY_THRESHOLD || highlightVisibility < VISIBILITY_THRESHOLD) return;

            const isActive = note.id === activeNoteId;
            drawConnectorLine(highlightRect, noteRect, isActive);
        });
    }

    function drawConnectorLine(fromRect, toRect, isActive = false) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('connector-line');

        const fromX = fromRect.right + 2;
        const fromY = fromRect.top + fromRect.height / 2;
        const toX = toRect.left - 2;
        const toY = toRect.top + toRect.height / 2;

        const distance = Math.abs(toX - fromX);
        const controlOffset = Math.min(distance * 0.4, 80);

        let d;
        if (toX > fromX) {
            d = `M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`;
        } else {
            const midY = (fromY + toY) / 2;
            d = `M ${fromX} ${fromY} C ${fromX + 50} ${fromY}, ${fromX + 50} ${midY}, ${(fromX + toX) / 2} ${midY} S ${toX - 50} ${toY}, ${toX} ${toY}`;
        }

        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');

        if (isActive) {
            path.setAttribute('stroke', '#3b82f6');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-dasharray', '8,4');
            path.setAttribute('marker-end', 'url(#arrowhead-active)');
            path.setAttribute('opacity', '1');
        } else {
            path.setAttribute('stroke', '#94a3b8');
            path.setAttribute('stroke-width', '1');
            path.setAttribute('stroke-dasharray', '4,4');
            path.setAttribute('marker-end', 'url(#arrowhead)');
            path.setAttribute('opacity', '0.5');
        }

        connectorSvg.appendChild(path);
    }

    // ========== 保存功能 ==========
    function saveLesson() {
        const title = document.getElementById('lesson-title')?.value.trim();
        const order = document.getElementById('lesson-order')?.value;

        if (!title) {
            Utils.showMessage('请输入课文标题', 'error');
            return;
        }

        const lessons = Storage.load('lessons', []);
        const isNew = !currentLesson.id;

        if (isNew) {
            currentLesson.id = Utils.generateId();
            currentLesson.createdAt = new Date().toISOString();
        }

        currentLesson.title = title;
        currentLesson.order = order ? parseInt(order) : null;
        currentLesson.updatedAt = new Date().toISOString();

        if (currentLesson.type === 'dialogue') {
            currentLesson.speakers = speakers;
            currentLesson.dialogues = dialogues;
            currentLesson.content = '';
        } else {
            const editor = document.getElementById('richtext-content');
            if (editor) {
                // 保存前不移除高亮，但要确保视频等媒体元素完整保存
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = editor.innerHTML;

                // 只移除高亮标记，保留内容
                tempDiv.querySelectorAll('.highlight').forEach(el => {
                    const textNode = document.createTextNode(el.textContent);
                    el.parentNode.replaceChild(textNode, el);
                });
                tempDiv.normalize();

                currentLesson.content = tempDiv.innerHTML;
            }
            currentLesson.speakers = [];
            currentLesson.dialogues = [];
        }

        if (isNew) {
            lessons.push(currentLesson);
        } else {
            const index = lessons.findIndex(l => l.id === currentLesson.id);
            if (index !== -1) {
                lessons[index] = currentLesson;
            }
        }

        // 添加保存错误处理
        try {
            Storage.save('lessons', lessons);
            hasChanges = false;
            Utils.showMessage('保存成功', 'success');

            if (isNew) {
                const newUrl = `lesson-edit.html?id=${currentLesson.id}`;
                window.history.replaceState({}, '', newUrl);
            }
        } catch (error) {
            console.error('Save error:', error);
            if (error.name === 'QuotaExceededError') {
                Utils.showMessage('存储空间不足，请尝试压缩图片或视频', 'error');
            } else {
                Utils.showMessage('保存失败：' + error.message, 'error');
            }
        }
    }

    function markChanged() {
        hasChanges = true;
    }

    // ========== 事件绑定 ==========
    function bindEvents() {
        // 保存按钮
        document.getElementById('save-btn')?.addEventListener('click', saveLesson);

        // 标题变化
        document.getElementById('lesson-title')?.addEventListener('input', markChanged);
        document.getElementById('lesson-order')?.addEventListener('input', markChanged);

        // 对话式编辑器
        document.getElementById('add-speaker-btn')?.addEventListener('click', () => openSpeakerModal());
        document.getElementById('speaker-form')?.addEventListener('submit', saveSpeaker);
        document.getElementById('send-dialogue-btn')?.addEventListener('click', sendDialogue);

        // 角色选择变化
        document.getElementById('current-speaker')?.addEventListener('change', e => {
            const speakerId = e.target.value;
            const positionSelect = document.getElementById('current-position');

            if (speakerId === NARRATOR_ID) {
                if (positionSelect) {
                    positionSelect.value = 'center';
                    positionSelect.disabled = true;
                }
            } else {
                const speaker = speakers.find(s => s.id === speakerId);
                if (speaker && positionSelect) {
                    positionSelect.value = speaker.position;
                    positionSelect.disabled = false;
                }
            }
        });

        // 对话输入回车发送
        document.getElementById('dialogue-input')?.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendDialogue();
            }
        });

        // 头像类型切换
        document.querySelectorAll('input[name="avatar-type"]').forEach(radio => {
            radio.addEventListener('change', e => toggleAvatarType(e.target.value));
        });

        // 头像颜色选择
        document.querySelectorAll('#speaker-color-picker .color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#speaker-color-picker .color-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const colorInput = document.getElementById('speaker-color');
                if (colorInput) colorInput.value = btn.dataset.color;
                const nameInput = document.getElementById('speaker-name');
                updateAvatarPreview(null, nameInput?.value || 'A', btn.dataset.color);
            });
        });

        // 角色名称变化
        document.getElementById('speaker-name')?.addEventListener('input', e => {
            const avatarType = document.querySelector('input[name="avatar-type"]:checked')?.value;
            if (avatarType === 'letter') {
                const color = document.getElementById('speaker-color')?.value || '#2563eb';
                updateAvatarPreview(null, e.target.value || 'A', color);
            }
        });

        // 头像上传
        document.getElementById('choose-avatar-btn')?.addEventListener('click', () => {
            document.getElementById('avatar-file-input')?.click();
        });

        document.getElementById('avatar-file-input')?.addEventListener('change', e => {
            const file = e.target.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = ev => initCropModal(ev.target.result);
                reader.readAsDataURL(file);
            }
        });

        // 裁剪相关 - 简化，主要逻辑在 bindCropEvents 中
        document.getElementById('crop-confirm-btn')?.addEventListener('click', confirmCrop);
        document.getElementById('crop-cancel-btn')?.addEventListener('click', () => {
            closeModal(document.getElementById('crop-modal'));
            cleanupCropEvents();
        });

        // 裁剪模态框关闭时清理
        document.getElementById('crop-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'crop-modal') {
                closeModal(document.getElementById('crop-modal'));
                cleanupCropEvents();
            }
        });

        // 媒体上传
        document.querySelectorAll('.media-tab').forEach(tab => {
            tab.addEventListener('click', () => switchMediaTab(tab.dataset.tab));
        });

        document.getElementById('media-upload-area')?.addEventListener('click', () => {
            document.getElementById('media-file-input')?.click();
        });

        // ========== 修改媒体文件上传处理 ==========
        document.getElementById('media-file-input')?.addEventListener('change', e => {
            const file = e.target.files?.[0];
            if (!file) return;

            const type = document.getElementById('media-type')?.value;
            const preview = document.getElementById('upload-preview');

            // 检查文件大小
            const maxSize = type === 'video' ? 10 * 1024 * 1024 : 5 * 1024 * 1024; // 视频10MB，其他5MB

            if (file.size > maxSize) {
                const sizeMB = (maxSize / 1024 / 1024).toFixed(0);
                Utils.showMessage(`文件过大，请选择小于 ${sizeMB}MB 的文件`, 'error');
                e.target.value = '';
                return;
            }

            const reader = new FileReader();

            reader.onload = ev => {
                if (!preview) return;
                preview.style.display = 'block';

                if (type === 'image') {
                    preview.innerHTML = `<img src="${ev.target.result}" style="max-width: 100%; max-height: 200px;">`;
                } else if (type === 'video') {
                    // 视频添加完整控制和样式
                    preview.innerHTML = `<video src="${ev.target.result}" controls style="max-width: 100%; max-height: 300px;"></video>`;
                } else {
                    preview.innerHTML = `<audio src="${ev.target.result}" controls></audio>`;
                }
            };

            reader.onerror = () => {
                Utils.showMessage('文件读取失败', 'error');
            };

            reader.readAsDataURL(file);
        });

        document.getElementById('media-insert-btn')?.addEventListener('click', insertMedia);

        // 链接表单
        document.getElementById('link-form')?.addEventListener('submit', e => {
            e.preventDefault();
            insertLink();
        });

        // 表格表单
        document.getElementById('table-form')?.addEventListener('submit', e => {
            e.preventDefault();
            insertTable();
        });

        // 选择弹窗按钮
        document.getElementById('add-note-btn')?.addEventListener('click', () => {
            console.log('添加笔记按钮点击');
            openNoteModal();
        });

        document.getElementById('highlight-btn')?.addEventListener('click', () => {
            console.log('高亮按钮点击');
            addHighlight();
        });

        document.getElementById('add-vocab-btn')?.addEventListener('click', () => {
            console.log('添加生词按钮点击');
            openVocabModal();
        });

        // 笔记表单
        document.getElementById('note-form')?.addEventListener('submit', saveNote);

        // 笔记高亮颜色选择
        document.querySelectorAll('#highlight-colors .highlight-color').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#highlight-colors .highlight-color').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const colorInput = document.getElementById('highlight-color');
                if (colorInput) colorInput.value = btn.dataset.color;
            });
        });

        // 生词表单
        document.getElementById('vocab-form')?.addEventListener('submit', saveVocabulary);

        // 点击其他区域隐藏选择弹窗
        document.addEventListener('mousedown', e => {
            const popup = document.getElementById('selection-popup');
            if (popup && !popup.contains(e.target)) {
                setTimeout(() => {
                    const selection = window.getSelection();
                    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
                        hideSelectionPopup();
                    }
                }, 50);
            }
        });

        // 模态框关闭按钮
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal-overlay');
                if (modal) {
                    closeModal(modal);
                    // 清理笔记编辑状态
                    const noteForm = document.getElementById('note-form');
                    if (noteForm) delete noteForm.dataset.editId;
                }
            });
        });

        // 模态框取消按钮
        const cancelButtons = [
            'speaker-modal-cancel',
            'note-modal-cancel',
            'vocab-modal-cancel',
            'media-modal-cancel',
            'link-modal-cancel',
            'table-modal-cancel',
            'confirm-leave-cancel',
            'replacement-modal-cancel',
            'save-set-modal-cancel',
        ];

        cancelButtons.forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => {
                const btn = document.getElementById(id);
                const modal = btn?.closest('.modal-overlay');
                if (modal) {
                    closeModal(modal);
                    const noteForm = document.getElementById('note-form');
                    if (noteForm) delete noteForm.dataset.editId;
                }
            });
        });

        // 点击遮罩关闭
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', e => {
                if (e.target === overlay) {
                    closeModal(overlay);
                    const noteForm = document.getElementById('note-form');
                    if (noteForm) delete noteForm.dataset.editId;
                }
            });
        });

        // 页面离开提示
        window.addEventListener('beforeunload', e => {
            if (hasChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // 返回/取消按钮
        document.getElementById('cancel-btn')?.addEventListener('click', handleCancel);

        // 离开确认弹窗
        document.getElementById('confirm-leave-btn')?.addEventListener('click', () => {
            hasChanges = false;
            if (pendingNavigation) {
                window.location.href = pendingNavigation;
            } else {
                window.history.back();
            }
        });

        // 高亮文本点击 - 激活对应笔记
        document.addEventListener('click', e => {
            const highlight = e.target.closest('.highlight');
            if (highlight) {
                const noteId = highlight.dataset.noteId;
                if (noteId) {
                    const noteCard = document.querySelector(`.note-card[data-note-id="${noteId}"]`);
                    if (noteCard) {
                        document.querySelectorAll('.note-card').forEach(c => c.classList.remove('active'));
                        noteCard.classList.add('active');
                        activeNoteId = noteId;

                        noteCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        requestAnimationFrame(() => updateConnectorLines());
                    }
                }
            }
        });

        // 替换文本弹窗
        document.getElementById('replacement-form')?.addEventListener('submit', applyReplacement);
        document.getElementById('replacement-reset-btn')?.addEventListener('click', resetReplacement);
        document.getElementById('replacement-modal-cancel')?.addEventListener('click', () => {
            closeModal(document.getElementById('replacement-modal'));
        });
        document.getElementById('add-replacement-col-btn')?.addEventListener('click', addColumn);
        document.getElementById('delete-current-col-btn')?.addEventListener('click', deleteCurrentColumn); // 确保有这行

        // 保存方案弹窗
        document.getElementById('save-set-form')?.addEventListener('submit', saveReplacementSet);
        document.getElementById('save-set-modal-cancel')?.addEventListener('click', () => {
            closeModal(document.getElementById('save-set-modal'));
        });

        document.getElementById('delete-current-col-btn')?.addEventListener('click', deleteCurrentColumn);
    }

    initMarkShortcuts();

    // ========== 保存替换方案 ==========
    function saveReplacementSet(e) {
        e.preventDefault();

        if (currentReplacementDialogueIndex < 0) return;

        const dialogue = dialogues[currentReplacementDialogueIndex];
        if (!dialogue || !dialogue.replacements) return;

        const setName = document.getElementById('set-name')?.value.trim();
        if (!setName) {
            Utils.showMessage('请输入方案名称', 'error');
            return;
        }

        // 保存当前替换方案到对话的 savedSets 数组中
        if (!dialogue.savedSets) {
            dialogue.savedSets = [];
        }

        // 检查方案名称是否重复
        if (dialogue.savedSets.find(s => s.name === setName)) {
            Utils.showMessage('方案名称已存在', 'error');
            return;
        }

        // 保存当前的替换配置
        const setData = {
            id: Utils.generateId(),
            name: setName,
            createdAt: new Date().toISOString(),
            columnIndex: currentSelectedColumn,
            replacements: dialogue.replacements.map(rep => ({
                id: rep.id,
                original: rep.original,
                current: rep.current,
                alternatives: [...rep.alternatives]
            }))
        };

        dialogue.savedSets.push(setData);

        closeModal(document.getElementById('save-set-modal'));
        Utils.showMessage('替换方案已保存', 'success');
        markChanged();

        // 清空输入框
        const input = document.getElementById('set-name');
        if (input) input.value = '';
    }

    function handleCancel() {
        if (hasChanges) {
            pendingNavigation = currentCourse ? `course-detail.html?id=${currentCourse.id}` : 'textbooks.html';
            openModal(document.getElementById('confirm-leave-modal'));
        } else {
            if (currentCourse) {
                window.location.href = `course-detail.html?id=${currentCourse.id}`;
            } else {
                window.history.back();
            }
        }
    }

    // ========== 工具函数 ==========
    function openModal(modal) {
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(modal) {
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========== 替换文本功能 ==========
    let currentSelectedColumn = 0; // 当前选中的列（0 = 原文）

    function openReplacementModal(dialogueIndex) {
        const dialogue = dialogues[dialogueIndex];
        if (!dialogue || !dialogue.replacements || dialogue.replacements.length === 0) {
            Utils.showMessage('该对话没有可替换文本', 'error');
            return;
        }

        currentReplacementDialogueIndex = dialogueIndex;

        // 初始化替换数据结构
        initReplacementData(dialogue);

        // 确定当前选中的列
        currentSelectedColumn = dialogue.currentColumn !== undefined ? dialogue.currentColumn : 0;

        renderReplacementTable(dialogue);
        updatePreview(dialogue);
        updateDeleteButtonVisibility(dialogue); // 添加这行

        openModal(document.getElementById('replacement-modal'));
    }

    function initReplacementData(dialogue) {
        // 确保每个 replacement 都有 alternatives 数组
        dialogue.replacements.forEach(rep => {
            if (!rep.alternatives) {
                rep.alternatives = []; // alternatives 不包含原文，原文单独存储在 original 中
            }
        });

        // 确保所有 replacement 的 alternatives 长度一致
        const maxCols = Math.max(...dialogue.replacements.map(r => r.alternatives.length), 0);
        dialogue.replacements.forEach(rep => {
            while (rep.alternatives.length < maxCols) {
                rep.alternatives.push('');
            }
        });
    }

    function renderReplacementTable(dialogue) {
        const headerRow = document.getElementById('replacement-header-row');
        const tbody = document.getElementById('replacement-tbody');
        if (!headerRow || !tbody) return;

        const altColCount = dialogue.replacements[0]?.alternatives.length || 0;

        // 渲染表头
        let headerHtml = `
            <th class="col-mark">标记</th>
            <th class="col-original col-selectable ${currentSelectedColumn === 0 ? 'selected' : ''}" data-col="0">
                <div class="col-header">
                    <span class="col-title">原文</span>
                    ${currentSelectedColumn === 0 ? '<span class="col-selected-icon">✓</span>' : ''}
                </div>
            </th>
        `;

        for (let i = 0; i < altColCount; i++) {
            const isSelected = currentSelectedColumn === i + 1;
            headerHtml += `
                <th class="col-replacement col-selectable ${isSelected ? 'selected' : ''}" data-col="${i + 1}">
                    <div class="col-header">
                        <span class="col-title">备选 ${i + 1}</span>
                        ${isSelected ? '<span class="col-selected-icon">✓</span>' : ''}
                        <button type="button" class="btn-icon delete-col-btn" data-col="${i}" title="删除此列">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </th>
            `;
        }

        headerRow.innerHTML = headerHtml;

        // 渲染表格内容
        tbody.innerHTML = dialogue.replacements.map((rep, rowIndex) => {
            const isOriginalSelected = currentSelectedColumn === 0;
            let rowHtml = `
                <tr data-row="${rowIndex}">
                    <td class="col-mark"><span class="mark-id">${rep.id}</span></td>
                    <td class="col-original col-selectable-cell ${isOriginalSelected ? 'active' : ''}" data-col="0">
                        <span class="original-text-display">${escapeHtml(rep.original)}</span>
                    </td>
            `;

            for (let colIndex = 0; colIndex < altColCount; colIndex++) {
                const value = rep.alternatives[colIndex] || '';
                const isActive = currentSelectedColumn === colIndex + 1;
                rowHtml += `
                    <td class="replacement-cell ${isActive ? 'active' : ''}">
                        <input type="text" 
                               class="replacement-input" 
                               data-row="${rowIndex}" 
                               data-col="${colIndex}"
                               value="${escapeHtml(value)}" 
                               placeholder="输入备选文本">
                    </td>
                `;
            }

            rowHtml += '</tr>';
            return rowHtml;
        }).join('');

        // 绑定事件
        bindReplacementTableEvents(dialogue);
    }

    function bindReplacementTableEvents(dialogue) {
        const tbody = document.getElementById('replacement-tbody');
        const headerRow = document.getElementById('replacement-header-row');

        // 表头列点击选中
        headerRow.querySelectorAll('.col-selectable').forEach(th => {
            th.addEventListener('click', (e) => {
                if (e.target.closest('.delete-col-btn')) return;
                const col = parseInt(th.dataset.col);
                selectColumn(col, dialogue);
            });
        });

        // 原文列单元格点击选中
        tbody.querySelectorAll('.col-selectable-cell').forEach(td => {
            td.addEventListener('click', () => {
                selectColumn(0, dialogue);
            });
        });

        // 输入框事件
        tbody.querySelectorAll('.replacement-input').forEach(input => {
            // 聚焦时选中整列（而不是点击时）
            input.addEventListener('focus', (e) => {
                const col = parseInt(input.dataset.col) + 1;
                if (currentSelectedColumn !== col) {
                    selectColumn(col, dialogue);
                }
            });

            // 输入时更新数据
            input.addEventListener('input', (e) => {
                const row = parseInt(input.dataset.row);
                const col = parseInt(input.dataset.col);
                dialogue.replacements[row].alternatives[col] = input.value;
                updatePreview(dialogue);
                markChanged();
            });

            // 回车切换到下一行
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const row = parseInt(input.dataset.row);
                    const col = parseInt(input.dataset.col);
                    const nextInput = tbody.querySelector(`input[data-row="${row + 1}"][data-col="${col}"]`);
                    if (nextInput) {
                        nextInput.focus();
                    }
                }
            });
        });

        // 删除列按钮
        headerRow.querySelectorAll('.delete-col-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const col = parseInt(btn.dataset.col);
                deleteColumn(col, dialogue);
            });
        });
    }

    function selectColumn(colIndex, dialogue) {
        currentSelectedColumn = colIndex;
        dialogue.currentColumn = colIndex;

        // 更新列索引显示
        const colIndexEl = document.getElementById('current-col-index');
        if (colIndexEl) {
            colIndexEl.textContent = colIndex === 0 ? '原文' : `备选 ${colIndex}`;
        }

        // 只更新样式，不重新渲染整个表格
        updateColumnStyles();
        updatePreview(dialogue);
        updateDeleteButtonVisibility(dialogue); // 添加这行
    }

    function updateColumnStyles() {
        const headerRow = document.getElementById('replacement-header-row');
        const tbody = document.getElementById('replacement-tbody');

        if (!headerRow || !tbody) return;

        // 更新表头选中状态
        headerRow.querySelectorAll('.col-selectable').forEach(th => {
            const col = parseInt(th.dataset.col);
            const isSelected = col === currentSelectedColumn;
            th.classList.toggle('selected', isSelected);

            // 更新选中图标
            const icon = th.querySelector('.col-selected-icon');
            if (isSelected && !icon) {
                const titleSpan = th.querySelector('.col-title');
                if (titleSpan) {
                    titleSpan.insertAdjacentHTML('afterend', '<span class="col-selected-icon">✓</span>');
                }
            } else if (!isSelected && icon) {
                icon.remove();
            }
        });

        // 更新原文列单元格状态
        tbody.querySelectorAll('.col-selectable-cell').forEach(td => {
            td.classList.toggle('active', currentSelectedColumn === 0);
        });

        // 更新备选列单元格状态
        tbody.querySelectorAll('.replacement-cell').forEach(td => {
            const input = td.querySelector('.replacement-input');
            if (input) {
                const col = parseInt(input.dataset.col) + 1;
                td.classList.toggle('active', col === currentSelectedColumn);
            }
        });
    }

    function addColumn() {
        if (currentReplacementDialogueIndex < 0) return;

        const dialogue = dialogues[currentReplacementDialogueIndex];
        if (!dialogue || !dialogue.replacements) return;

        // 为每个 replacement 添加新列
        dialogue.replacements.forEach(rep => {
            rep.alternatives.push('');
        });

        // 选中新列
        const newColIndex = dialogue.replacements[0].alternatives.length;
        currentSelectedColumn = newColIndex;
        dialogue.currentColumn = newColIndex;

        renderReplacementTable(dialogue);
        updatePreview(dialogue);
        markChanged();

        // 聚焦到新列的第一个输入框
        setTimeout(() => {
            const firstInput = document.querySelector(`#replacement-tbody input[data-col="${newColIndex - 1}"]`);
            if (firstInput) firstInput.focus();
        }, 50);
    }

    function deleteCurrentColumn() {
        if (currentReplacementDialogueIndex < 0) return;

        const dialogue = dialogues[currentReplacementDialogueIndex];
        if (!dialogue || !dialogue.replacements) return;

        // 不能删除原文列
        if (currentSelectedColumn === 0) {
            Utils.showMessage('原文列不能删除', 'error');
            return;
        }

        const altIndex = currentSelectedColumn - 1;
        deleteColumn(altIndex, dialogue);
        updateDeleteButtonVisibility(dialogue);
    }

    function updateDeleteButtonVisibility(dialogue) {
        const deleteBtn = document.getElementById('delete-current-col-btn');
        if (!deleteBtn) return;

        // 只有选中备选列时才显示删除按钮
        const showDelete = currentSelectedColumn > 0 && dialogue.replacements[0]?.alternatives?.length > 0;
        deleteBtn.style.display = showDelete ? 'inline-flex' : 'none';
    }

    function deleteColumn(colIndex, dialogue) {
        if (!dialogue || !dialogue.replacements) return;

        if (!confirm(`确定删除备选 ${colIndex + 1} 吗？`)) return;

        // 删除该列
        dialogue.replacements.forEach(rep => {
            rep.alternatives.splice(colIndex, 1);
        });

        // 调整当前选中列
        const deletedDisplayCol = colIndex + 1;
        if (currentSelectedColumn === deletedDisplayCol) {
            currentSelectedColumn = 0;
        } else if (currentSelectedColumn > deletedDisplayCol) {
            currentSelectedColumn--;
        }
        dialogue.currentColumn = currentSelectedColumn;

        renderReplacementTable(dialogue);
        updatePreview(dialogue);
        updateDeleteButtonVisibility(dialogue); // 添加这行
        markChanged();
    }

    function updatePreview(dialogue) {
        const previewEl = document.getElementById('preview-content');
        const colIndexEl = document.getElementById('current-col-index');

        if (!previewEl || !dialogue) return;

        if (colIndexEl) {
            colIndexEl.textContent = currentSelectedColumn === 0 ? '原文' : `备选 ${currentSelectedColumn}`;
        }

        // 重建预览内容
        let previewHtml = dialogue.rawContent;

        dialogue.replacements.forEach(rep => {
            const regex = new RegExp(`\\[${rep.id}\\](.*?)\\[[\\\\/]${rep.id}\\]`, 'g');
            let displayValue;

            if (currentSelectedColumn === 0) {
                displayValue = rep.original;
            } else {
                const altIndex = currentSelectedColumn - 1;
                displayValue = rep.alternatives[altIndex] || rep.original;
            }

            previewHtml = previewHtml.replace(regex, `<span class="preview-replacement">${escapeHtml(displayValue)}</span>`);
        });

        previewEl.innerHTML = previewHtml;
    }

    function applyReplacement(e) {
        e.preventDefault();

        if (currentReplacementDialogueIndex < 0) return;

        const dialogue = dialogues[currentReplacementDialogueIndex];
        if (!dialogue || !dialogue.replacements) return;

        // 应用当前选中列的值
        dialogue.replacements.forEach(rep => {
            if (currentSelectedColumn === 0) {
                rep.current = rep.original;
            } else {
                const altIndex = currentSelectedColumn - 1;
                const value = rep.alternatives[altIndex];
                rep.current = (value && value.trim()) ? value : rep.original;
            }
        });

        dialogue.currentColumn = currentSelectedColumn;

        // 重建显示内容
        rebuildDialogueContent(currentReplacementDialogueIndex);

        closeModal(document.getElementById('replacement-modal'));
        renderDialogues();
        markChanged();
        Utils.showMessage('替换成功', 'success');
    }

    function resetReplacement() {
        if (currentReplacementDialogueIndex < 0) return;

        const dialogue = dialogues[currentReplacementDialogueIndex];
        if (!dialogue || !dialogue.replacements) return;

        // 选中原文列
        currentSelectedColumn = 0;
        dialogue.currentColumn = 0;

        // 更新 current 为原文
        dialogue.replacements.forEach(rep => {
            rep.current = rep.original;
        });

        renderReplacementTable(dialogue);
        updatePreview(dialogue);
        Utils.showMessage('已选中原文', 'success');
    }

    function rebuildDialogueContent(dialogueIndex) {
        const dialogue = dialogues[dialogueIndex];
        if (!dialogue || !dialogue.rawContent || !dialogue.replacements) return;

        // 从原始内容重建，替换标记为当前值
        let newContent = dialogue.rawContent;
        dialogue.replacements.forEach(rep => {
            const regex = new RegExp(`\\[${rep.id}\\].*?\\[[\\\\/]${rep.id}\\]`, 'g');
            newContent = newContent.replace(regex, rep.current);
        });

        dialogue.content = newContent;
    }

    // ========== 替换标记快捷输入 ==========
    let markCounter = 0;

    function initMarkShortcuts() {
        const input = document.getElementById('dialogue-input');
        const markBtn = document.getElementById('mark-replaceable-btn');

        if (!input) return;

        // 监听选中状态，更新按钮样式
        input.addEventListener('select', updateMarkButtonState);
        input.addEventListener('mouseup', updateMarkButtonState);
        input.addEventListener('keyup', updateMarkButtonState);

        // 快捷键: Ctrl + 1~9
        input.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
                e.preventDefault();
                const markId = parseInt(e.key);
                wrapSelectionWithMark(markId);
            }

            // Ctrl+M 自动使用下一个编号
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
                e.preventDefault();
                autoMarkSelection();
            }
        });

        // 按钮点击
        markBtn?.addEventListener('click', autoMarkSelection);

        // 输入内容变化时更新计数
        input.addEventListener('input', updateMarkCount);
    }

    function updateMarkButtonState() {
        const input = document.getElementById('dialogue-input');
        const markBtn = document.getElementById('mark-replaceable-btn');

        if (!input || !markBtn) return;

        const hasSelection = input.selectionStart !== input.selectionEnd;
        markBtn.classList.toggle('has-selection', hasSelection);
    }

    function wrapSelectionWithMark(markId) {
        const input = document.getElementById('dialogue-input');
        if (!input) return;

        const start = input.selectionStart;
        const end = input.selectionEnd;

        if (start === end) {
            Utils.showMessage('请先选中要标记的文本', 'error');
            return;
        }

        const text = input.value;
        const selectedText = text.substring(start, end);

        // 检查是否已有相同编号的标记
        const existingMark = new RegExp(`\\[${markId}\\].*?\\[[\\\\/]${markId}\\]`);
        if (existingMark.test(text)) {
            Utils.showMessage(`标记 ${markId} 已存在，请使用其他编号`, 'error');
            return;
        }

        const wrappedText = `[${markId}]${selectedText}[/${markId}]`;

        input.value = text.substring(0, start) + wrappedText + text.substring(end);

        // 恢复光标位置
        const newCursorPos = start + wrappedText.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
        input.focus();

        updateMarkCount();
        Utils.showMessage(`已添加替换标记 ${markId}`, 'success');
    }

    function autoMarkSelection() {
        const input = document.getElementById('dialogue-input');
        if (!input) return;

        const start = input.selectionStart;
        const end = input.selectionEnd;

        if (start === end) {
            Utils.showMessage('请先选中要标记的文本', 'error');
            return;
        }

        // 找到下一个可用的标记编号
        const text = input.value;
        let nextId = 1;

        for (let i = 1; i <= 9; i++) {
            const regex = new RegExp(`\\[${i}\\].*?\\[[\\\\/]${i}\\]`);
            if (!regex.test(text)) {
                nextId = i;
                break;
            }
        }

        if (nextId > 9) {
            Utils.showMessage('最多支持 9 个替换标记', 'error');
            return;
        }

        wrapSelectionWithMark(nextId);
    }

    function updateMarkCount() {
        const input = document.getElementById('dialogue-input');
        const hint = document.getElementById('dialogue-input-hint');
        const countEl = document.getElementById('current-mark-count');

        if (!input || !hint || !countEl) return;

        const text = input.value;
        const marks = text.match(/\[\d+\].*?\[[\\/]\d+\]/g) || [];

        if (marks.length > 0) {
            hint.style.display = 'block';
            countEl.textContent = marks.length;
        } else {
            hint.style.display = 'none';
        }
    }

})();