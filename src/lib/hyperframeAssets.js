import assetCatalog from '../data/hyperframeAssets.json';

export const HYPERFRAME_ASSETS = assetCatalog;

export function getHyperframeAsset(assetId) {
    return HYPERFRAME_ASSETS.find(asset => asset.id === assetId) || null;
}
