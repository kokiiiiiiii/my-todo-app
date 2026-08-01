function todoApp() {
    return {
        // Core States
        tasks: [],
        routines: [],
        selectedDate: '',
        todayStr: '',

        // Form States
        newTaskTitle: '',
        newTaskImage: null,
        newRoutineTitle: '',
        newRoutineImage: null,

        // Modal & Navigation States
        activeModal: null, // 'routines' | 'monthly' | null
        summaryYearMonth: '', // YYYY-MM
        lightboxImage: null,

        initApp() {
            const today = new Date();
            this.todayStr = this.formatDate(today);
            this.selectedDate = this.todayStr;
            this.summaryYearMonth = this.todayStr.substring(0, 7);

            this.loadData();

            // Re-render Lucide icons on Alpine changes
            this.$watch('activeModal', () => this.refreshIcons());
            this.$watch('selectedDate', () => this.refreshIcons());
            this.$watch('tasks', () => this.refreshIcons());
            this.$watch('routines', () => this.refreshIcons());

            setTimeout(() => this.refreshIcons(), 50);
        },

        refreshIcons() {
            setTimeout(() => {
                if (window.lucide) {
                    window.lucide.createIcons();
                }
            }, 20);
        },

        // Helper: Date string YYYY-MM-DD
        formatDate(dateObj) {
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        },

        // Storage Handlers
        loadData() {
            try {
                const savedTasks = localStorage.getItem('taskloom_tasks');
                if (savedTasks) this.tasks = JSON.parse(savedTasks);

                const savedRoutines = localStorage.getItem('taskloom_routines');
                if (savedRoutines) {
                    this.routines = JSON.parse(savedRoutines);
                } else {
                    // Default Routines for new users
                    this.routines = [
                        { id: 'r1', title: '朝の水を飲む', image: null },
                        { id: 'r2', title: 'メールチェック', image: null },
                        { id: 'r3', title: '部屋の換気・整理', image: null }
                    ];
                    this.saveRoutines();
                }
            } catch (e) {
                console.error('Failed to load data:', e);
            }
        },

        saveTasks() {
            localStorage.setItem('taskloom_tasks', JSON.stringify(this.tasks));
        },

        saveRoutines() {
            localStorage.setItem('taskloom_routines', JSON.stringify(this.routines));
        },

        // Date Navigation
        setToday() {
            this.selectedDate = this.todayStr;
        },

        changeDate(offsetDays) {
            const current = new Date(this.selectedDate + 'T00:00:00');
            current.setDate(current.getDate() + offsetDays);
            this.selectedDate = this.formatDate(current);
        },

        onDateChange() {
            this.refreshIcons();
        },

        get formattedDateDisplay() {
            if (!this.selectedDate) return '';
            const parts = this.selectedDate.split('-');
            const dateObj = new Date(this.selectedDate + 'T00:00:00');
            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];
            return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日 (${dayOfWeek})`;
        },

        // Computed Task Lists for current selectedDate
        get currentDayTasks() {
            return this.tasks.filter(t => t.date === this.selectedDate);
        },

        get activeTasks() {
            return this.currentDayTasks.filter(t => !t.completed);
        },

        get completedTasks() {
            return this.currentDayTasks.filter(t => t.completed);
        },

        get dailyCompletionPercent() {
            const total = this.currentDayTasks.length;
            if (total === 0) return 0;
            const comp = this.completedTasks.length;
            return Math.round((comp / total) * 100);
        },

        // Add Task Actions
        addTask() {
            if (!this.newTaskTitle.trim() && !this.newTaskImage) return;

            const newTask = {
                id: 't_' + Date.now(),
                date: this.selectedDate,
                title: this.newTaskTitle.trim() || '画像タスク',
                completed: false,
                image: this.newTaskImage,
                createdAt: new Date().toISOString()
            };

            this.tasks.unshift(newTask);
            this.saveTasks();

            // Reset form
            this.newTaskTitle = '';
            this.newTaskImage = null;
        },

        toggleTask(taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                task.completed = !task.completed;
                this.saveTasks();
            }
        },

        deleteTask(taskId) {
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            this.saveTasks();
        },

        clearCompletedForDay() {
            this.tasks = this.tasks.filter(t => !(t.date === this.selectedDate && t.completed));
            this.saveTasks();
        },

        // Routine Actions
        addFromRoutine(routine) {
            const newTask = {
                id: 't_' + Date.now() + Math.random().toString(36).substr(2, 4),
                date: this.selectedDate,
                title: routine.title,
                completed: false,
                image: routine.image || null,
                createdAt: new Date().toISOString()
            };
            this.tasks.unshift(newTask);
            this.saveTasks();
        },

        addRoutine() {
            if (!this.newRoutineTitle.trim()) return;

            const routine = {
                id: 'r_' + Date.now(),
                title: this.newRoutineTitle.trim(),
                image: this.newRoutineImage
            };

            this.routines.push(routine);
            this.saveRoutines();

            this.newRoutineTitle = '';
            this.newRoutineImage = null;
        },

        deleteRoutine(routineId) {
            this.routines = this.routines.filter(r => r.id !== routineId);
            this.saveRoutines();
        },

        // Image Selection Handler (Base64)
        handleImageSelect(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                this.newTaskImage = e.target.result;
            };
            reader.readAsDataURL(file);
        },

        handleRoutineImageSelect(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                this.newRoutineImage = e.target.result;
            };
            reader.readAsDataURL(file);
        },

        openLightbox(imgSrc) {
            this.lightboxImage = imgSrc;
        },

        // Monthly Summary Actions
        openMonthlySummary() {
            this.summaryYearMonth = this.selectedDate.substring(0, 7);
            this.activeModal = 'monthly';
        },

        changeSummaryMonth(offset) {
            const [y, m] = this.summaryYearMonth.split('-').map(Number);
            const dt = new Date(y, m - 1 + offset, 1);
            const newY = dt.getFullYear();
            const newM = String(dt.getMonth() + 1).padStart(2, '0');
            this.summaryYearMonth = `${newY}-${newM}`;
            this.refreshIcons();
        },

        get summaryMonthDisplay() {
            if (!this.summaryYearMonth) return '';
            const [y, m] = this.summaryYearMonth.split('-');
            return `${y}年 ${parseInt(m)}月`;
        },

        get monthlyStats() {
            const monthTasks = this.tasks.filter(t => t.date.startsWith(this.summaryYearMonth));
            const total = monthTasks.length;
            const completed = monthTasks.filter(t => t.completed).length;
            const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
            return { total, completed, rate };
        },

        get calendarPaddingDays() {
            if (!this.summaryYearMonth) return 0;
            const [y, m] = this.summaryYearMonth.split('-').map(Number);
            const firstDayOfWeek = new Date(y, m - 1, 1).getDay(); // 0 = Sun
            return firstDayOfWeek;
        },

        get calendarDays() {
            if (!this.summaryYearMonth) return [];
            const [y, m] = this.summaryYearMonth.split('-').map(Number);
            const daysInMonth = new Date(y, m, 0).getDate();

            const dayList = [];
            for (let d = 1; d <= daysInMonth; d++) {
                const dayStr = String(d).padStart(2, '0');
                const dateStr = `${this.summaryYearMonth}-${dayStr}`;
                const dayTasks = this.tasks.filter(t => t.date === dateStr);
                const total = dayTasks.length;
                const completed = dayTasks.filter(t => t.completed).length;
                const hasImage = dayTasks.some(t => t.image);

                dayList.push({
                    dayNum: d,
                    dateStr: dateStr,
                    total: total,
                    completed: completed,
                    hasImage: hasImage,
                    isToday: dateStr === this.todayStr
                });
            }
            return dayList;
        },

        selectDateFromCalendar(dateStr) {
            this.selectedDate = dateStr;
            this.activeModal = null;
        }
    };
}

// PWA: register the service worker for offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.error('Service worker registration failed:', err);
        });
    });
}
