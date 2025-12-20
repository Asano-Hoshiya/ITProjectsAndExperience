/**
 * index.js - 首页统计修复版本
 * 确保笔记数量正确显示
 */
document.addEventListener('DOMContentLoaded', () => {
    const { Storage, Utils } = window.TextbookSystem;

    // 加载统计数据
    function loadStats() {
        const textbooks = Storage.load('textbooks', []);
        const courses = Storage.load('courses', []);
        const lessons = Storage.load('lessons', []);
        const notes = Storage.load('notes', []);
        const vocabulary = Storage.load('vocabulary', []);

        // 笔记数量直接从全局 notes 读取
        document.getElementById('stat-textbooks').textContent = textbooks.length;
        document.getElementById('stat-courses').textContent = courses.length;
        document.getElementById('stat-lessons').textContent = lessons.length;
        document.getElementById('stat-notes').textContent = notes.length;
        document.getElementById('stat-vocabulary').textContent = vocabulary.length;
    }

    // 加载最近内容
    function loadRecentContent() {
        const textbooks = Storage.load('textbooks', []);
        const courses = Storage.load('courses', []);
        const lessons = Storage.load('lessons', []);
        const notes = Storage.load('notes', []);

        // 合并所有内容并按时间排序
        const allItems = [];

        textbooks.forEach(t => {
            allItems.push({
                type: 'textbook',
                title: t.name,
                time: t.updatedAt || t.createdAt,
                url: `textbook-detail.html?id=${t.id}`
            });
        });

        lessons.forEach(l => {
            const course = courses.find(c => c.id === l.courseId);
            allItems.push({
                type: 'lesson',
                title: l.title,
                subtitle: course ? course.name : '',
                time: l.updatedAt || l.createdAt,
                url: `lesson-edit.html?id=${l.id}`
            });
        });

        // 笔记也添加到最近内容
        notes.forEach(n => {
            const lesson = lessons.find(l => l.id === n.lessonId);
            allItems.push({
                type: 'note',
                title: n.title,
                subtitle: lesson ? `来自: ${lesson.title}` : '',
                time: n.updatedAt || n.createdAt,
                url: `notes.html`
            });
        });

        // 按时间倒序排列，取前 5 条
        allItems.sort((a, b) => {
            const timeA = typeof a.time === 'string' ? new Date(a.time).getTime() : a.time;
            const timeB = typeof b.time === 'string' ? new Date(b.time).getTime() : b.time;
            return timeB - timeA;
        });
        const recentItems = allItems.slice(0, 5);

        const listContainer = document.getElementById('recent-list');
        const emptyState = document.getElementById('recent-empty');

        if (recentItems.length === 0) {
            listContainer.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        listContainer.style.display = 'block';
        emptyState.style.display = 'none';

        const typeLabels = {
            textbook: { label: '教材', class: 'tag-primary' },
            lesson: { label: '课文', class: 'tag-success' },
            note: { label: '笔记', class: 'tag-warning' }
        };

        listContainer.innerHTML = recentItems.map(item => {
            const typeInfo = typeLabels[item.type];
            return `
                <a href="${item.url}" class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">${escapeHtml(item.title)}</div>
                        ${item.subtitle ? `<div class="list-item-subtitle">${escapeHtml(item.subtitle)}</div>` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="tag ${typeInfo.class}">${typeInfo.label}</span>
                        <span style="font-size: 0.75rem; color: var(--text-light);">
                            ${Utils.formatDate(item.time)}
                        </span>
                    </div>
                </a>
            `;
        }).join('');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 导出数据
    document.getElementById('export-data-btn').addEventListener('click', () => {
        const data = {
            textbooks: Storage.load('textbooks', []),
            courses: Storage.load('courses', []),
            lessons: Storage.load('lessons', []),
            notes: Storage.load('notes', []),
            vocabulary: Storage.load('vocabulary', []),
            exportTime: new Date().toISOString(),
            version: '2.0' // 标记数据版本
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `textbook-system-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        Utils.showMessage('数据导出成功', 'success');
    });

    // 清除数据
    document.getElementById('clear-data-btn').addEventListener('click', () => {
        if (confirm('确定要清除所有数据吗？此操作不可恢复！\n\n建议先导出数据备份。')) {
            if (confirm('再次确认：这将删除所有教材、课程、课文、笔记和生词数据！')) {
                Storage.clear();
                Utils.showMessage('所有数据已清除', 'success');
                setTimeout(() => location.reload(), 1000);
            }
        }
    });

    // 初始化
    loadStats();
    loadRecentContent();
});