        let allNotices = []; // イベントリストをグローバルに保持（初期化エラー回避のため先頭に移動）
        let upcomingNotices = [];
        let pastNotices = [];

        function escapeHTML(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        /* =========================================
           1. 上フレームの処理（時計・ストップウォッチ・タイマー）
           ========================================= */

        // --- モード切り替え ---
        const topNavBtns = document.querySelectorAll('.top-nav button');
        const topModes = document.querySelectorAll('.top-mode-content');

        topNavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                topNavBtns.forEach(b => b.classList.remove('active'));
                topModes.forEach(m => m.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.target).classList.add('active');
            });
        });

        // --- 時計 ---
        function updateClock() {
            const now = new Date();
            const days = ['日', '月', '火', '水', '木', '金', '土'];

            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const date = now.getDate();
            const day = days[now.getDay()];

            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');

            document.getElementById('clock-date').textContent = `${year}年 ${month}月 ${date}日 (${day})`;
            document.getElementById('clock-h').textContent = hours;
            document.getElementById('clock-m').textContent = minutes;
            document.getElementById('clock-s').textContent = seconds;

            updateEventAlert(now, year, month, date);
        }

        let forceAlertUntil = 0; // テスト表示用の時刻保持

        function updateEventAlert(now, year, month, date) {
            const alertEl = document.getElementById('upcoming-event-alert');
            if (!alertEl || typeof allNotices === 'undefined') return;

            // テスト表示モード
            if (now.getTime() < forceAlertUntil) {
                alertEl.innerHTML = `[テスト表示] まもなく 12:00 より『テストイベント』が始まります。<br>13:00 まではイベント参加者のみご利用いただけます。`;
                alertEl.style.display = 'block';
                return;
            }

            const todayStr = `${year}.${String(month).padStart(2, '0')}.${String(date).padStart(2, '0')}`;
            const todayEvents = allNotices.filter(n => n.date === todayStr && n.startTime);

            let activeAlert = null;

            for (const event of todayEvents) {
                const [startH, startM] = event.startTime.split(':').map(Number);
                const startDateTime = new Date(year, month - 1, date, startH, startM, 0);
                
                // 開始時刻の5分前
                const alertStartTime = new Date(startDateTime.getTime() - 5 * 60 * 1000);
                
                let alertEndTime;
                if (event.exclusive && event.endTime) {
                    const [endH, endM] = event.endTime.split(':').map(Number);
                    alertEndTime = new Date(year, month - 1, date, endH, endM, 0);
                } else {
                    alertEndTime = startDateTime; // 通常イベントは開始時刻に非表示
                }

                if (now >= alertStartTime && now < alertEndTime) {
                    activeAlert = event;
                    break; // 該当するイベントが複数ある場合は直近のものを優先
                }
            }

            if (activeAlert) {
                if (activeAlert.exclusive) {
                    alertEl.innerHTML = `まもなく ${activeAlert.startTime} より『${escapeHTML(activeAlert.title)}』が始まります。<br>${activeAlert.endTime} まではイベント参加者のみご利用いただけます。`;
                } else {
                    alertEl.innerHTML = `まもなく ${activeAlert.startTime} より『${escapeHTML(activeAlert.title)}』が始まります。`;
                }
                alertEl.style.display = 'block';
            } else {
                alertEl.style.display = 'none';
            }
        }

        setInterval(updateClock, 1000);
        updateClock();

        // --- テスト用：時計表示タップでアラートを10秒間表示 ---
        const clockDisplayGroup = document.querySelector('#mode-clock .time-display-group');
        if (clockDisplayGroup) {
            clockDisplayGroup.style.cursor = 'pointer';
            clockDisplayGroup.addEventListener('click', () => {
                forceAlertUntil = Date.now() + 10000; // 10秒間
                updateClock(); // 即座に反映
            });
        }

        // --- ストップウォッチ ---
        let swInterval;
        let swStartTime;
        let swElapsedTime = 0;
        let isSwRunning = false;
        const swStartStopBtn = document.getElementById('sw-start-stop');
        const swResetBtn = document.getElementById('sw-reset');
        const swHDisp = document.getElementById('sw-h');
        const swMDisp = document.getElementById('sw-m');
        const swSDisp = document.getElementById('sw-s');
        const swMsDisp = document.getElementById('sw-ms-disp');
        const swNavBtn = document.querySelector('[data-target="mode-stopwatch"]');

        function updateStopwatch() {
            const now = Date.now();
            const ms = swElapsedTime + (now - swStartTime);

            const totalSeconds = Math.floor(ms / 1000);
            const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const seconds = String(totalSeconds % 60).padStart(2, '0');
            const milliseconds = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');

            swHDisp.textContent = hours;
            swMDisp.textContent = minutes;
            swSDisp.textContent = seconds;
            swMsDisp.textContent = `.${milliseconds}`;
        }

        swStartStopBtn.addEventListener('click', () => {
            if (isSwRunning) {
                clearInterval(swInterval);
                swElapsedTime += Date.now() - swStartTime;
                swStartStopBtn.textContent = 'スタート';
                swNavBtn.classList.remove('is-running');
                isSwRunning = false;
            } else {
                swStartTime = Date.now();
                swInterval = setInterval(updateStopwatch, 10);
                swStartStopBtn.textContent = 'ストップ';
                swNavBtn.classList.add('is-running');
                isSwRunning = true;
            }
        });

        swResetBtn.addEventListener('click', () => {
            clearInterval(swInterval);
            swElapsedTime = 0;
            isSwRunning = false;
            swStartStopBtn.textContent = 'スタート';
            swNavBtn.classList.remove('is-running');
            swHDisp.textContent = '00';
            swMDisp.textContent = '00';
            swSDisp.textContent = '00';
            swMsDisp.textContent = '.00';
        });

        // --- タイマー ---
        let timerInterval;
        let timerSettingMs = 5 * 60 * 1000; // デフォルト5分 (5 * 60000ms)
        let timerRemainingMs = timerSettingMs;
        let timerEndTime;
        let isTimerRunning = false;

        const timerDisplay = document.getElementById('timer-display');
        const timerSetup = document.getElementById('timer-setup');
        const timerStartStopBtn = document.getElementById('timer-start-stop');
        const timerResetBtn = document.getElementById('timer-reset');
        const tmHDisp = document.getElementById('tm-h');
        const tmMDisp = document.getElementById('tm-m');
        const tmSDisp = document.getElementById('tm-s');
        const tmNavBtn = document.querySelector('[data-target="mode-timer"]');

        function updateTimerDisplay() {
            // 設定値の表示 (時、分)
            const settingTotalSec = Math.floor(timerSettingMs / 1000);
            const settingH = String(Math.floor(settingTotalSec / 3600)).padStart(2, '0');
            const settingM = String(Math.floor((settingTotalSec % 3600) / 60)).padStart(2, '0');

            document.getElementById('timer-setting-h').textContent = settingH;
            document.getElementById('timer-setting-m').textContent = settingM;

            // 実行中の表示 (時：分：秒)
            const remTotalSec = Math.ceil(timerRemainingMs / 1000);
            const remH = String(Math.floor(remTotalSec / 3600)).padStart(2, '0');
            const remM = String(Math.floor((remTotalSec % 3600) / 60)).padStart(2, '0');
            const remS = String(remTotalSec % 60).padStart(2, '0');

            tmHDisp.textContent = remH;
            tmMDisp.textContent = remM;
            tmSDisp.textContent = remS;
        }

        // 時の増減 (Max 99時間、ループあり)
        document.getElementById('timer-h-up').addEventListener('click', () => {
            if (!isTimerRunning) {
                let h = Math.floor(timerSettingMs / 3600000);
                let m = Math.floor((timerSettingMs % 3600000) / 60000);
                h++;
                if (h > 99) h = 0;
                timerSettingMs = h * 3600000 + m * 60000;
                timerRemainingMs = timerSettingMs;
                updateTimerDisplay();
            }
        });
        document.getElementById('timer-h-down').addEventListener('click', () => {
            if (!isTimerRunning) {
                let h = Math.floor(timerSettingMs / 3600000);
                let m = Math.floor((timerSettingMs % 3600000) / 60000);
                h--;
                if (h < 0) h = 99;
                timerSettingMs = h * 3600000 + m * 60000;
                timerRemainingMs = timerSettingMs;
                updateTimerDisplay();
            }
        });

        // 分の増減 (Max 59分、ループあり)
        document.getElementById('timer-m-up').addEventListener('click', () => {
            if (!isTimerRunning) {
                let h = Math.floor(timerSettingMs / 3600000);
                let m = Math.floor((timerSettingMs % 3600000) / 60000);
                m++;
                if (m > 59) m = 0;
                timerSettingMs = h * 3600000 + m * 60000;
                timerRemainingMs = timerSettingMs;
                updateTimerDisplay();
            }
        });
        document.getElementById('timer-m-down').addEventListener('click', () => {
            if (!isTimerRunning) {
                let h = Math.floor(timerSettingMs / 3600000);
                let m = Math.floor((timerSettingMs % 3600000) / 60000);
                m--;
                if (m < 0) m = 59;
                timerSettingMs = h * 3600000 + m * 60000;
                timerRemainingMs = timerSettingMs;
                updateTimerDisplay();
            }
        });

        // --- Web Audio API を用いたベル音合成 ---
        let audioCtx;
        function initAudio() {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            // ブラウザの自動再生ブロックを解除するため、ユーザーアクション時にresumeする
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }

        function playBellSound() {
            if (!audioCtx) return;
            // ベルらしい音色にするため、複数の周波数（和音）を重ねる
            const freqs = [880, 1320, 1760]; // A5, E6, A6付近の周波数
            freqs.forEach(freq => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

                // アタック（立ち上がり）とリリース（減衰）の設定
                gain.gain.setValueAtTime(0, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.5);

                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 2.5);
            });
        }

        function updateTimer() {
            const now = Date.now();
            timerRemainingMs = timerEndTime - now;
            if (timerRemainingMs <= 0) {
                timerRemainingMs = 0;
                clearInterval(timerInterval);
                isTimerRunning = false;
                timerStartStopBtn.textContent = 'スタート';
                tmNavBtn.classList.remove('is-running');
                timerDisplay.classList.add('timer-end');

                // タイマー完了時に音を鳴らす
                playBellSound();

                // タイマーが0になって自動停止した時点から無操作カウントをリセット
                if (typeof resetInteractionTimer === 'function') resetInteractionTimer();
            }
            updateTimerDisplay();
        }

        timerStartStopBtn.addEventListener('click', () => {
            initAudio(); // 音声コンテキストの初期化（ブラウザ制限の解除）

            if (isTimerRunning) {
                clearInterval(timerInterval);
                isTimerRunning = false;
                timerStartStopBtn.textContent = 'スタート';
                tmNavBtn.classList.remove('is-running');
            } else {
                if (timerRemainingMs <= 0) return;
                timerEndTime = Date.now() + timerRemainingMs;
                timerInterval = setInterval(updateTimer, 50);
                isTimerRunning = true;
                timerStartStopBtn.textContent = 'ストップ';
                tmNavBtn.classList.add('is-running');
                timerDisplay.classList.remove('timer-end');
                timerSetup.style.display = 'none';
                timerDisplay.style.display = 'flex';
            }
        });

        timerResetBtn.addEventListener('click', () => {
            clearInterval(timerInterval);
            isTimerRunning = false;
            timerRemainingMs = timerSettingMs;
            timerStartStopBtn.textContent = 'スタート';
            tmNavBtn.classList.remove('is-running');
            timerDisplay.classList.remove('timer-end');
            updateTimerDisplay();
            timerSetup.style.display = 'flex';
            timerDisplay.style.display = 'none';
        });

        updateTimerDisplay();

        /* =========================================
           2. カレンダーの処理
           ========================================= */
        let today = new Date();
        let currentYear = today.getFullYear();
        let currentMonth = today.getMonth();

        function renderCalendar(year, month) {
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            document.getElementById('calendar-month-year').textContent = `${year}年 ${month + 1}月`;

            const tbody = document.getElementById('calendar-body');
            tbody.innerHTML = '';

            let tr = document.createElement('tr');

            // 空白のセル（前月分）
            for (let i = 0; i < firstDay; i++) {
                tr.appendChild(document.createElement('td'));
            }

            // 日付セル
            for (let i = 1; i <= daysInMonth; i++) {
                const td = document.createElement('td');

                // その日のイベントを抽出
                const cellDateStr = `${year}.${String(month + 1).padStart(2, '0')}.${String(i).padStart(2, '0')}`;
                // allNotices配列(後述)から該当する日付のイベントをフィルタリング
                const eventsForDay = typeof allNotices !== 'undefined' ? allNotices.filter(n => n.date === cellDateStr) : [];
                let eventsHtml = '';
                if (eventsForDay.length > 0) {
                    eventsHtml = eventsForDay.map(e => `<div class="event-item">${escapeHTML(e.title)}</div>`).join('');
                }

                // 日付とイベントを書き込み
                td.innerHTML = `
                    <div class="date-num">${i}</div>
                    <div class="date-events">${eventsHtml}</div>
                `;

                // 今日の判定
                if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) {
                    td.classList.add('today');
                }

                tr.appendChild(td);

                // 土曜日まで来たら次の行へ
                if ((i + firstDay) % 7 === 0) {
                    tbody.appendChild(tr);
                    tr = document.createElement('tr');
                }
            }

            // 最後の行の空白セルを埋める
            if (tr.children.length > 0 && tr.children.length < 7) {
                for (let i = tr.children.length; i < 7; i++) {
                    tr.appendChild(document.createElement('td'));
                }
                tbody.appendChild(tr);
            }
        }

        document.getElementById('prev-month').addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            renderCalendar(currentYear, currentMonth);
        });

        document.getElementById('next-month').addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            renderCalendar(currentYear, currentMonth);
        });

        renderCalendar(currentYear, currentMonth);

        // --- 無操作時のカレンダー当月復帰・時計復帰処理 ---
        let interactionTimeout;
        let topFrameTimeout;

        function resetCalendarToToday() {
            const now = new Date();
            const nowYear = now.getFullYear();
            const nowMonth = now.getMonth();

            // 既に当月の場合は再描画しない
            if (currentYear === nowYear && currentMonth === nowMonth) return;

            currentYear = nowYear;
            currentMonth = nowMonth;
            renderCalendar(currentYear, currentMonth);
        }

        function resetTopFrameToClock() {
            // ストップウォッチもタイマーも稼働していない場合のみ時計に戻す
            if (!isSwRunning && !isTimerRunning) {
                topNavBtns.forEach(b => b.classList.remove('active'));
                topModes.forEach(m => m.classList.remove('active'));

                const clockBtn = document.querySelector('[data-target="mode-clock"]');
                if (clockBtn) clockBtn.classList.add('active');

                const modeClock = document.getElementById('mode-clock');
                if (modeClock) modeClock.classList.add('active');
            }
        }

        function resetInteractionTimer() {
            clearTimeout(interactionTimeout);
            // 30秒後に当月に戻すタイマーをセット
            interactionTimeout = setTimeout(() => {
                resetCalendarToToday();
            }, 30000);

            clearTimeout(topFrameTimeout);
            // 3分(180秒)後に時計モードに戻すタイマーをセット
            topFrameTimeout = setTimeout(() => {
                resetTopFrameToClock();
            }, 180000);
        }

        // 画面全体のタッチやクリック操作を監視してタイマーをリセット
        document.addEventListener('click', resetInteractionTimer);
        document.addEventListener('touchstart', resetInteractionTimer, { passive: true });

        // 初回のタイマー起動
        resetInteractionTimer();

        /* =========================================
           3. お知らせフィード（実データ）の処理
           ========================================= */

        let currentTab = 'upcoming'; // 'upcoming' or 'past'
        let currentUpcomingPage = 0;
        let currentPastPage = 0;
        let upcomingPages = [];
        let pastPages = [];
        let noticeAutoPlayInterval;
        let feedRefreshInProgress = false;

        function getTypeLabel(type) {
            switch(type) {
                case 'event': return 'イベント';
                case 'workshop': return 'ワークショップ';
                case 'exhibition': return '企画展';
                case 'other': return 'その他';
                default: return 'お知らせ';
            }
        }

        function renderNoticeItemHTML(item) {
            let timeStr = '';
            if (item.kind === 'upcoming') {
                if (item.isMultiDay) {
                    timeStr = ` <span class="notice-time" style="margin-left: 1.5cqw; color: #555;">〜${escapeHTML(item.endDate.replace(/-/g, '.'))}</span>`;
                } else if (item.hasTime) {
                    timeStr = ` <span class="notice-time" style="margin-left: 1.5cqw; color: #555;">${escapeHTML(item.start)}${item.end ? '〜' + escapeHTML(item.end) : ''}</span>`;
                } else {
                    timeStr = ` <span class="notice-time" style="margin-left: 1.5cqw; color: #555;">終日</span>`;
                }
            }

            const exclusiveBadge = item.exclusive ? `<span class="notice-badge exclusive">🔒 貸切</span>` : '';
            const typeClass = escapeHTML(item.type || 'other');
            const typeBadge = `<span class="type-badge type-${typeClass}">${escapeHTML(getTypeLabel(item.type))}</span>`;

            let html = `
                <span class="notice-date">${escapeHTML(item.date)}${timeStr}${exclusiveBadge}</span>
                <div class="notice-text">${typeBadge}${escapeHTML(item.title)}</div>
            `;

            if (item.kind === 'past') {
                let pastContent = '';
                if (item.image) {
                    pastContent += `<img src="${escapeHTML(item.image)}" class="notice-past-image" alt="" onerror="this.style.display='none'">`;
                }
                pastContent += `<div class="notice-past-details">`;
                if (item.organizer) {
                    pastContent += `<div class="notice-past-organizer">${escapeHTML(item.organizer)}</div>`;
                }
                if (item.excerpt) {
                    pastContent += `<div class="notice-past-excerpt">${escapeHTML(item.excerpt)}</div>`;
                }
                pastContent += `</div>`;

                if (pastContent !== `<div class="notice-past-details"></div>`) {
                    html += `<div class="notice-past-content">${pastContent}</div>`;
                }
            }

            return html;
        }

        function paginateNotices(notices, availableHeight, listElement) {
            listElement.innerHTML = '';
            const itemHeights = [];

            for (const item of notices) {
                const li = document.createElement('li');
                li.innerHTML = renderNoticeItemHTML(item);
                li.style.visibility = 'hidden';
                li.style.position = 'absolute';
                li.style.width = '100%'; // widthを指定して折り返しを正しく計算させる
                listElement.appendChild(li);

                itemHeights.push(li.getBoundingClientRect().height);
                li.remove();
            }

            const pages = [];
            let currentPage = [];
            let currentHeight = 0;

            for (let i = 0; i < notices.length; i++) {
                const h = itemHeights[i];
                if (currentPage.length > 0 && currentHeight + h > availableHeight) {
                    pages.push(currentPage);
                    currentPage = [notices[i]];
                    currentHeight = h;
                } else {
                    currentPage.push(notices[i]);
                    currentHeight += h;
                }
            }
            if (currentPage.length > 0) {
                pages.push(currentPage);
            }
            return pages;
        }

        function calculateNoticePages() {
            const wrapper = document.querySelector('.notice-wrapper');
            const header = document.querySelector('.notice-header');
            const listElement = document.getElementById('notice-list');

            if (!wrapper || !header || !listElement) return;

            const availableHeight = wrapper.clientHeight - header.offsetHeight - 10; // 余裕を少し持たせる

            upcomingPages = paginateNotices(upcomingNotices, availableHeight, listElement);
            pastPages = paginateNotices(pastNotices, availableHeight, listElement);

            if (currentUpcomingPage >= upcomingPages.length) {
                currentUpcomingPage = 0;
            }
            if (currentPastPage >= pastPages.length) {
                currentPastPage = 0;
            }
        }

        window.addEventListener('resize', () => {
            calculateNoticePages();
            renderNoticeTab(currentTab);
        });

        async function initFeeds() {
            if (typeof loadMergedEvents !== 'function') return;

            try {
                // 過去のイベントは1年以内（おおよそ）にするため制限。limit 50を渡す。
                const data = await loadMergedEvents({ upcomingLimit: 50, pastLimit: 50 });

                // 1年前の日付を計算
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                const oneYearAgoStr = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth()+1).padStart(2, '0')}-${String(oneYearAgo.getDate()).padStart(2, '0')}`;

                allNotices = [];
                upcomingNotices = [];
                pastNotices = [];

                for (const item of data.merged) {
                    // 過去イベントの1年フィルター
                    if (item.kind === 'past' && item.date < oneYearAgoStr) {
                        continue;
                    }

                    // 既存のサイネージロジック用にフォーマットを変換
                    const formattedDate = item.date.replace(/-/g, '.');

                    const formattedItem = {
                        ...item,
                        date: formattedDate,       // YYYY.MM.DD形式
                        startTime: item.start,     // 既存のstartTimeプロパティにマップ
                        endTime: item.end,         // 既存のendTimeプロパティにマップ
                        exclusive: item.isReserved // 貸切フラグ
                    };

                    allNotices.push(formattedItem);
                    if (item.kind === 'past') {
                        pastNotices.push(formattedItem);
                    } else {
                        upcomingNotices.push(formattedItem);
                    }
                }

                calculateNoticePages();
                if (upcomingPages.length > 0) {
                    renderNoticeTab('upcoming');
                } else if (pastPages.length > 0) {
                    renderNoticeTab('past');
                } else {
                    renderNoticeTab('upcoming');
                }
                startNoticeAutoPlay();
                renderCalendar(currentYear, currentMonth);

            } catch (e) {
                console.warn('[DEBUG] Failed to init feeds', e);
            }
        }

        async function refreshFeedsWhenIdle() {
            if (isSwRunning || isTimerRunning || feedRefreshInProgress) {
                return;
            }

            feedRefreshInProgress = true;
            try {
                await initFeeds();
            } finally {
                feedRefreshInProgress = false;
            }
        }

        function renderNoticeTab(tab) {
            currentTab = tab;

            // タブの見た目を更新
            document.querySelectorAll('.notice-tab-btn').forEach(btn => {
                if (btn.dataset.tab === tab) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            const pages = tab === 'upcoming' ? upcomingPages : pastPages;
            const currentIndex = tab === 'upcoming' ? currentUpcomingPage : currentPastPage;

            const listElement = document.getElementById('notice-list');
            listElement.innerHTML = '';

            if (pages.length === 0) {
                document.getElementById('notice-page-indicator').textContent = `0 / 0`;
                return;
            }

            const pageItems = pages[currentIndex] || [];
            pageItems.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = renderNoticeItemHTML(item);
                listElement.appendChild(li);
            });

            document.getElementById('notice-page-indicator').textContent = `${currentIndex + 1} / ${pages.length}`;
        }

        function nextNoticePage() {
            if (currentTab === 'upcoming') {
                if (upcomingPages.length === 0) {
                    if (pastPages.length > 0) renderNoticeTab('past');
                    return;
                }
                currentUpcomingPage++;
                if (currentUpcomingPage >= upcomingPages.length) {
                    currentUpcomingPage = 0;
                    if (pastPages.length > 0) {
                        renderNoticeTab('past');
                    } else {
                        renderNoticeTab('upcoming');
                    }
                } else {
                    renderNoticeTab('upcoming');
                }
            } else {
                if (pastPages.length === 0) {
                    if (upcomingPages.length > 0) renderNoticeTab('upcoming');
                    return;
                }
                currentPastPage++;
                if (currentPastPage >= pastPages.length) {
                    currentPastPage = 0;
                    if (upcomingPages.length > 0) {
                        renderNoticeTab('upcoming');
                    } else {
                        renderNoticeTab('past');
                    }
                } else {
                    renderNoticeTab('past');
                }
            }
        }

        function prevNoticePage() {
            if (currentTab === 'upcoming') {
                if (upcomingPages.length === 0) return;
                currentUpcomingPage--;
                if (currentUpcomingPage < 0) {
                    currentUpcomingPage = upcomingPages.length - 1;
                }
                renderNoticeTab('upcoming');
            } else {
                if (pastPages.length === 0) return;
                currentPastPage--;
                if (currentPastPage < 0) {
                    currentPastPage = pastPages.length - 1;
                }
                renderNoticeTab('past');
            }
        }

        function startNoticeAutoPlay() {
            clearInterval(noticeAutoPlayInterval);
            // 8秒ごとに自動切り替え
            noticeAutoPlayInterval = setInterval(nextNoticePage, 8000);
        }

        // タブ切り替えボタンのイベントリスナー
        document.querySelectorAll('.notice-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                renderNoticeTab(tab);
                startNoticeAutoPlay();
            });
        });

        // 手動切り替えボタンのイベントリスナー
        document.getElementById('prev-notice').addEventListener('click', () => {
            prevNoticePage();
            startNoticeAutoPlay(); // 手動操作時にタイマーをリセット
        });

        document.getElementById('next-notice').addEventListener('click', () => {
            nextNoticePage();
            startNoticeAutoPlay(); // 手動操作時にタイマーをリセット
        });

        // 起動
        refreshFeedsWhenIdle();
        setInterval(refreshFeedsWhenIdle, 3600000);