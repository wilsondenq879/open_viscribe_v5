import templateCatalog from '../data/hyperframeTemplates.json';

export const HYPERFRAME_TEMPLATES = templateCatalog;

export function getHyperframeTemplate(templateId) {
    return HYPERFRAME_TEMPLATES.find(template => template.id === templateId) || HYPERFRAME_TEMPLATES[0];
}

export function getHyperframeTemplateDefaults(templateId) {
    return { ...getHyperframeTemplate(templateId).defaults };
}
