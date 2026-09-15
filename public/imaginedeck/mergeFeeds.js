const UPCOMING_JSON_URL = 'https://imagine-deck-feed.firebaseapp.com/upcoming.json';
const PAST_JSON_URL = 'https://imagine-deck-feed.firebaseapp.com/past.json';

function normalizeItem(raw) {
    return {
        id: String(raw.id),
        kind: raw.kind || '',
        date: raw.date || '',
        endDate: raw.endDate || '',
        start: raw.start || '',
        end: raw.end || '',
        title: raw.title || '',
        type: raw.type || 'other',
        organizer: raw.organizer || '',
        excerpt: raw.excerpt || '',
        image: raw.image || '',
        isMultiDay: Boolean(raw.endDate && raw.endDate !== raw.date),
        isReserved: (raw.title || '') === '予約あり',
        hasTime: Boolean(raw.start),
    };
}

function mergeFeeds(upcomingFeed, pastFeed) {
    const byId = new Map();
    const ingest = (feed) => {
        const items = (feed && Array.isArray(feed.items)) ? feed.items : [];
        for (const raw of items) {
            const norm = normalizeItem(raw);
            if (byId.has(norm.id)) {
                const prev = byId.get(norm.id);
                const merged = { ...prev };
                for (const [k, v] of Object.entries(norm)) {
                    if (v !== '' && v !== false && (prev[k] === '' || prev[k] === false || prev[k] == null)) {
                        merged[k] = v;
                    }
                }
                byId.set(norm.id, merged);
            } else {
                byId.set(norm.id, norm);
            }
        }
    };
    ingest(upcomingFeed);
    ingest(pastFeed);

    const all = Array.from(byId.values());
    const upcoming = all.filter(e => e.kind === 'upcoming')
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const past = all.filter(e => e.kind === 'past')
        .sort((a, b) => b.date.localeCompare(a.date));

    return { merged: [...upcoming, ...past], upcoming, past };
}

async function loadMergedEvents({ upcomingLimit = 20, pastLimit = 50 } = {}) {
    try {
        const [ur, pr] = await Promise.all([
            fetch(UPCOMING_JSON_URL, {cache:'no-store'}).catch(e => { console.warn('[DEBUG] Failed to fetch upcoming JSON', e); return null; }),
            fetch(PAST_JSON_URL, {cache:'no-store'}).catch(e => { console.warn('[DEBUG] Failed to fetch past JSON', e); return null; })
        ]);

        const uf = (ur && ur.ok) ? await ur.json().catch(e => { console.warn('[DEBUG] Failed to parse upcoming JSON', e); return null; }) : null;
        const pf = (pr && pr.ok) ? await pr.json().catch(e => { console.warn('[DEBUG] Failed to parse past JSON', e); return null; }) : null;
        const data = mergeFeeds(uf, pf);
        const upcoming = data.upcoming.slice(0, upcomingLimit);
        const past = data.past.slice(0, pastLimit);

        return { merged: [...upcoming, ...past], upcoming, past };
    } catch (error) {
        console.warn('[DEBUG] Failed to load merged events', error);
        return { merged: [], upcoming: [], past: [] };
    }
}
