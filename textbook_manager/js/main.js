/* ========================================
   外语教材学习系统 - 全局脚本
   localStorage 数据管理 | 导航控制 | 工具函数
   ======================================== */

'use strict';

/* ========== 数据存储模块 ========== */
const Storage = {
    PREFIX: 'textbook_system_',

    /**
     * 保存数据到 localStorage
     * @param {string} key - 存储键名
     * @param {any} data - 要存储的数据
     * @returns {boolean} 是否保存成功
     */
    save(key, data) {
        try {
            const fullKey = this.PREFIX + key;
            const jsonData = JSON.stringify(data);
            localStorage.setItem(fullKey, jsonData);
            return true;
        } catch (error) {
            console.error('Storage save error:', error);
            return false;
        }
    },

    /**
     * 从 localStorage 读取数据
     * @param {string} key - 存储键名
     * @param {any} defaultValue - 默认值
     * @returns {any} 存储的数据或默认值
     */
    load(key, defaultValue = null) {
        try {
            const fullKey = this.PREFIX + key;
            const jsonData = localStorage.getItem(fullKey);
            return jsonData ? JSON.parse(jsonData) : defaultValue;
        } catch (error) {
            console.error('Storage load error:', error);
            return defaultValue;
        }
    },

    /**
     * 删除指定键的数据
     * @param {string} key - 存储键名
     */
    remove(key) {
        const fullKey = this.PREFIX + key;
        localStorage.removeItem(fullKey);
    },

    /**
     * 清除所有系统数据
     */
    clear() {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(this.PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    },

    /**
     * 获取存储使用情况
     * @returns {object} 存储信息
     */
    getInfo() {
        let totalSize = 0;
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(this.PREFIX)) {
                totalSize += localStorage.getItem(key).length;
            }
        });
        return {
            count: keys.filter(k => k.startsWith(this.PREFIX)).length,
            size: totalSize,
            sizeFormatted: (totalSize / 1024).toFixed(2) + ' KB'
        };
    }
};

/* ========== 导航控制模块 ========== */
const Navigation = {
    /**
     * 初始化导航功能
     */
    init() {
        this.setupMobileMenu();
        this.highlightCurrentPage();
    },

    /**
     * 设置移动端菜单切换
     */
    setupMobileMenu() {
        const toggle = document.querySelector('.navbar-toggle');
        const menu = document.querySelector('.navbar-menu');

        if (toggle && menu) {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('active');
                menu.classList.toggle('active');
            });

            // 点击菜单链接后关闭菜单
            const links = menu.querySelectorAll('.navbar-link');
            links.forEach(link => {
                link.addEventListener('click', () => {
                    toggle.classList.remove('active');
                    menu.classList.remove('active');
                });
            });

            // 点击页面其他区域关闭菜单
            document.addEventListener('click', (e) => {
                if (!toggle.contains(e.target) && !menu.contains(e.target)) {
                    toggle.classList.remove('active');
                    menu.classList.remove('active');
                }
            });
        }
    },

    /**
     * 高亮当前页面的导航链接
     */
    highlightCurrentPage() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const links = document.querySelectorAll('.navbar-link');

        links.forEach(link => {
            const href = link.getAttribute('href');
            // 处理教材相关页面都高亮教材链接
            if (href === 'textbooks.html' &&
                (currentPage === 'textbooks.html' ||
                 currentPage === 'textbook-detail.html' ||
                 currentPage === 'course-detail.html' ||
                 currentPage === 'lesson-edit.html')) {
                link.classList.add('active');
            } else if (href === currentPage) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
};

/* ========== 工具函数模块 ========== */
const Utils = {
    /**
     * 生成唯一 ID
     * @returns {string} 唯一标识符
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    /**
     * 格式化日期
     * @param {Date|string|number} date - 日期对象或时间戳
     * @returns {string} 格式化后的日期字符串
     */
    formatDate(date) {
        const d = new Date(date);
        const now = new Date();
        const diff = now - d;

        // 小于 1 分钟
        if (diff < 60 * 1000) {
            return '刚刚';
        }

        // 小于 1 小时
        if (diff < 60 * 60 * 1000) {
            return Math.floor(diff / (60 * 1000)) + ' 分钟前';
        }

        // 小于 24 小时
        if (diff < 24 * 60 * 60 * 1000) {
            return Math.floor(diff / (60 * 60 * 1000)) + ' 小时前';
        }

        // 小于 7 天
        if (diff < 7 * 24 * 60 * 60 * 1000) {
            return Math.floor(diff / (24 * 60 * 60 * 1000)) + ' 天前';
        }

        // 其他情况显示完整日期
        return d.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    },

    /**
     * 格式化完整日期时间
     * @param {Date|string|number} date - 日期对象或时间戳
     * @returns {string} 格式化后的日期时间字符串
     */
    formatDateTime(date) {
        const d = new Date(date);
        return d.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * 防抖函数
     * @param {Function} func - 要执行的函数
     * @param {number} wait - 等待时间（毫秒）
     * @returns {Function} 防抖后的函数
     */
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * 节流函数
     * @param {Function} func - 要执行的函数
     * @param {number} limit - 时间限制（毫秒）
     * @returns {Function} 节流后的函数
     */
    throttle(func, limit = 300) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * 显示提示消息
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型 (success/error/info/warning)
     */
    showMessage(message, type = 'info') {
        // 移除已有的消息
        const existingMsg = document.querySelector('.toast-message');
        if (existingMsg) {
            existingMsg.remove();
        }

        // 类型对应的颜色
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        // 类型对应的图标
        const icons = {
            success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };

        // 创建消息元素
        const toast = document.createElement('div');
        toast.className = `toast-message toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-text">${message}</span>
        `;
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 24px;
            background-color: ${colors[type] || colors.info};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            font-weight: 500;
            animation: toastSlideUp 0.3s ease;
        `;

        document.body.appendChild(toast);

        // 3秒后自动消失
        setTimeout(() => {
            toast.style.animation = 'toastSlideDown 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /**
     * 复制文本到剪贴板
     * @param {string} text - 要复制的文本
     * @returns {Promise<boolean>} 是否复制成功
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            // 降级方案
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch (e) {
                document.body.removeChild(textarea);
                return false;
            }
        }
    },

    /**
     * 截断文本
     * @param {string} text - 原始文本
     * @param {number} maxLength - 最大长度
     * @returns {string} 截断后的文本
     */
    truncate(text, maxLength = 100) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
};

/* ========== 数据初始化模块 ========== */
const DataManager = {
    /**
     * 初始化默认数据结构
     */
    initDefaultData() {
        const keys = ['textbooks', 'courses', 'lessons', 'notes', 'vocabulary'];
        keys.forEach(key => {
            if (!Storage.load(key)) {
                Storage.save(key, []);
            }
        });
    }
};

/* ========== CSS 动画样式注入 ========== */
(function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes toastSlideUp {
            from {
                opacity: 0;
                transform: translateX(-50%) translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        }
        
        @keyframes toastSlideDown {
            from {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            to {
                opacity: 0;
                transform: translateX(-50%) translateY(20px);
            }
        }
        
        .toast-icon {
            display: flex;
            align-items: center;
            justify-content: center;
        }
    `;
    document.head.appendChild(style);
})();

/* ========== 页面加载完成后初始化 ========== */
document.addEventListener('DOMContentLoaded', () => {
    // 初始化导航
    Navigation.init();

    // 初始化数据结构
    DataManager.initDefaultData();

    console.log('📚 外语教材学习系统已加载');
    console.log('📦 存储信息:', Storage.getInfo());
});

/* ========== 导出模块 ========== */
window.TextbookSystem = {
    Storage,
    Navigation,
    Utils,
    DataManager
};