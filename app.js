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
        syncStatus: '', // '' | 'saving' | 'saved'
        _syncTimer: null,

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
            this.queueCloudSync();
        },

        saveRoutines() {
            localStorage.setItem('taskloom_routines', JSON.stringify(this.routines));
            this.queueCloudSync();
        },

        // ローカル保存は常に即座。クラウド送信は連打・連続操作をまとめるため
        // 2秒間操作が無かったタイミングでバックグラウンドで1回だけ送る(デバウンス)。
        // これにより「保存できたか待つ」体感の遅さが無くなる。
        queueCloudSync() {
            if (!this.user) return;
            this.syncStatus = 'saving';
            clearTimeout(this._syncTimer);
            this._syncTimer = setTimeout(() => {
                this.syncToCloud();
            }, 2000);
        },

        // Cloud Sync Handlers (Firebase)
        initFirebaseAuth() {
            firebase.auth().onAuthStateChanged((fbUser) => {
                if (fbUser) {
                    this.user = {
                        uid: fbUser.uid,
                        displayName: fbUser.displayName,
                        photoURL: fbUser.photoURL,
                        email: fbUser.email
                    };
                    // 画面はローカルデータで即座に表示する(クラウド確認を待たない = 体感速度が速い)
                    this.authChecked = true;

                    // この端末にまだ実質データが無い(新しい端末/入れ直し直後)場合だけ、
                    // 自動でクラウドから復元を試みる。データが既にある通常時は何もしない
                    // (=自動で上書きされることは無くなり、消失事故が起きなくなる)
                    const hasLocalTasks = this.tasks.length > 0;
                    const hasCustomRoutines = this.routines.some(r => !['r1', 'r2', 'r3'].includes(r.id));
                    if (!hasLocalTasks && !hasCustomRoutines) {
                        this.restoreFromCloud({ silent: true });
                    }
                } else {
                    this.user = null;
                    this.authChecked = true;
                }
            });

            // タブを閉じる/切り替える直前に、保留中のクラウド送信があれば待たずに即実行しておく
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden' && this._syncTimer) {
                    clearTimeout(this._syncTimer);
                    this._syncTimer = null;
                    this.syncToCloud();
                }
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

        // クラウドは「バックアップ先」として使う。普段の画面表示・保存は常にローカルが正。
        // クラウドからの取り込みは (1) 新しい端末で開いた初回、(2) ユーザーが手動で
        // 「クラウドから復元」を押した時、の2パターンのみに限定し、自動で毎回上書きしない。
        async restoreFromCloud({ silent = false } = {}) {
            if (!this.user) return;
            const docRef = firebase.firestore().collection('users').doc(this.user.uid);
            try {
                const snap = await docRef.get();
                if (snap.exists) {
                    const data = snap.data();
                    if (!silent) {
                        const ok = confirm('クラウドのバックアップでこの端末のタスクを上書きします。よろしいですか?');
                        if (!ok) return;
                    }
                    if (data.tasks) this.tasks = data.tasks;
                    if (data.routines) this.routines = data.routines;
                    localStorage.setItem('taskloom_tasks', JSON.stringify(this.tasks));
                    localStorage.setItem('taskloom_routines', JSON.stringify(this.routines));
                    if (!silent) alert('復元しました');
                } else if (!silent) {
                    alert('クラウドにバックアップがまだありません');
                }
            } catch (e) {
                console.error('Restore from cloud failed:', e);
                if (!silent) alert('復元に失敗しました');
            }
        },

        syncToCloud() {
            if (!this.user) return;
            this.syncStatus = 'saving';
            firebase.firestore().collection('users').doc(this.user.uid)
                .set({ tasks: this.tasks, routines: this.routines, updatedAt: Date.now() }, { merge: true })
                .then(() => { this.syncStatus = 'saved'; })
                .catch((e) => {
                    console.error('Cloud save failed:', e);
                    this.syncStatus = '';
                });
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

        // 今日より前の日付にある、まだ完了していないタスク一覧(参考用に残置)
        get pastIncompleteTasks() {
            return this.tasks.filter(t =>
                t.date < this.todayStr &&
                !t.completed &&
                t.lastCarriedDate !== this.todayStr
            );
        },

        // 過去のタスク1件を、元の記録は残したまま「今日のタスク」としてコピー追加する
        addSingleTaskToToday(task) {
            const copy = {
                id: 't_' + Date.now() + Math.random().toString(36).substr(2, 4),
                date: this.todayStr,
                title: task.title,
                completed: false,
                createdAt: new Date().toISOString()
            };
            this.tasks.unshift(copy);
            // 元のタスクの日付・完了状態は変更しない(過去の記録として残す)
            task.lastCarriedDate = this.todayStr;
            this.saveTasks();
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
