import { buildProjectExportMetadata, getMediaBlobId } from './projectState';

const DB_NAME = 'WilsonEditorDB';
const STORE_NAME = 'media_blobs';
const FILE_HANDLE_STORE_NAME = 'media_file_handles';
const DB_VERSION = 2;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            // FileSystemFileHandle is structured-cloneable in Chromium.  Keeping the
            // handle lets a large external media library stay on disk instead of
            // copying many gigabytes into the extension's IndexedDB quota.
            if (!db.objectStoreNames.contains(FILE_HANDLE_STORE_NAME)) db.createObjectStore(FILE_HANDLE_STORE_NAME);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function saveBlobToDB(id, blob) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(blob, id);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('DB Save Error', e);
        return false;
    }
}

export async function saveFileHandleToDB(id, handle) {
    if (!id || !handle) return false;
    try {
        const db = await openDB();
        const tx = db.transaction(FILE_HANDLE_STORE_NAME, 'readwrite');
        tx.objectStore(FILE_HANDLE_STORE_NAME).put(handle, id);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('File handle save error', e);
        return false;
    }
}

async function getFileHandleFromDB(id) {
    try {
        const db = await openDB();
        if (!db.objectStoreNames.contains(FILE_HANDLE_STORE_NAME)) return null;
        const tx = db.transaction(FILE_HANDLE_STORE_NAME, 'readonly');
        const req = tx.objectStore(FILE_HANDLE_STORE_NAME).get(id);
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        return null;
    }
}

export async function getBlobFromDB(id) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        const blob = await new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        if (blob) return blob;

        const handle = await getFileHandleFromDB(id);
        return handle ? await handle.getFile() : null;
    } catch (e) {
        try {
            const handle = await getFileHandleFromDB(id);
            return handle ? await handle.getFile() : null;
        } catch (handleError) {
            return null;
        }
    }
}

export function analyzeFrameQuality(imageData) {
    if (!imageData?.data || !imageData.width || !imageData.height) {
        return { clarityScore: 0, loadingScore: 0, isBlurry: false, isLikelyLoading: false };
    }

    const { data, width, height } = imageData;
    const step = 8;
    let sampled = 0;
    let totalSaturation = 0;
    let totalLuma = 0;
    let totalLumaSq = 0;
    let edgeScore = 0;
    let centerBrightCount = 0;
    let centerNeutralCount = 0;
    let centerSamples = 0;

    const lumaAt = (x, y) => {
        const idx = (y * width + x) * 4;
        return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    };

    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            const saturation = max === 0 ? 0 : (max - min) / max;

            totalSaturation += saturation;
            totalLuma += luma;
            totalLumaSq += luma * luma;
            sampled++;

            if (x + step < width && y + step < height) {
                const dx = Math.abs(luma - lumaAt(x + step, y));
                const dy = Math.abs(luma - lumaAt(x, y + step));
                edgeScore += dx + dy;
            }

            const inCenter = x > width * 0.3 && x < width * 0.7 && y > height * 0.2 && y < height * 0.75;
            if (inCenter) {
                centerSamples++;
                if (luma > 155) centerBrightCount++;
                if (Math.abs(r - g) < 16 && Math.abs(g - b) < 16) centerNeutralCount++;
            }
        }
    }

    if (!sampled) return { clarityScore: 0, loadingScore: 0, isBlurry: false, isLikelyLoading: false };

    const avgSaturation = totalSaturation / sampled;
    const avgLuma = totalLuma / sampled;
    const variance = Math.max(0, totalLumaSq / sampled - avgLuma * avgLuma);
    const contrastScore = Math.sqrt(variance) / 64;
    const normalizedEdgeScore = edgeScore / Math.max(1, sampled) / 30;
    const centerBrightRatio = centerSamples ? centerBrightCount / centerSamples : 0;
    const centerNeutralRatio = centerSamples ? centerNeutralCount / centerSamples : 0;

    const clarityScore = normalizedEdgeScore * 0.65 + contrastScore * 0.25 + avgSaturation * 0.1;
    const loadingScore = centerBrightRatio * 0.45 + centerNeutralRatio * 0.35 + Math.max(0, 0.2 - avgSaturation) * 2 + Math.max(0, 0.28 - normalizedEdgeScore) * 1.6;

    return {
        clarityScore,
        loadingScore,
        isBlurry: clarityScore < 0.32,
        isLikelyLoading: loadingScore > 0.72
    };
}

export function pickBestScreenshotFrame(frames, targetTime, usedFrameIds, preferredClickId = '') {
    if (!frames?.length) return null;

    const idealSettledTime = targetTime + 0.45;
    const minimumSettledDelay = 0.18;
    const maximumSettledDelay = 2.2;

    const evaluateCandidate = (frame) => {
        const delayFromAction = frame.relativeTime - targetTime;
        const settledTimeDiff = Math.abs(frame.relativeTime - idealSettledTime);
        const qualityBonus = (frame.clarityScore || 0) * 0.9;
        const loadingPenalty = (frame.loadingScore || 0) * 1.2;
        const blurryPenalty = frame.isBlurry ? 0.8 : 0;
        const loadingHardPenalty = frame.isLikelyLoading ? 1.4 : 0;
        const tooEarlyPenalty = delayFromAction < minimumSettledDelay
            ? (minimumSettledDelay - delayFromAction) * 2.4 + (preferredClickId && frame.rippleForClickId === preferredClickId ? 0.9 : 0.35)
            : 0;
        const tooLatePenalty = delayFromAction > maximumSettledDelay
            ? (delayFromAction - maximumSettledDelay) * 0.8
            : 0;
        const beforeActionPenalty = delayFromAction < -0.02 ? Math.abs(delayFromAction) * 2.8 + 0.6 : 0;
        const preferredSettledBonus = preferredClickId && frame.rippleForClickId === preferredClickId && delayFromAction >= minimumSettledDelay ? 0.18 : 0;
        return settledTimeDiff + tooEarlyPenalty + tooLatePenalty + beforeActionPenalty + loadingPenalty + blurryPenalty + loadingHardPenalty - qualityBonus - preferredSettledBonus;
    };

    const sorted = [...frames]
        .filter(frame => !usedFrameIds.has(frame.frameId))
        .sort((a, b) => evaluateCandidate(a) - evaluateCandidate(b));

    const primary = sorted.find(frame => {
        const delayFromAction = frame.relativeTime - targetTime;
        const withinRange = delayFromAction >= minimumSettledDelay && delayFromAction <= 1.8;
        return withinRange && !frame.isLikelyLoading && !frame.isBlurry && (frame.clarityScore || 0) >= 0.38;
    });
    if (primary) return primary;

    const secondary = sorted.find(frame => {
        const delayFromAction = frame.relativeTime - targetTime;
        const withinRange = delayFromAction >= minimumSettledDelay && delayFromAction <= maximumSettledDelay;
        return withinRange && !frame.isLikelyLoading && (frame.clarityScore || 0) >= 0.3;
    });
    if (secondary) return secondary;

    const fallback = sorted.find(frame => {
        const delayFromAction = frame.relativeTime - targetTime;
        return delayFromAction >= 0.1 && delayFromAction <= 2.6;
    });
    return fallback || sorted[0] || null;
}

export async function relinkProjectFromDirectory(state, dirHandle) {
    if (!state || !dirHandle) return 0;

    const { videoByBlobId, audioByBlobId } = buildProjectExportMetadata(state);
    let restoredCount = 0;
    const relinkedByBlobId = new Map();

    const tryRestoreItem = async (item) => {
        if (!item || item.src) return;
        const blobId = getMediaBlobId(item);
        if (!blobId) return;

        if (relinkedByBlobId.has(blobId)) {
            item.src = relinkedByBlobId.get(blobId);
            restoredCount += 1;
            return;
        }

        const candidates = [
            item.exportFileName,
            videoByBlobId.get(blobId),
            audioByBlobId.get(blobId)
        ].filter(Boolean);

        for (const filename of candidates) {
            try {
                const fileHandle = await dirHandle.getFileHandle(filename);
                const file = await fileHandle.getFile();
                const url = URL.createObjectURL(file);
                item.src = url;
                relinkedByBlobId.set(blobId, url);
                await saveBlobToDB(blobId, file);
                restoredCount += 1;
                return;
            } catch (err) {}
        }
    };

    for (const track of state.tracks || []) {
        for (const item of track || []) await tryRestoreItem(item);
    }
    for (const track of state.audioTracks || []) {
        for (const item of track || []) await tryRestoreItem(item);
    }
    for (const item of state.assets || []) await tryRestoreItem(item);

    return restoredCount;
}

async function rehydrateMediaCollection(collection = []) {
    for (const entry of collection) {
        if (!entry) continue;
        const blobId = getMediaBlobId(entry);
        if (!blobId) continue;
        const blob = await getBlobFromDB(blobId);
        if (blob) entry.src = URL.createObjectURL(blob);
    }
}

export async function rehydrateProjectMedia(state) {
    if (!state) return state;
    await Promise.all([
        ...(state.tracks || []).map(track => rehydrateMediaCollection(track)),
        ...(state.audioTracks || []).map(track => rehydrateMediaCollection(track)),
        rehydrateMediaCollection(state.assets || [])
    ]);
    return state;
}
