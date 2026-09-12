function todoApp() {
    return {
        // Core States
        tasks: [],
        routines: [],
        selectedDate: '',
        todayStr: '',

        // Form States
        newTaskTitle: '',
        newRoutineTitle: '',

        // Edit States
        editingTaskId: null,
        editingTaskTitle: '',
        editingRoutineId: null,
        editingRoutineTitle: '',

        // Modal & Navigation States
        activeModal: null, // 'routines' | 'monthly' | 'account' | null
        summaryYearMonth: '', // YYYY-MM

        // Cloud Sync States
        user: null,
        authChecked: false,
        authError: '',

        initApp() {
            const today = new Date();
            this.todayStr = this.formatDate(today);
            this.selectedDate = this.todayStr;
            this.summaryYearMonth = this.todayStr.substring(0, 7);

            this.loadData();
            this.initFirebaseAuth();

            // Re-render Lucide icons on Alpine changes
            this.$watch('activeModal', () => this.refreshIcons());
            this.$watch('selectedDate', () => this.refreshIcons());
            this.$watch('tasks', () => this.refreshIcons());
            this.$watch('routines', () => this.refreshIcons());
            this.$watch('editingTaskId', () => this.refreshIcons());
            this.$watch('editingRoutineId', () => this.refreshIcons());

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
                        { id: 'r1', title: '朝の水を飲む' },
                        { id: 'r2', title: 'メールチェック' },
                        { id: 'r3', title: '部屋の換気・整理' }
                    ];
                    this.saveRoutines();
                }
            } catch (e) {
                console.error('Failed to load data:', e);
            }
        },

        saveTasks() {
            localStorage.setItem('taskloom_tasks', JSON.stringify(this.tasks));
            this.touchAndSync();
        },

        saveRoutines() {
            localStorage.setItem('taskloom_routines', JSON.stringify(this.routines));
            this.touchAndSync();
        },

        // この端末で「今この瞬間」変更したことを記録してからクラウドに送る
        touchAndSync() {
            const now = Date.now();
            localStorage.setItem('taskloom_updatedAt', String(now));
            this.syncToCloud(now);
        },

        // Cloud Sync Handlers (Firebase)
        initFirebaseAuth() {
            firebase.auth().onAuthStateChanged(async (fbUser) => {
                if (fbUser) {
                    this.user = {
                        uid: fbUser.uid,
                        displayName: fbUser.displayName,
                        photoURL: fbUser.photoURL,
                        email: fbUser.email
                    };
                    await this.syncFromCloud();
                } else {
                    this.user = null;
                }
                this.authChecked = true;
            });
        },

        async signIn() {
            this.authError = '';
            const provider = new firebase.auth.GoogleAuthProvider();
            try {
                await firebase.auth().signInWithPopup(provider);
            } catch (e) {
                console.error('Sign-in failed:', e);
                this.authError = `ログインに失敗しました (${e.code || e.message})`;
            }
        },

        signOut() {
            firebase.auth().signOut();
        },

        async syncFromCloud() {
            const docRef = firebase.firestore().collection('users').doc(this.user.uid);
            try {
                const snap = await docRef.get();
                if (snap.exists) {
                    const data = snap.data();
                    const cloudUpdatedAt = data.updatedAt || 0;
                    const localUpdatedAt = Number(localStorage.getItem('taskloom_updatedAt') || 0);

                    if (localUpdatedAt > cloudUpdatedAt) {
                        // このデバイスの方が新しい変更を持っている
                        // (直前の保存がクラウドに届く前に閉じた可能性がある) → クラウドを上書きし直す
                        await this.syncToCloud(localUpdatedAt);
                    } else {
                        // クラウドの方が新しい(他デバイスでの変更など) → こちらを採用
                        if (data.tasks) this.tasks = data.tasks;
                        if (data.routines) this.routines = data.routines;
                        localStorage.setItem('taskloom_tasks', JSON.stringify(this.tasks));
                        localStorage.setItem('taskloom_routines', JSON.stringify(this.routines));
                        localStorage.setItem('taskloom_updatedAt', String(cloudUpdatedAt));
                    }
                } else {
                    // 初回ログイン: 今あるローカルデータをそのままバックアップとしてアップロード
                    const now = Date.now();
                    localStorage.setItem('taskloom_updatedAt', String(now));
                    await docRef.set({ tasks: this.tasks, routines: this.routines, updatedAt: now });
                }
            } catch (e) {
                console.error('Cloud sync failed:', e);
            }
        },

        syncToCloud(updatedAt) {
            if (!this.user) return;
            const ts = updatedAt || Date.now();
            return firebase.firestore().collection('users').doc(this.user.uid)
                .set({ tasks: this.tasks, routines: this.routines, updatedAt: ts }, { merge: true })
                .catch((e) => console.error('Cloud save failed:', e));
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
            if (!this.newTaskTitle.trim()) return;

            const newTask = {
                id: 't_' + Date.now(),
                date: this.selectedDate,
                title: this.newTaskTitle.trim(),
                completed: false,
                createdAt: new Date().toISOString()
            };

            this.tasks.unshift(newTask);
            this.saveTasks();

            // Reset form
            this.newTaskTitle = '';
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

        startEditTask(task) {
            this.editingTaskId = task.id;
            this.editingTaskTitle = task.title;
        },

        saveEditTask(task) {
            const trimmed = this.editingTaskTitle.trim();
            if (trimmed) {
                task.title = trimmed;
                this.saveTasks();
            }
            this.cancelEditTask();
        },

        cancelEditTask() {
            this.editingTaskId = null;
            this.editingTaskTitle = '';
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
                createdAt: new Date().toISOString()
            };
            this.tasks.unshift(newTask);
            this.saveTasks();
        },

        addRoutine() {
            if (!this.newRoutineTitle.trim()) return;

            const routine = {
                id: 'r_' + Date.now(),
                title: this.newRoutineTitle.trim()
            };

            this.routines.push(routine);
            this.saveRoutines();

            this.newRoutineTitle = '';
        },

        deleteRoutine(routineId) {
            this.routines = this.routines.filter(r => r.id !== routineId);
            this.saveRoutines();
        },

        startEditRoutine(routine) {
            this.editingRoutineId = routine.id;
            this.editingRoutineTitle = routine.title;
        },

        saveEditRoutine(routine) {
            const trimmed = this.editingRoutineTitle.trim();
            if (trimmed) {
                routine.title = trimmed;
                this.saveRoutines();
            }
            this.cancelEditRoutine();
        },

        cancelEditRoutine() {
            this.editingRoutineId = null;
            this.editingRoutineTitle = '';
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

                dayList.push({
                    dayNum: d,
                    dateStr: dateStr,
                    total: total,
                    completed: completed,
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
