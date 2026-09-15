/**
 * えひめ連携企業紹介 - データおよび制御ロジック
 */

// 企業データの定義
const categories = [
    {
        id: 1,
        name: "機械・製造",
        description: "造船・機械・金属など、愛媛の基幹となるものづくり産業",
        companies: [
            "(株)アテックス", "井関農機(株)", "潮冷熱(株)", "越智昇鉄工(株)",
            "川之江造機(株)", "四国溶材(株)", "新和工業(株)", "住友重機械工業(株)",
            "西部鉄工(株)", "(株)土居鉄工所", "(株)ヒカリ", "BEMAC(株)",
            "松山容器(株)", "眞鍋造機(株)", "三浦工業(株)"
        ]
    },
    {
        id: 2,
        name: "先端素材・化学",
        description: "化学・非鉄金属・製紙・繊維など、グローバルに展開する素材産業",
        companies: [
            "住友化学(株) 愛媛工場", "住友金属鉱山(株) 技術本部新居浜研究所",
            "(株)タケチ", "帝人(株) 松山事業所", "帝人フロンティア(株)",
            "(株)トーヨ", "日泉化学(株)"
        ]
    },
    {
        id: 3,
        name: "社会基盤",
        description: "建設・コンサルタント・プラント施工など、空間やインフラを築く産業",
        companies: [
            "(株)一宮工務店", "共立工営(株)", "(株)キクノ", "(株)コスにじゅういち",
            "(株)シアテック", "四国通建(株)", "(株)親和技術コンサルタント",
            "ダイオーエンジニアリング(株)", "(株)トップシステム", "南海測量設計(株)",
            "日滝工業(株)", "(株)富士建設コンサルタント", "(株)フジコソ",
            "(株)芙蓉コンサルタント", "(株)米北測量設計事務所"
        ]
    },
    {
        id: 4,
        name: "デジタル・IT",
        description: "ITシステム・ソフトウェア・通信機器など、DXと情報を支える産業",
        companies: [
            "(株)アイサイト", "NECプラットフォームズ(株)", "(株)NPシステム開発",
            "(株)愛媛電算", "(株)シーライブ", "セキ(株)", "(株)ダイテック",
            "(株)パルソフトウェアサービス"
        ]
    },
    {
        id: 5,
        name: "インフラ・環境",
        description: "エネルギー・交通・環境マネジメントなど、社会を維持する産業",
        companies: [
            "(株)イージーエス", "(株)伊予鉄グループ", "オオノ開發(株)",
            "四国ガス(株)", "四国電力(株) 愛媛支店"
        ]
    },
    {
        id: 6,
        name: "金融・経済",
        description: "金融機関・経済団体・シンクタンクなど、ビジネス土壌を育む組織",
        companies: [
            "(株)伊予銀行", "(株)いよぎん地域経済研究センター", "(株)愛媛銀行",
            "愛媛県経営者協会", "愛媛経済同友会", "愛媛県商工会議所連合会",
            "愛媛県商工会連合会", "愛媛県中小企業団体中央会", "愛媛信用金庫",
            "(一財)四国産業・技術振興センター"
        ]
    },
    {
        id: 7,
        name: "生活・メディア",
        description: "食品・卸売・メディア・サービスなど、生活に密着する産業",
        companies: [
            "朝日共販(株)", "ANAクラウンプラザホテル松山", "(株)門田商店",
            "菅機械産業(株)", "四国乳業(株)", "(株)テレビ愛媛", "マルトモ(株)"
        ]
    },
    {
        id: 8,
        name: "自治体",
        description: "愛媛大学研究協力会に入っていただいている、教育・産業振興を支える自治体",
        companies: [
            "今治市", "西条市"
        ]
    }
];

/**
 * ダミーロゴ SVG の生成
 */
function createDummyLogo(name) {
    const hash = name.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    const hue = hash % 360;
    const cleanName = name.replace(/(株式会社|\(株\)|一般財団法人|\(一財\)|グループ)/g, '').trim();
    const initial = cleanName.substring(0, 1) || name.substring(0, 1);

    return `
        <svg class="w-full h-full opacity-80" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="hsl(${hue}, 40%, 20%)" rx="8" />
            <path d="M0,0 L40,40 M60,0 L100,40" stroke="hsl(${hue}, 40%, 30%)" stroke-width="2" opacity="0.3" />
            <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-size="24" font-weight="bold" fill="hsl(${hue}, 70%, 70%)" font-family="sans-serif">${initial}</text>
            <text x="50%" y="75%" dominant-baseline="middle" text-anchor="middle" font-size="6" font-weight="bold" fill="hsl(${hue}, 50%, 50%)" font-family="sans-serif" opacity="0.6">PARTNER</text>
        </svg>
    `;
}

let currentSettings = {}; // Firestore から取得した最新の設定を保持するグローバルステート

/**
 * UI の描画
 */
function renderApp(db, docRef) {
    const tabNav = document.getElementById('tab-navigation');
    const contentArea = document.getElementById('tab-content');
    let activeTabId = categories[0].id;

    const updateContent = (categoryId) => {
        const category = categories.find(c => c.id === categoryId);
        if (!category) return;

        // タブの状態更新
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (parseInt(btn.dataset.id) === categoryId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // コンテンツ描画
        contentArea.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="mb-2 sm:mb-4 px-2">
                    <h2 id="category-title" data-customizable="true" class="text-base sm:text-xl font-bold text-cyan-300 border-l-4 border-[#b1a348] pl-3 drop-shadow-glow transition-colors duration-300">
                        ${category.name}
                    </h2>
                    <p id="category-description" data-customizable="true" class="text-[10px] sm:text-sm text-slate-400 mt-1 ml-4 opacity-80 transition-colors duration-300">
                        ${category.description}
                    </p>
                </div>

                <div class="flex-1 grid grid-cols-3 md:grid-cols-5 gap-1 sm:gap-3 overflow-y-auto no-scrollbar pb-4" id="company-grid">
                    ${category.companies.map(company => `
                        <div class="cosmic-card p-1 sm:p-2 group min-h-0" data-customizable="true">
                            <!-- Logo container: flexible scaling to avoid overlap -->
                            <div class="w-full flex-1 min-h-0 flex items-center justify-center p-0.5 sm:p-1 mb-1 sm:mb-2 pointer-events-none overflow-hidden">
                                <div class="w-full h-full max-h-[100%] flex items-center justify-center">
                                    ${createDummyLogo(company)}
                                </div>
                            </div>
                            <!-- Company Name: prioritize displaying full text -->
                            <span class="company-name flex-shrink-0 text-[8px] sm:text-[11px] font-medium leading-tight tracking-wide group-hover:text-cyan-300 transition-colors break-words overflow-hidden pointer-events-none" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
                                ${company}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // 描画直後に現在の設定を適用（永続性の確保）
        const catTitle = document.getElementById('category-title');
        const catDesc = document.getElementById('category-description');
        if (currentSettings.categoryTitleColor && catTitle) {
            catTitle.style.color = currentSettings.categoryTitleColor;
        }
        if (currentSettings.categoryDescriptionColor && catDesc) {
            catDesc.style.color = currentSettings.categoryDescriptionColor;
        }

        // 動的に生成された要素にカスタマイザーを登録（トリガーのみ）
        if (db && docRef) {
            if (catTitle) {
                registerMultiColorCustomizer({
                    triggerElement: catTitle,
                    modalId: 'cat-title-color-picker-modal',
                    fields: [
                        {
                            firestoreField: 'categoryTitleColor',
                            inputId: 'cat-title-color-input',
                            hexId: 'cat-title-color-hex',
                            getCurrentValue: () => catTitle.style.color || window.getComputedStyle(catTitle).color
                        }
                    ],
                    presetBtnSelector: '.preset-cat-title-color-btn',
                    cancelId: 'cat-title-color-picker-cancel',
                    saveId: 'cat-title-color-picker-save',
                    docRef
                });
            }

            if (catDesc) {
                registerMultiColorCustomizer({
                    triggerElement: catDesc,
                    modalId: 'cat-desc-color-picker-modal',
                    fields: [
                        {
                            firestoreField: 'categoryDescriptionColor',
                            inputId: 'cat-desc-color-input',
                            hexId: 'cat-desc-color-hex',
                            getCurrentValue: () => catDesc.style.color || window.getComputedStyle(catDesc).color
                        }
                    ],
                    presetBtnSelector: '.preset-cat-desc-color-btn',
                    cancelId: 'cat-desc-color-picker-cancel',
                    saveId: 'cat-desc-color-picker-save',
                    docRef
                });
            }
        }
    };

    // 初期タブの生成
    tabNav.innerHTML = categories.map(category => `
        <button class="tab-btn px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all duration-300 whitespace-nowrap" 
                data-id="${category.id}" data-customizable="true">
            ${category.name}
        </button>
    `).join('');

    // タブナビゲーション自体のカスタマイザー登録（アクティブ/非アクティブの切り替え）
    if (db && docRef) {
        // アクティブタブ用
        registerMultiColorCustomizer({
            triggerElement: tabNav,
            modalId: 'active-tab-style-modal',
            excludeSelector: '.tab-btn:not(.active)', // 非アクティブ時は無視
            fields: [
                {
                    firestoreField: 'tabActiveTextColor',
                    inputId: 'tab-active-text-input',
                    hexId: 'tab-active-text-hex',
                    getCurrentValue: () => getComputedStyle(document.documentElement).getPropertyValue('--tab-active-text').trim()
                },
                {
                    firestoreField: 'tabActiveBgColor',
                    inputId: 'tab-active-bg-input',
                    hexId: 'tab-active-bg-hex',
                    getCurrentValue: () => getComputedStyle(document.documentElement).getPropertyValue('--tab-active-bg').trim()
                }
            ],
            cancelId: 'active-tab-style-cancel',
            saveId: 'active-tab-style-save',
            docRef
        });

        // 非アクティブタブ用
        registerMultiColorCustomizer({
            triggerElement: tabNav,
            modalId: 'inactive-tab-style-modal',
            excludeSelector: '.tab-btn.active', // アクティブ時は無視
            fields: [
                {
                    firestoreField: 'tabInactiveTextColor',
                    inputId: 'tab-inactive-text-input',
                    hexId: 'tab-inactive-text-hex',
                    getCurrentValue: () => getComputedStyle(document.documentElement).getPropertyValue('--tab-inactive-text').trim()
                },
                {
                    firestoreField: 'tabInactiveBgColor',
                    inputId: 'tab-inactive-bg-input',
                    hexId: 'tab-inactive-bg-hex',
                    getCurrentValue: () => getComputedStyle(document.documentElement).getPropertyValue('--tab-inactive-bg').trim()
                }
            ],
            cancelId: 'inactive-tab-style-cancel',
            saveId: 'inactive-tab-style-save',
            docRef
        });
    }

    // イベントリスナー
    tabNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn) {
            const id = parseInt(btn.dataset.id);
            updateContent(id);
        }
    });

    // 初期表示
    updateContent(activeTabId);
}

document.addEventListener('DOMContentLoaded', () => {
    let db, docRef;
    if (typeof firebase !== 'undefined') {
        db = firebase.firestore();
        docRef = db.collection('pageSettings').doc('renkei');

        // Firestore同期設定（一度だけ登録）
        // CSS Variables を使用して共通化
        const syncFields = [
            { id: 'backgroundColor', apply: (v) => document.body.style.backgroundColor = v },
            { id: 'titleColor', apply: (v) => {
                const el = document.getElementById('page-title');
                if (el) el.style.color = v;
            }},
            { id: 'categoryTitleColor', apply: (v) => {
                const el = document.getElementById('category-title');
                if (el) el.style.color = v;
            }},
            { id: 'categoryDescriptionColor', apply: (v) => {
                const el = document.getElementById('category-description');
                if (el) el.style.color = v;
            }},
            // タブ用（CSS Variables）
            { id: 'tabActiveTextColor', apply: (v) => document.documentElement.style.setProperty('--tab-active-text', v) },
            { id: 'tabActiveBgColor', apply: (v) => document.documentElement.style.setProperty('--tab-active-bg', v) },
            { id: 'tabInactiveTextColor', apply: (v) => document.documentElement.style.setProperty('--tab-inactive-text', v) },
            { id: 'tabInactiveBgColor', apply: (v) => document.documentElement.style.setProperty('--tab-inactive-bg', v) },
            // カード用（CSS Variables / 案A: 自動透明度）
            { id: 'cardTextColor', apply: (v) => document.documentElement.style.setProperty('--card-text', v) },
            { id: 'cardBgColor', apply: (v) => document.documentElement.style.setProperty('--card-bg', v) }
        ];

        docRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                currentSettings = { ...currentSettings, ...data };
                syncFields.forEach(field => {
                    if (data[field.id]) field.apply(data[field.id]);
                });
            }
        });

        // 背景色のカスタマイザー設定
        registerMultiColorCustomizer({
            triggerElement: document.body,
            modalId: 'color-picker-modal',
            fields: [
                {
                    firestoreField: 'backgroundColor',
                    inputId: 'bg-color-input',
                    hexId: 'bg-color-hex',
                    getCurrentValue: () => document.body.style.backgroundColor || window.getComputedStyle(document.body).backgroundColor
                }
            ],
            presetBtnSelector: '.preset-color-btn',
            excludeSelector: 'button, a, [data-customizable="true"], [data-customizable="true"] *, #color-picker-modal, #text-color-picker-modal, #cat-title-color-picker-modal, #cat-desc-color-picker-modal, #active-tab-style-modal, #inactive-tab-style-modal, #card-style-modal',
            cancelId: 'color-picker-cancel',
            saveId: 'color-picker-save',
            docRef
        });

        // 企業カードのカスタマイザー設定（Event Delegation on Static Parent）
        const tabContent = document.getElementById('tab-content');
        if (tabContent) {
            registerMultiColorCustomizer({
                triggerElement: tabContent,
                targetSelector: '.cosmic-card',
                modalId: 'card-style-modal',
                fields: [
                    {
                        firestoreField: 'cardTextColor',
                        inputId: 'card-text-input',
                        hexId: 'card-text-hex',
                        getCurrentValue: () => getComputedStyle(document.documentElement).getPropertyValue('--card-text').trim()
                    },
                    {
                        firestoreField: 'cardBgColor',
                        inputId: 'card-bg-input',
                        hexId: 'card-bg-hex',
                        getCurrentValue: () => getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim()
                    }
                ],
                cancelId: 'card-style-cancel',
                saveId: 'card-style-save',
                docRef
            });
        }

        // タイトル色のカスタマイザー設定
        const title = document.getElementById('page-title');
        if (title) {
            registerMultiColorCustomizer({
                triggerElement: title,
                modalId: 'text-color-picker-modal',
                fields: [
                    {
                        firestoreField: 'titleColor',
                        inputId: 'text-color-input',
                        hexId: 'text-color-hex',
                        getCurrentValue: () => title.style.color || window.getComputedStyle(title).color
                    }
                ],
                presetBtnSelector: '.preset-text-color-btn',
                cancelId: 'text-color-picker-cancel',
                saveId: 'text-color-picker-save',
                docRef
            });
        }
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    renderApp(db, docRef);
});

/**
 * マルチフィールド対応カラーカスタマイザーの登録
 */
function registerMultiColorCustomizer({
    triggerElement,
    targetSelector, // 追加：実際に反応すべき指定要素（指定がなければ triggerElement 全体）
    modalId,
    fields, // 配列: [{ firestoreField, inputId, hexId, getCurrentValue }]
    presetBtnSelector,
    excludeSelector,
    cancelId,
    saveId,
    docRef
}) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const btnCancel = document.getElementById(cancelId);
    const btnSave = document.getElementById(saveId);
    const presetBtns = presetBtnSelector ? document.querySelectorAll(presetBtnSelector) : [];

    // 各フィールドの要素を取得して紐付け
    const fieldElements = fields.map(f => ({
        ...f,
        input: document.getElementById(f.inputId),
        hex: document.getElementById(f.hexId)
    }));

    let longPressTimer;
    const pressDuration = 2000;

    const startPress = (e) => {
        // targetSelector が指定されている場合、ターゲットがその要素内にないなら無視
        if (targetSelector && !e.target.closest(targetSelector)) return;
        
        // 除外セレクタのチェック
        if (excludeSelector && e.target.closest(excludeSelector)) return;
        
        if (triggerElement !== document.body) {
            e.stopPropagation();
        }
        
        longPressTimer = setTimeout(() => {
            showModal();
        }, pressDuration);
    };

    const cancelPress = (e) => {
        if (triggerElement !== document.body) {
            e.stopPropagation();
        }
        clearTimeout(longPressTimer);
    };

    // イベント登録
    triggerElement.addEventListener('mousedown', startPress);
    triggerElement.addEventListener('mouseup', cancelPress);
    triggerElement.addEventListener('mouseleave', cancelPress);
    triggerElement.addEventListener('mousemove', cancelPress);

    triggerElement.addEventListener('touchstart', startPress, { passive: false });
    triggerElement.addEventListener('touchend', cancelPress);
    triggerElement.addEventListener('touchcancel', cancelPress);
    triggerElement.addEventListener('touchmove', cancelPress);

    // モーダル制御
    function showModal() {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }, 10);
        
        // 全フィールドの現在の値を反映
        fieldElements.forEach(f => {
            const currentVal = f.getCurrentValue();
            const hex = colorToHex(currentVal);
            if (hex && f.input) {
                f.input.value = hex;
                if (f.hex) f.hex.textContent = hex;
            }
        });
    }

    function hideModal() {
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }

    // 各入力欄の監視
    fieldElements.forEach(f => {
        if (f.input && f.hex) {
            const onInput = (e) => {
                f.hex.textContent = e.target.value;
            };
            f.input.removeEventListener('input', onInput);
            f.input.addEventListener('input', onInput);
        }
    });

    // プリセットボタン（最初のフィールドにのみ適用する仕様、または用途に合わせて調整）
    presetBtns.forEach(btn => {
        const onClick = (e) => {
            const color = e.target.dataset.color;
            if (color && fieldElements[0].input) {
                fieldElements[0].input.value = color;
                if (fieldElements[0].hex) fieldElements[0].hex.textContent = color;
            }
        };
        btn.removeEventListener('click', onClick);
        btn.addEventListener('click', onClick);
    });

    btnCancel.onclick = hideModal;

    btnSave.onclick = () => {
        const updateData = {};
        fieldElements.forEach(f => {
            if (f.input) updateData[f.firestoreField] = f.input.value;
        });

        docRef.set(updateData, { merge: true })
            .then(() => hideModal())
            .catch(err => {
                console.error(`Error saving multiple fields: `, err);
                hideModal();
            });
    };
}

/**
 * カラー形式変換（略）
 */
function colorToHex(color) {
    if (!color) return null;
    if (color.startsWith('#')) {
        // アルファチャンネル付き (8桁) の場合は 6桁に丸める（標準 color picker 用、必要に応じて調整）
        return color.length === 9 ? color.substring(0, 7) : color;
    }
    
    // rgb / rgba 
    const isRgba = color.includes('rgba');
    const rgb = color.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
        return "#" + rgb.slice(0,3).map(x => 
            parseInt(x).toString(16).padStart(2, '0')
        ).join('');
    }
    return null;
}
