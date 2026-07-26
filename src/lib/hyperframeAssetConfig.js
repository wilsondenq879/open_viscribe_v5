const text = (value, fallback, max = 120) => String(value ?? fallback).replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
const list = (value, fallback, max = 6) => Array.isArray(value) && value.length ? value.slice(0, max) : fallback;
const number = (value, fallback, min = 0, max = 100) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

export const MAP_LOCATIONS = [
    { id: 'us-west', country: '美國', label: 'US WEST', x: 18, y: 47 },
    { id: 'us-east', country: '美國', label: 'US EAST', x: 29, y: 42 },
    { id: 'canada', country: '加拿大', label: 'CANADA', x: 25, y: 29 },
    { id: 'brazil', country: '巴西', label: 'BRAZIL', x: 37, y: 70 },
    { id: 'uk', country: '英國', label: 'UK', x: 51, y: 35 },
    { id: 'germany', country: '德國', label: 'GERMANY', x: 56, y: 39 },
    { id: 'uae', country: '阿拉伯聯合大公國', label: 'UAE', x: 63, y: 50 },
    { id: 'india', country: '印度', label: 'INDIA', x: 70, y: 57 },
    { id: 'singapore', country: '新加坡', label: 'SINGAPORE', x: 78, y: 69 },
    { id: 'japan', country: '日本', label: 'JAPAN', x: 84, y: 42 },
    { id: 'taiwan', country: '台灣', label: 'TAIWAN', x: 80, y: 52 },
    { id: 'australia', country: '澳洲', label: 'SYDNEY', x: 85, y: 78 }
];

const locationById = (id) => MAP_LOCATIONS.find(item => item.id === id) || MAP_LOCATIONS[0];
const mapDefaults = (flow) => ({
    heading: flow ? '跨區資料流向' : '全球服務地圖',
    status: flow ? 'DATA FLOW · ENCRYPTED' : 'NETWORK ONLINE',
    nodes: flow
        ? [{ id: 'source', locationId: 'taiwan', label: '來源：台北' }, { id: 'edge', locationId: 'singapore', label: 'Edge：新加坡' }, { id: 'target', locationId: 'germany', label: '目的：法蘭克福' }]
        : [{ id: 'us', locationId: 'us-west', label: 'US West' }, { id: 'eu', locationId: 'germany', label: 'EU Central' }, { id: 'apac', locationId: 'taiwan', label: 'APAC Taiwan' }],
    routes: flow ? [{ id: 'route-1', from: 'source', to: 'edge' }, { id: 'route-2', from: 'edge', to: 'target' }] : [{ id: 'route-1', from: 'us', to: 'eu' }, { id: 'route-2', from: 'eu', to: 'apac' }]
});

export function getHyperframeAssetConfig(asset, rawValue) {
    const type = asset?.assetType || '';
    const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
    if (type === 'world-map' || type === 'world-flow') {
        const fallback = mapDefaults(type === 'world-flow');
        const nodes = list(raw.nodes, fallback.nodes, 6).map((node, index) => {
            const location = locationById(node?.locationId);
            return { id: text(node?.id, `node-${index + 1}`, 32), locationId: location.id, label: text(node?.label, location.label, 32) };
        });
        const ids = new Set(nodes.map(item => item.id));
        const routes = list(raw.routes, fallback.routes, 8)
            .map((route, index) => ({ id: text(route?.id, `route-${index + 1}`, 32), from: text(route?.from, nodes[0]?.id || '', 32), to: text(route?.to, nodes[1]?.id || '', 32) }))
            .filter(route => ids.has(route.from) && ids.has(route.to) && route.from !== route.to);
        return { heading: text(raw.heading, fallback.heading, 48), status: text(raw.status, fallback.status, 48), nodes, routes };
    }
    if (type === 'data-chart') {
        const fallback = [{ label: 'Week 1', value: 32 }, { label: 'Week 2', value: 58 }, { label: 'Week 3', value: 43 }, { label: 'Week 4', value: 76 }, { label: 'Week 5', value: 92 }];
        return { heading: text(raw.heading, '採用率', 48), unit: text(raw.unit, '%', 12), values: list(raw.values, fallback, 6).map((item, index) => ({ label: text(item?.label, `項目 ${index + 1}`, 20), value: number(item?.value, fallback[index % fallback.length].value, 0, 100) })) };
    }
    if (type === 'flowchart') return { heading: text(raw.heading, '部署流程', 48), steps: list(raw.steps, ['設定', '部署', '驗證'], 4).map((item, index) => text(item, `步驟 ${index + 1}`, 24)) };
    if (type === 'release-roadmap') return { heading: text(raw.heading, '版本路線圖', 48), milestones: list(raw.milestones, ['v1.0', 'v1.5', 'v2.0'], 4).map((item, index) => text(item, `v${index + 1}.0`, 24)) };
    if (type === 'console') return { windowTitle: text(raw.windowTitle, 'deploy@production:~', 50), command: text(raw.command, 'deploy --region apac', 100), lines: list(raw.lines, ['✓ 建立部署工作', '✓ 健康檢查完成', '✓ 流量切換成功'], 5).map((item, index) => text(item, `✓ 執行步驟 ${index + 1}`, 90)) };
    if (type === 'code-diff') return { beforeTitle: text(raw.beforeTitle, 'BEFORE', 28), afterTitle: text(raw.afterTitle, 'AFTER', 28), beforeCode: text(raw.beforeCode, 'region: "legacy"\nretry: false\nstatus: "pending"', 320), afterCode: text(raw.afterCode, 'region: "apac"\nretry: true\nstatus: "ready"', 320) };
    if (type === 'code-typing' || type === 'neon-code') return { fileName: text(raw.fileName, type === 'neon-code' ? 'security.scan' : 'deploy.config.ts', 50), code: text(raw.code, type === 'neon-code' ? 'scan --target production\nstatus: protected' : 'export const region = "apac"\nawait deploy(region)', 320) };
    if (['app-showcase', 'device-reveal', 'liquid-glass'].includes(type)) return { productName: text(raw.productName, 'OpenViscribe', 48), headline: text(raw.headline, '一鍵完成設定', 64), metric: text(raw.metric, '完成率 +48%', 32) };
    if (type === 'social-follow') return { handle: text(raw.handle, '@openviscribe', 48), cta: text(raw.cta, '訂閱追蹤', 32) };
    if (type === 'news-ticker') return { prefix: text(raw.prefix, 'UPDATE', 20), message: text(raw.message, '部署狀態已更新 · 服務健康檢查完成', 160) };
    if (type === 'caption-highlight') return { line: text(raw.line, '三步完成', 48), highlight: text(raw.highlight, '全球部署', 48) };
    return {};
}

export function getMapNodePosition(node) {
    const location = locationById(node?.locationId);
    return { ...location, label: text(node?.label, location.label, 32), id: node?.id };
}
